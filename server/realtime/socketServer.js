import { Server } from 'socket.io';
import pool from '../conn.js';
import { gradeParticipant } from '../services/examGradingService.js';

const examRoom = (examId) => `exam:${examId}`;
const studentRoom = (studentId) => `student:${studentId}`;
const sendAck = (ack, result) => { if (typeof ack === 'function') ack(result); };
let activeIO;
const awayGraceTimers = new Map();
const AWAY_GRACE_MS = 5000;
const MAX_SECURITY_VIOLATIONS = 3;
const SECURITY_VIOLATION_KINDS = [
  'tab_switch', 'fullscreen_exit', 'window_blur',
  'copy', 'paste', 'cut', 'blocked_shortcut', 'context_menu',
];

const clearAwayGrace = (participantId) => {
  const grace = awayGraceTimers.get(String(participantId));
  if (grace?.timer) clearTimeout(grace.timer);
  awayGraceTimers.delete(String(participantId));
};

const submitParticipantAfterGrace = async (io, examId, participantId) => {
  const client = await pool.connect();
  let score;
  let totalMarks;
  try {
    await client.query('BEGIN');
    const participant = await client.query(
      `SELECT p.status, p.terminated_at, s.status AS exam_status, e.total_marks
       FROM exam_participants p
       JOIN exam_live_sessions s ON s.exam_id = p.exam_id
       JOIN exams e ON e.id = p.exam_id
       WHERE p.id = $1 AND p.exam_id = $2
       FOR UPDATE OF p`,
      [participantId, examId]
    );
    if (!participant.rowCount || participant.rows[0].terminated_at || participant.rows[0].status === 'submitted') {
      await client.query('COMMIT');
      return;
    }
    if (participant.rows[0].exam_status !== 'live') {
      await client.query('COMMIT');
      return;
    }
    score = await gradeParticipant(client, examId, participantId);
    totalMarks = Number(participant.rows[0].total_marks || 0);
    await client.query(
      `UPDATE exam_participants
       SET status = 'submitted', submitted_at = NOW(), score = $1
       WHERE id = $2`,
      [score, participantId]
    );
    await client.query(
      `INSERT INTO exam_violations (exam_id, participant_id, kind, details)
       VALUES ($1, $2, 'away_timeout', 'Student did not return to the exam within the 5-second grace period.')`,
      [examId, participantId]
    );
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
  io.to(studentRoom(participantId)).emit('student:result', { score, totalMarks, submittedFor: 'away_timeout' });
  const state = await getManagerState(examId);
  io.to(examRoom(examId)).emit('exam:manager_state', state);
};

const recordAttemptViolation = async (io, examId, participantId, kind, details) => {
  const client = await pool.connect();
  let outcome = { recorded: false, locked: false, count: 0 };
  let score;
  let totalMarks;
  try {
    await client.query('BEGIN');
    const participant = await client.query(
      `SELECT p.status, p.terminated_at, p.attempt_started_at,
              s.status AS exam_status, e.total_marks
       FROM exam_participants p
       JOIN exam_live_sessions s ON s.exam_id = p.exam_id
       JOIN exams e ON e.id = p.exam_id
       WHERE p.id = $1 AND p.exam_id = $2
       FOR UPDATE OF p`,
      [participantId, examId]
    );
    if (!participant.rowCount || participant.rows[0].terminated_at
      || participant.rows[0].status === 'submitted'
      || !participant.rows[0].attempt_started_at
      || participant.rows[0].exam_status !== 'live') {
      await client.query('COMMIT');
      return outcome;
    }
    await client.query(
      `INSERT INTO exam_violations (exam_id, participant_id, kind, details)
       VALUES ($1, $2, $3, $4)`,
      [examId, participantId, kind, details]
    );
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM exam_violations
       WHERE participant_id = $1 AND kind = ANY($2::text[])`,
      [participantId, SECURITY_VIOLATION_KINDS]
    );
    outcome = { recorded: true, locked: countResult.rows[0].count >= MAX_SECURITY_VIOLATIONS, count: countResult.rows[0].count };
    if (outcome.locked) {
      score = await gradeParticipant(client, examId, participantId);
      totalMarks = Number(participant.rows[0].total_marks || 0);
      await client.query(
        `UPDATE exam_participants
         SET terminated_at = NOW(), status = 'submitted', submitted_at = NOW(), score = $1
         WHERE id = $2`,
        [score, participantId]
      );
      await client.query(
        `INSERT INTO exam_violations (exam_id, participant_id, kind, details)
         VALUES ($1, $2, 'security_lockout', $3)`,
        [examId, participantId, `Attempt locked after ${MAX_SECURITY_VIOLATIONS} security violations.`]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
  if (outcome.locked) {
    clearAwayGrace(participantId);
    io.to(studentRoom(participantId)).emit('student:terminated', {
      locked: true,
      message: `Your attempt was locked after ${MAX_SECURITY_VIOLATIONS} security violations.`,
    });
    io.to(studentRoom(participantId)).emit('student:result', { score, totalMarks, submittedFor: 'security_lockout' });
  }
  if (outcome.recorded) io.to(examRoom(examId)).emit('exam:manager_state', await getManagerState(examId));
  return outcome;
};

const beginAwayGrace = async (io, examId, participantId, kind, details) => {
  const key = String(participantId);
  if (awayGraceTimers.has(key)) return;
  awayGraceTimers.set(key, { pending: true });
  try {
    const participant = await pool.query(
      `SELECT p.status, p.terminated_at, p.attempt_started_at, s.status AS exam_status
       FROM exam_participants p
       JOIN exam_live_sessions s ON s.exam_id = p.exam_id
       WHERE p.id = $1 AND p.exam_id = $2`,
      [participantId, examId]
    );
    if (!participant.rowCount || participant.rows[0].terminated_at || participant.rows[0].status === 'submitted' || !participant.rows[0].attempt_started_at || participant.rows[0].exam_status !== 'live') {
      clearAwayGrace(participantId);
      return;
    }
    if (!awayGraceTimers.has(key)) return;
    const outcome = await recordAttemptViolation(io, examId, participantId, kind, details);
    if (outcome.locked || !outcome.recorded) {
      clearAwayGrace(participantId);
      return;
    }
    if (!awayGraceTimers.has(key)) return;
    const timer = setTimeout(() => {
      awayGraceTimers.delete(key);
      submitParticipantAfterGrace(io, examId, participantId).catch((error) => {
        console.error('[Socket.IO] Could not submit student after away grace:', error.message);
      });
    }, AWAY_GRACE_MS);
    awayGraceTimers.set(key, { timer });
  } catch (error) {
    if (awayGraceTimers.get(key)?.pending) awayGraceTimers.delete(key);
    throw error;
  }
};

const participantShape = (row) => ({
  id: row.id,
  fullName: row.full_name,
  rollNumber: row.roll_number,
  joinedAt: row.joined_at,
  lastSeenAt: row.last_seen_at,
  status: row.terminated_at ? 'terminated' : row.status,
  extraTimeSeconds: row.extra_time_seconds || 0,
  attemptStartedAt: row.attempt_started_at,
  attemptEndsAt: row.attempt_ends_at,
  score: row.score == null ? null : Number(row.score),
  violationCount: Number(row.violation_count || 0),
  answeredCount: Number(row.answered_count || 0),
});

const getManagerState = async (examId) => {
  const [sessionResult, studentsResult, violationsResult, questionCountResult] = await Promise.all([
    pool.query(
      `SELECT status, started_at, ends_at, finished_at
       FROM exam_live_sessions WHERE exam_id = $1`,
      [examId]
    ),
    pool.query(
      `SELECT p.id, p.full_name, p.roll_number, p.joined_at, p.last_seen_at,
              p.status, p.extra_time_seconds, p.attempt_started_at, p.attempt_ends_at,
              p.terminated_at, p.score,
              COUNT(DISTINCT v.id)::int AS violation_count,
              COUNT(DISTINCT ea.exam_question_id)::int AS answered_count
       FROM exam_participants p
       LEFT JOIN exam_violations v ON v.participant_id = p.id
       LEFT JOIN exam_answers ea ON ea.participant_id = p.id
       WHERE p.exam_id = $1
       GROUP BY p.id
       ORDER BY p.joined_at ASC`,
      [examId]
    ),
    pool.query(
      `SELECT v.id, v.kind, v.details, v.occurred_at,
              p.full_name, p.roll_number
       FROM exam_violations v
       JOIN exam_participants p ON p.id = v.participant_id
       WHERE v.exam_id = $1
       ORDER BY v.occurred_at DESC LIMIT 50`,
      [examId]
    ),
    pool.query('SELECT COUNT(*)::int AS count FROM exam_questions WHERE exam_id = $1', [examId]),
  ]);
  return {
    examId: String(examId),
    liveSession: sessionResult.rows[0] ? {
      status: sessionResult.rows[0].status,
      startedAt: sessionResult.rows[0].started_at,
      endsAt: sessionResult.rows[0].ends_at,
      finishedAt: sessionResult.rows[0].finished_at,
    } : { status: 'waiting', startedAt: null, endsAt: null, finishedAt: null },
    students: studentsResult.rows.map(participantShape),
    questionCount: questionCountResult.rows[0]?.count || 0,
    violations: violationsResult.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      details: row.details,
      occurredAt: row.occurred_at,
      fullName: row.full_name,
      rollNumber: row.roll_number,
    })),
  };
};

export const refreshExamManager = async (examId) => {
  if (!activeIO) return;
  const state = await getManagerState(examId);
  activeIO.to(examRoom(examId)).emit('exam:manager_state', state);
};

export const refreshExamQuestions = async (examId) => {
  if (!activeIO) return;
  const session = await pool.query(
    `SELECT status FROM exam_live_sessions WHERE exam_id = $1`,
    [examId]
  );
  if (session.rows[0]?.status === 'live') activeIO.to(examRoom(examId)).emit('exam:questions_updated');
  await refreshExamManager(examId);
};

const ownsPublishedExam = async (examId, teacherId) => {
  const result = await pool.query(
    `SELECT id, duration, title FROM exams
     WHERE id = $1 AND created_by = $2 AND status = 'published'`,
    [examId, teacherId]
  );
  return result.rows[0] || null;
};

const finishExam = async (io, examId) => {
  const client = await pool.connect();
  const results = [];
  try {
    await client.query('BEGIN');
    const session = await client.query(
      `SELECT status FROM exam_live_sessions WHERE exam_id = $1 FOR UPDATE`,
      [examId]
    );
    if (!session.rowCount) throw new Error('Start this exam before finishing it.');
    if (session.rows[0].status === 'finished') {
      await client.query('COMMIT');
      return;
    }

    const participants = await client.query(
      'SELECT id FROM exam_participants WHERE exam_id = $1 AND terminated_at IS NULL',
      [examId]
    );
    for (const participant of participants.rows) {
      const score = await gradeParticipant(client, examId, participant.id);
      await client.query(
        `UPDATE exam_participants
         SET status = 'submitted', submitted_at = COALESCE(submitted_at, NOW()), score = $1
         WHERE id = $2`,
        [score, participant.id]
      );
      results.push({ participantId: participant.id, score });
    }
    await client.query(
      `UPDATE exam_live_sessions
       SET status = 'finished', finished_at = NOW(), updated_at = NOW()
       WHERE exam_id = $1`,
      [examId]
    );
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
  const exam = await pool.query('SELECT total_marks FROM exams WHERE id = $1', [examId]);
  for (const result of results) {
    io.to(studentRoom(result.participantId)).emit('student:result', {
      score: result.score,
      totalMarks: Number(exam.rows[0]?.total_marks || 0),
    });
  }
  const state = await getManagerState(examId);
  io.to(examRoom(examId)).emit('exam:manager_state', state);
  io.to(examRoom(examId)).emit('exam:session', state.liveSession);
};

const processExpiredExam = async (io, examId) => {
  const due = await pool.query(
    `SELECT p.id
     FROM exam_participants p
     JOIN exam_live_sessions s ON s.exam_id = p.exam_id
     WHERE p.exam_id = $1 AND p.terminated_at IS NULL AND p.status <> 'submitted'
       AND p.attempt_started_at IS NOT NULL AND p.attempt_ends_at IS NOT NULL
       AND s.status = 'live'
       AND p.attempt_ends_at + (p.extra_time_seconds * INTERVAL '1 second') <= NOW()`,
    [examId]
  );
  const exam = await pool.query('SELECT total_marks FROM exams WHERE id = $1', [examId]);
  for (const participant of due.rows) {
    const client = await pool.connect();
    let score;
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT status, terminated_at, attempt_ends_at, extra_time_seconds
         FROM exam_participants WHERE id = $1 FOR UPDATE`,
        [participant.id]
      );
      if (!current.rowCount || current.rows[0].status === 'submitted' || current.rows[0].terminated_at
        || !current.rows[0].attempt_ends_at
        || new Date(current.rows[0].attempt_ends_at).getTime() + Number(current.rows[0].extra_time_seconds || 0) * 1000 > Date.now()) {
        await client.query('COMMIT');
        continue;
      }
      score = await gradeParticipant(client, examId, participant.id);
      await client.query(
        `UPDATE exam_participants
         SET status = 'submitted', submitted_at = NOW(), score = $1
         WHERE id = $2`,
        [score, participant.id]
      );
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
    io.to(studentRoom(participant.id)).emit('student:result', {
      score,
      totalMarks: Number(exam.rows[0]?.total_marks || 0),
    });
  }

  await refreshExamManager(examId);
};

export const createSocketServer = (httpServer, sessionMiddleware) => {
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });
  activeIO = io;
  io.engine.use(sessionMiddleware);
  io.use((socket, next) => {
    const session = socket.request.session;
    if (session?.teacher) {
      socket.data.role = 'teacher';
      socket.data.userId = session.teacher.id;
      return next();
    }
    if (session?.student?.id && session.student.examId) {
      socket.data.role = 'student';
      socket.data.student = session.student;
      return next();
    }
    return next(new Error('Sign in or join an exam before connecting.'));
  });

  io.on('connection', async (socket) => {
    if (socket.data.role === 'student') {
      const student = socket.data.student;
      try {
        const result = await pool.query(
          `SELECT p.id, p.exam_id, p.full_name, p.roll_number, p.joined_at,
                  p.extra_time_seconds, p.terminated_at, p.attempt_started_at, p.attempt_ends_at,
                  p.score, e.total_marks, s.status AS exam_status, s.ends_at
           FROM exam_participants p
           JOIN exams e ON e.id = p.exam_id
           LEFT JOIN exam_live_sessions s ON s.exam_id = p.exam_id
           WHERE p.id = $1 AND p.exam_id = $2 AND e.status = 'published'`,
          [student.id, student.examId]
        );
        const row = result.rows[0];
        if (!row || row.terminated_at) return socket.disconnect(true);
        clearAwayGrace(row.id);
        socket.data.examId = String(row.exam_id);
        socket.join(examRoom(row.exam_id));
        socket.join(studentRoom(row.id));
        if (row.exam_status !== 'finished') {
          await pool.query(
            `UPDATE exam_participants
             SET status = 'connected', last_seen_at = NOW()
             WHERE id = $1`,
            [row.id]
          );
        }
        const state = await getManagerState(row.exam_id);
        socket.emit('student:session_state', {
          liveSession: state.liveSession,
          extraTimeSeconds: row.extra_time_seconds,
          attemptStartedAt: row.attempt_started_at,
          attemptEndsAt: row.attempt_ends_at,
          student: { id: row.id, fullName: row.full_name, rollNumber: row.roll_number },
          result: row.score == null ? null : { score: Number(row.score), totalMarks: Number(row.total_marks) },
        });
        io.to(examRoom(row.exam_id)).emit('exam:manager_state', state);
        if (row.exam_status === 'live') socket.emit('student:returned', { graceCancelled: true });
        socket.data.presenceTimer = setInterval(() => {
          pool.query(
            `UPDATE exam_participants SET last_seen_at = NOW()
             WHERE id = $1 AND status = 'connected' AND terminated_at IS NULL`,
            [row.id]
          ).catch((error) => console.error('[Socket.IO] Presence heartbeat failed:', error.message));
        }, 15000);
      } catch (error) {
        console.error('[Socket.IO] Could not initialize student socket:', error.message);
        socket.disconnect(true);
      }
    }

    socket.on('teacher:join_exam', async ({ examId } = {}, ack) => {
      if (socket.data.role !== 'teacher') return sendAck(ack, { success: false, message: 'Teacher sign-in required.' });
      try {
        if (!await ownsPublishedExam(examId, socket.data.userId)) {
          return sendAck(ack, { success: false, message: 'Published exam not found.' });
        }
        if (socket.data.examId) socket.leave(examRoom(socket.data.examId));
        socket.data.examId = String(examId);
        socket.join(examRoom(examId));
        sendAck(ack, { success: true, state: await getManagerState(examId) });
      } catch (error) {
        sendAck(ack, { success: false, message: error.message });
      }
    });

    const requireManagedExam = async (examId) => {
      if (socket.data.role !== 'teacher' || String(socket.data.examId) !== String(examId)) {
        throw new Error('Select and join this exam before managing it.');
      }
      const exam = await ownsPublishedExam(examId, socket.data.userId);
      if (!exam) throw new Error('Published exam not found.');
      return exam;
    };

    const replyWithState = async (examId, ack, extra = {}) => {
      const state = await getManagerState(examId);
      io.to(examRoom(examId)).emit('exam:manager_state', state);
      sendAck(ack, { success: true, state, ...extra });
    };

    socket.on('teacher:start_exam', async ({ examId } = {}, ack) => {
      try {
        await requireManagedExam(examId);
        const current = await pool.query('SELECT status FROM exam_live_sessions WHERE exam_id = $1', [examId]);
        if (current.rows[0]?.status === 'finished') throw new Error('A finished exam cannot be started again.');
        const result = await pool.query(
          `INSERT INTO exam_live_sessions (exam_id, status, started_at, ends_at, updated_at)
           VALUES ($1, 'live', NULL, NULL, NOW())
           ON CONFLICT (exam_id) DO UPDATE
           SET status = 'live',
               updated_at = NOW()
           RETURNING status, started_at, ends_at, finished_at`,
          [examId]
        );
        const liveSession = {
          status: result.rows[0].status,
          startedAt: result.rows[0].started_at,
          endsAt: result.rows[0].ends_at,
          finishedAt: result.rows[0].finished_at,
        };
        io.to(examRoom(examId)).emit('exam:session', liveSession);
        await replyWithState(examId, ack);
      } catch (error) { sendAck(ack, { success: false, message: error.message }); }
    });

    socket.on('teacher:adjust_exam_time', async ({ examId, minutes } = {}, ack) => {
      try {
        await requireManagedExam(examId);
        const delta = Number(minutes);
        if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 240) throw new Error('Time change must be between 1 and 240 minutes.');
        const client = await pool.connect();
        let updatedParticipants;
        try {
          await client.query('BEGIN');
          const changed = await client.query(
            `UPDATE exam_live_sessions
             SET duration_adjustment_seconds = duration_adjustment_seconds + ($2 * 60), updated_at = NOW()
             WHERE exam_id = $1 AND status = 'live'
             RETURNING exam_id`,
            [examId, delta]
          );
          if (!changed.rowCount) throw new Error('Start the exam before changing its time.');
          updatedParticipants = await client.query(
            `UPDATE exam_participants
             SET attempt_ends_at = GREATEST(NOW(), attempt_ends_at + ($2 * INTERVAL '1 minute'))
             WHERE exam_id = $1 AND attempt_started_at IS NOT NULL AND attempt_ends_at IS NOT NULL
               AND status <> 'submitted' AND terminated_at IS NULL
             RETURNING id, attempt_ends_at, extra_time_seconds`,
            [examId, delta]
          );
          await client.query('COMMIT');
        } catch (error) {
          try { await client.query('ROLLBACK'); } catch {}
          throw error;
        } finally {
          client.release();
        }
        for (const participant of updatedParticipants.rows) {
          io.to(studentRoom(participant.id)).emit('student:attempt_time_adjusted', {
            attemptEndsAt: participant.attempt_ends_at,
            extraTimeSeconds: participant.extra_time_seconds,
          });
        }
        await processExpiredExam(io, examId);
        await replyWithState(examId, ack);
      } catch (error) { sendAck(ack, { success: false, message: error.message }); }
    });

    socket.on('teacher:adjust_student_time', async ({ examId, studentId, minutes } = {}, ack) => {
      try {
        await requireManagedExam(examId);
        const delta = Number(minutes);
        if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 240) throw new Error('Time change must be between 1 and 240 minutes.');
        const result = await pool.query(
          `UPDATE exam_participants
           SET extra_time_seconds = GREATEST(0, extra_time_seconds + ($3 * 60)), last_seen_at = NOW()
           WHERE id = $1 AND exam_id = $2 AND terminated_at IS NULL
           RETURNING extra_time_seconds`,
          [studentId, examId, delta]
        );
        if (!result.rowCount) throw new Error('Student not found in this exam.');
        io.to(studentRoom(studentId)).emit('student:time_adjusted', { extraTimeSeconds: result.rows[0].extra_time_seconds });
        await replyWithState(examId, ack);
      } catch (error) { sendAck(ack, { success: false, message: error.message }); }
    });

    socket.on('teacher:warn_student', async ({ examId, studentId, message } = {}, ack) => {
      try {
        await requireManagedExam(examId);
        const text = typeof message === 'string' ? message.trim().slice(0, 500) : '';
        if (!text) throw new Error('Write a warning message first.');
        const student = await pool.query(
          `SELECT id FROM exam_participants
           WHERE id = $1 AND exam_id = $2 AND terminated_at IS NULL`,
          [studentId, examId]
        );
        if (!student.rowCount) throw new Error('Student not found in this exam.');
        await pool.query(
          `INSERT INTO exam_violations (exam_id, participant_id, kind, details)
           VALUES ($1, $2, 'teacher_warning', $3)`,
          [examId, studentId, text]
        );
        io.to(studentRoom(studentId)).emit('student:warning', { message: text });
        await replyWithState(examId, ack);
      } catch (error) { sendAck(ack, { success: false, message: error.message }); }
    });

    socket.on('teacher:terminate_student', async ({ examId, studentId } = {}, ack) => {
      try {
        await requireManagedExam(examId);
        const result = await pool.query(
          `UPDATE exam_participants SET terminated_at = NOW(), status = 'disconnected'
           WHERE id = $1 AND exam_id = $2 AND terminated_at IS NULL RETURNING id`,
          [studentId, examId]
        );
        if (!result.rowCount) throw new Error('Student not found or already terminated.');
        await pool.query(
          `INSERT INTO exam_violations (exam_id, participant_id, kind, details)
           VALUES ($1, $2, 'terminated', 'Session terminated by teacher')`,
          [examId, studentId]
        );
        io.to(studentRoom(studentId)).emit('student:terminated', { message: 'Your exam session was ended by the teacher.' });
        await replyWithState(examId, ack);
      } catch (error) { sendAck(ack, { success: false, message: error.message }); }
    });

    socket.on('teacher:finish_exam', async ({ examId } = {}, ack) => {
      try {
        await requireManagedExam(examId);
        await finishExam(io, examId);
        sendAck(ack, { success: true, state: await getManagerState(examId) });
      } catch (error) { sendAck(ack, { success: false, message: error.message }); }
    });

    socket.on('student:violation', async ({ kind, details } = {}) => {
      if (socket.data.role !== 'student' || !socket.data.examId) return;
      try {
        const allowedKinds = new Set(['copy', 'paste', 'cut', 'blocked_shortcut', 'context_menu']);
        if (!allowedKinds.has(kind)) return;
        await recordAttemptViolation(
          io,
          socket.data.examId,
          socket.data.student.id,
          kind,
          typeof details === 'string' ? details.slice(0, 500) : ''
        );
      } catch (error) {
        console.error('[Socket.IO] Could not record student violation:', error.message);
      }
    });

    socket.on('student:away', async ({ kind = 'tab_switch', details = 'Student left the exam screen.' } = {}) => {
      if (socket.data.role !== 'student' || !socket.data.examId) return;
      const allowedKinds = new Set(['tab_switch', 'fullscreen_exit', 'window_blur']);
      if (!allowedKinds.has(kind)) return;
      try {
        await beginAwayGrace(io, socket.data.examId, socket.data.student.id, kind, String(details).slice(0, 500));
      } catch (error) {
        console.error('[Socket.IO] Could not start student away grace:', error.message);
      }
    });

    socket.on('student:returned', async () => {
      if (socket.data.role !== 'student' || !socket.data.examId) return;
      const participantId = socket.data.student.id;
      const hadGrace = awayGraceTimers.has(String(participantId));
      clearAwayGrace(participantId);
      if (!hadGrace) return;
      try {
        await pool.query(
          `UPDATE exam_participants SET last_seen_at = NOW()
           WHERE id = $1 AND exam_id = $2 AND status <> 'submitted' AND terminated_at IS NULL`,
          [participantId, socket.data.examId]
        );
        socket.emit('student:returned', { graceCancelled: true });
        io.to(examRoom(socket.data.examId)).emit('exam:manager_state', await getManagerState(socket.data.examId));
      } catch (error) {
        console.error('[Socket.IO] Could not mark student returned:', error.message);
      }
    });

    socket.on('disconnect', async () => {
      if (socket.data.role !== 'student' || !socket.data.student?.id || !socket.data.examId) return;
      clearInterval(socket.data.presenceTimer);
      try {
        const otherSockets = await io.in(studentRoom(socket.data.student.id)).fetchSockets();
        if (otherSockets.length) return;
        const examStatus = await pool.query('SELECT status FROM exam_live_sessions WHERE exam_id = $1', [socket.data.examId]);
        if (examStatus.rows[0]?.status === 'live') {
          await beginAwayGrace(io, socket.data.examId, socket.data.student.id, 'window_blur', 'Student connection ended during the live exam.');
          return;
        }
        const result = await pool.query(
          `UPDATE exam_participants SET status = 'disconnected', last_seen_at = NOW()
           WHERE id = $1 AND terminated_at IS NULL AND status <> 'submitted'
           RETURNING id, full_name, roll_number, joined_at, last_seen_at, status`,
          [socket.data.student.id]
        );
        if (result.rowCount) io.to(examRoom(socket.data.examId)).emit('exam:manager_state', await getManagerState(socket.data.examId));
      } catch (error) {
        console.error('[Socket.IO] Could not mark student disconnected:', error.message);
      }
    });
  });

  const expiryTimer = setInterval(async () => {
    try {
      const expired = await pool.query(
        `SELECT DISTINCT p.exam_id
         FROM exam_participants p
         JOIN exam_live_sessions s ON s.exam_id = p.exam_id
         WHERE s.status = 'live' AND p.status <> 'submitted' AND p.terminated_at IS NULL
           AND p.attempt_ends_at IS NOT NULL
           AND p.attempt_ends_at + (p.extra_time_seconds * INTERVAL '1 second') <= NOW()`
      );
      for (const row of expired.rows) await processExpiredExam(io, row.exam_id);
    } catch (error) {
      console.error('[Socket.IO] Could not finish expired exams:', error.message);
    }
  }, 5000);
  httpServer.on('close', () => clearInterval(expiryTimer));

  return io;
};
