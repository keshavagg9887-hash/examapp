import pool from '../conn.js';
import { publishExamPresence } from '../services/studentPresenceService.js';
import { gradeParticipant } from '../services/examGradingService.js';
import { refreshExamManager } from '../realtime/socketServer.js';
export const getPublishedExamByJoinCode = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.title, e.subject, e.course, e.instructions,
              e.duration, e.total_marks, e.status,
              s.status AS live_status, s.started_at, s.ends_at, s.finished_at
       FROM exams e LEFT JOIN exam_live_sessions s ON s.exam_id = e.id
       WHERE e.join_code = $1 AND e.status = 'published'`,
      [req.params.joinCode]
    );
    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: 'This exam link is invalid or no longer available.' });
    }
    const exam = result.rows[0];
    let student = null;
    if (String(req.session.student?.examId) === String(exam.id)) {
      const participant = await pool.query(
        `SELECT terminated_at, score, status, attempt_started_at, attempt_ends_at FROM exam_participants
         WHERE id = $1 AND exam_id = $2`,
        [req.session.student.id, exam.id]
      );
      if (participant.rowCount) {
        student = {
          ...req.session.student,
          terminated: Boolean(participant.rows[0].terminated_at),
          score: participant.rows[0].score == null ? null : Number(participant.rows[0].score),
          status: participant.rows[0].status,
          attemptStartedAt: participant.rows[0].attempt_started_at,
          attemptEndsAt: participant.rows[0].attempt_ends_at,
        };
      }
    }
    return res.json({
      success: true,
      exam,
      student,
      liveSession: {
        status: exam.live_status || 'waiting',
        startedAt: exam.started_at,
        endsAt: exam.ends_at,
        finishedAt: exam.finished_at,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const joinPublishedExam = async (req, res, next) => {
  try {
    const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
    const rollNumber = typeof req.body.rollNumber === 'string'
      ? req.body.rollNumber.trim().toUpperCase()
      : '';
    if (fullName.length < 2 || fullName.length > 120) {
      return res.status(400).json({ success: false, message: 'Enter your name (2–120 characters).' });
    }
    if (!/^[A-Z0-9_-]{1,40}$/.test(rollNumber)) {
      return res.status(400).json({ success: false, message: 'Enter a valid roll number using letters, numbers, hyphens, or underscores.' });
    }

    const examResult = await pool.query(
      `SELECT e.id, e.title, s.status AS live_status FROM exams e
       LEFT JOIN exam_live_sessions s ON s.exam_id = e.id
       WHERE e.join_code = $1 AND e.status = 'published'`,
      [req.params.joinCode]
    );
    if (!examResult.rowCount) {
      return res.status(404).json({ success: false, message: 'This exam link is invalid or no longer available.' });
    }

    const exam = examResult.rows[0];
    if (exam.live_status === 'finished') {
      return res.status(409).json({ success: false, message: 'This exam has already finished.' });
    }
    if (String(req.session.student?.examId) === String(exam.id) && req.session.student?.id) {
      const current = await pool.query(
        `SELECT roll_number, status, terminated_at
         FROM exam_participants WHERE id = $1 AND exam_id = $2`,
        [req.session.student.id, exam.id]
      );
      if (!current.rowCount || current.rows[0].terminated_at || current.rows[0].status === 'submitted') {
        return res.status(409).json({ success: false, message: 'This browser already used its attempt for this exam. The attempt cannot be reopened.' });
      }
      if (current.rows[0].roll_number !== rollNumber) {
        return res.status(409).json({ success: false, message: 'This browser is already registered with a different roll number for this exam.' });
      }
    }
    const participantResult = await pool.query(
      `INSERT INTO exam_participants (exam_id, full_name, roll_number, status, last_seen_at)
       VALUES ($1, $2, $3, 'joined', NOW())
       ON CONFLICT (exam_id, roll_number)
       DO UPDATE SET full_name = EXCLUDED.full_name, status = 'joined', last_seen_at = NOW()
       WHERE exam_participants.terminated_at IS NULL AND exam_participants.status <> 'submitted'
       RETURNING id, full_name, roll_number, joined_at, last_seen_at, status`,
      [exam.id, fullName, rollNumber]
    );
    if (!participantResult.rowCount) {
      return res.status(409).json({ success: false, message: 'This roll number already has a finished exam session.' });
    }
    const student = {
      id: participantResult.rows[0].id,
      examId: String(exam.id),
      fullName: participantResult.rows[0].full_name,
      rollNumber: participantResult.rows[0].roll_number,
      joinedAt: participantResult.rows[0].joined_at,
      lastSeenAt: participantResult.rows[0].last_seen_at,
      status: participantResult.rows[0].status,
    };
    req.session.student = student;
    publishExamPresence(exam.id, { type: 'student_joined', data: student });
    return res.json({ success: true, student, examTitle: exam.title });
  } catch (error) {
    return next(error);
  }
};

export const heartbeatForExam = async (req, res, next) => {
  try {
    const student = req.session.student;
    if (!student?.id) {
      return res.status(401).json({ success: false, message: 'Join this exam before sending a heartbeat.' });
    }

    const result = await pool.query(
      `UPDATE exam_participants AS participant
       SET status = 'connected', last_seen_at = NOW()
       FROM exams AS exam
       WHERE participant.id = $1 AND participant.exam_id = exam.id
         AND exam.id = $2 AND exam.join_code = $3 AND exam.status = 'published'
       RETURNING participant.id, participant.full_name, participant.roll_number,
                 participant.joined_at, participant.last_seen_at, participant.status`,
      [student.id, student.examId, req.params.joinCode]
    );
    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: 'This student session is no longer valid.' });
    }

    const row = result.rows[0];
    const presence = {
      id: row.id,
      fullName: row.full_name,
      rollNumber: row.roll_number,
      joinedAt: row.joined_at,
      lastSeenAt: row.last_seen_at,
      status: row.status,
    };
    publishExamPresence(student.examId, { type: 'student_presence', data: presence });
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
};

const getStudentExamContext = async (req, joinCode) => {
  const student = req.session.student;
  if (!student?.id) return { error: { status: 401, message: 'Join this exam first.' } };
  const result = await pool.query(
    `SELECT e.id AS exam_id, e.total_marks, p.id AS participant_id,
            p.status AS participant_status, p.terminated_at, p.extra_time_seconds,
            p.attempt_started_at, p.attempt_ends_at,
            s.status AS exam_status, s.started_at,
            p.attempt_ends_at + (p.extra_time_seconds * INTERVAL '1 second') AS student_ends_at
     FROM exams e
     JOIN exam_participants p ON p.exam_id = e.id
     JOIN exam_live_sessions s ON s.exam_id = e.id
     WHERE e.join_code = $1 AND e.status = 'published'
       AND p.id = $2 AND p.exam_id = $3`,
    [joinCode, student.id, student.examId]
  );
  if (!result.rowCount) return { error: { status: 404, message: 'Student exam session not found.' } };
  const context = result.rows[0];
  if (context.terminated_at) return { error: { status: 403, message: 'Your exam session was ended by the teacher.' } };
  return { student, context };
};

export const getStudentQuestions = async (req, res, next) => {
  try {
    const { error, context } = await getStudentExamContext(req, req.params.joinCode);
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    if (context.exam_status !== 'live') {
      return res.status(409).json({ success: false, message: 'The teacher has not started this exam yet.' });
    }
    if (context.participant_status === 'submitted') {
      return res.status(409).json({ success: false, message: 'Your exam has already been submitted.' });
    }
    if (context.student_ends_at && new Date(context.student_ends_at).getTime() <= Date.now()) {
      return res.status(409).json({ success: false, message: 'Your exam time has ended.' });
    }
    const [questionResult, answerResult] = await Promise.all([
      pool.query(
        `SELECT id, position, question_data FROM exam_questions
         WHERE exam_id = $1 ORDER BY position`,
        [context.exam_id]
      ),
      pool.query(
        `SELECT exam_question_id, selected_option_ids FROM exam_answers
         WHERE participant_id = $1`,
        [context.participant_id]
      ),
    ]);
    const answers = new Map(answerResult.rows.map((answer) => [answer.exam_question_id, answer.selected_option_ids]));
    const questions = questionResult.rows.map((row) => ({
      id: row.id,
      position: row.position,
      statement: row.question_data.statement,
      type: row.question_data.type,
      marks: Number(row.question_data.marks || 0),
      options: (row.question_data.options || []).map(({ id, text }) => ({ id, text })),
      selectedOptionIds: answers.get(row.id) || [],
    }));
    return res.json({ success: true, questions, endsAt: context.student_ends_at, totalMarks: Number(context.total_marks) });
  } catch (error) {
    return next(error);
  }
};

export const startStudentAttempt = async (req, res, next) => {
  const student = req.session.student;
  if (!student?.id || !student.examId) {
    return res.status(401).json({ success: false, message: 'Join this exam first.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = await client.query(
      `SELECT s.status, s.started_at, p.attempt_ends_at, e.duration,
              s.duration_adjustment_seconds
       FROM exam_live_sessions s
       JOIN exams e ON e.id = s.exam_id
       JOIN exam_participants p ON p.exam_id = e.id
       WHERE s.exam_id = $1 AND e.join_code = $2 AND e.status = 'published'
         AND p.id = $3 AND p.terminated_at IS NULL AND p.status <> 'submitted'
       FOR UPDATE OF s, p`,
      [student.examId, req.params.joinCode, student.id]
    );
    if (!session.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Student exam session not found.' });
    }
    if (session.rows[0].status !== 'live') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'The teacher has not started this exam yet.' });
    }
    const started = await client.query(
      `UPDATE exam_live_sessions
       SET started_at = COALESCE(started_at, NOW()), updated_at = NOW()
       WHERE exam_id = $1
       RETURNING started_at`,
      [student.examId]
    );
    const participant = await client.query(
      `UPDATE exam_participants
       SET attempt_started_at = COALESCE(attempt_started_at, NOW()),
           attempt_ends_at = COALESCE(
             attempt_ends_at,
             NOW() + (GREATEST(60, ($3 * 60 + $4)) * INTERVAL '1 second')
           ),
           status = 'connected', last_seen_at = NOW()
       FROM exams e, exam_live_sessions s
       WHERE exam_participants.id = $1 AND exam_participants.exam_id = $2
         AND exam_participants.exam_id = e.id AND s.exam_id = e.id
         AND exam_participants.terminated_at IS NULL AND exam_participants.status <> 'submitted'
       RETURNING exam_participants.attempt_started_at, exam_participants.attempt_ends_at`,
      [student.id, student.examId, session.rows[0].duration, session.rows[0].duration_adjustment_seconds || 0]
    );
    if (!participant.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'This exam attempt can no longer be started.' });
    }
    await client.query('COMMIT');
    await refreshExamManager(student.examId);
    return res.json({
      success: true,
      startedAt: started.rows[0].started_at,
      endsAt: participant.rows[0].attempt_ends_at,
      attemptStartedAt: participant.rows[0].attempt_started_at,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    return next(error);
  } finally {
    client.release();
  }
};

export const saveStudentAnswer = async (req, res, next) => {
  try {
    const { error, context } = await getStudentExamContext(req, req.params.joinCode);
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    if (context.exam_status !== 'live' || context.participant_status === 'submitted') {
      return res.status(409).json({ success: false, message: 'This exam is not accepting answers.' });
    }
    if (!context.attempt_started_at || !context.student_ends_at) {
      return res.status(409).json({ success: false, message: 'Load the exam questions before answering.' });
    }
    if (new Date(context.student_ends_at).getTime() <= Date.now()) {
      return res.status(409).json({ success: false, message: 'Your exam time has ended.' });
    }
    const selectedOptionIds = req.body.selectedOptionIds;
    if (!Array.isArray(selectedOptionIds) || selectedOptionIds.some((id) => typeof id !== 'string') || new Set(selectedOptionIds).size !== selectedOptionIds.length) {
      return res.status(400).json({ success: false, message: 'Answer must be a list of distinct option IDs.' });
    }
    const question = await pool.query(
      `SELECT question_data FROM exam_questions WHERE id = $1 AND exam_id = $2`,
      [req.params.questionId, context.exam_id]
    );
    if (!question.rowCount) return res.status(404).json({ success: false, message: 'Question not found.' });
    const validIds = new Set((question.rows[0].question_data.options || []).map((option) => String(option.id)));
    if (selectedOptionIds.some((id) => !validIds.has(id))) {
      return res.status(400).json({ success: false, message: 'Answer contains an option that does not belong to this question.' });
    }
    if (question.rows[0].question_data.type === 'mcq_single' && selectedOptionIds.length > 1) {
      return res.status(400).json({ success: false, message: 'Select one option for this question.' });
    }
    await pool.query(
      `INSERT INTO exam_answers (participant_id, exam_question_id, selected_option_ids, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (participant_id, exam_question_id)
       DO UPDATE SET selected_option_ids = EXCLUDED.selected_option_ids, updated_at = NOW()`,
      [context.participant_id, req.params.questionId, JSON.stringify(selectedOptionIds)]
    );
    await refreshExamManager(context.exam_id);
    return res.json({ success: true, saved: true });
  } catch (error) {
    return next(error);
  }
};

export const submitStudentExam = async (req, res, next) => {
  let resultContext;
  try {
    resultContext = await getStudentExamContext(req, req.params.joinCode);
  } catch (error) {
    return next(error);
  }
  const { error, context } = resultContext;
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  if (context.exam_status !== 'live' || context.participant_status === 'submitted' || !context.attempt_started_at || !context.student_ends_at) {
    return res.status(409).json({ success: false, message: 'This exam is not accepting submissions.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const score = await gradeParticipant(client, context.exam_id, context.participant_id);
    await client.query(
      `UPDATE exam_participants
       SET status = 'submitted', submitted_at = NOW(), score = $1
       WHERE id = $2`,
      [score, context.participant_id]
    );
    await client.query('COMMIT');
    const result = { score, totalMarks: Number(context.total_marks) };
    req.session.student.submitted = true;
    await refreshExamManager(context.exam_id);
    return res.json({ success: true, result });
  } catch (caught) {
    try { await client.query('ROLLBACK'); } catch {}
    return next(caught);
  } finally {
    client.release();
  }
};
