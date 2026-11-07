import pool from '../conn.js';
import { getSocketIO } from '../realtime/socketServer.js';

const isExamId = (value) => typeof value === 'string' && /^[1-9]\d*$/.test(value);

const verifyExamOwner = async (examId, teacherId) => {
  if (!isExamId(examId)) return null;
  const result = await pool.query(
    'SELECT id, title, subject, course, total_marks, duration, results_released, results_released_at, status FROM exams WHERE id = $1 AND created_by = $2',
    [examId, teacherId]
  );
  return result.rowCount ? result.rows[0] : null;
};

export const getExamResults = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const exam = await verifyExamOwner(examId, req.user.id);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }

    const participantsResult = await pool.query(
      `SELECT p.id, p.full_name, p.roll_number, p.status, p.score, p.joined_at, p.submitted_at,
              p.attempt_started_at,
              COUNT(DISTINCT eq.id)::int AS total_questions,
              COUNT(DISTINCT ea.exam_question_id)::int AS attempted_questions
       FROM exam_participants p
       LEFT JOIN exam_questions eq ON eq.exam_id = p.exam_id
       LEFT JOIN exam_answers ea ON ea.participant_id = p.id AND ea.exam_question_id = eq.id
       WHERE p.exam_id = $1
       GROUP BY p.id
       ORDER BY p.roll_number ASC`,
      [examId]
    );

    const totalMarks = Number(exam.total_marks || 0);
    const results = [];
    let sumScore = 0;
    let submittedCount = 0;
    let highestScore = 0;
    let lowestScore = totalMarks;
    let passCount = 0;
    const gradeDist = { A: 0, B: 0, C: 0, D: 0, F: 0 };

    for (const row of participantsResult.rows) {
      const scoreNum = row.score == null ? null : Number(row.score);
      const isSubmitted = row.status === 'submitted';
      const percentage = (scoreNum != null && totalMarks > 0)
        ? Number(((scoreNum / totalMarks) * 100).toFixed(1))
        : null;
      const passed = percentage != null ? percentage >= 40 : false;

      if (isSubmitted && scoreNum != null) {
        submittedCount++;
        sumScore += scoreNum;
        if (scoreNum > highestScore) highestScore = scoreNum;
        if (scoreNum < lowestScore) lowestScore = scoreNum;
        if (passed) passCount++;

        if (percentage >= 90) gradeDist.A++;
        else if (percentage >= 80) gradeDist.B++;
        else if (percentage >= 70) gradeDist.C++;
        else if (percentage >= 60) gradeDist.D++;
        else gradeDist.F++;
      }

      results.push({
        participantId: row.id,
        fullName: row.full_name,
        rollNumber: row.roll_number,
        status: row.status,
        score: scoreNum,
        totalMarks,
        percentage,
        passed,
        joinedAt: row.joined_at,
        submittedAt: row.submitted_at,
        totalQuestions: row.total_questions,
        attemptedQuestions: row.attempted_questions,
        unattemptedQuestions: Math.max(0, row.total_questions - row.attempted_questions),
      });
    }

    const averageScore = submittedCount > 0 ? Number((sumScore / submittedCount).toFixed(2)) : 0;
    const averagePercentage = totalMarks > 0 && submittedCount > 0 ? Number(((averageScore / totalMarks) * 100).toFixed(1)) : 0;
    const passPercentage = submittedCount > 0 ? Number(((passCount / submittedCount) * 100).toFixed(1)) : 0;

    return res.json({
      success: true,
      exam: {
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        course: exam.course,
        totalMarks,
        resultsReleased: Boolean(exam.results_released),
        resultsReleasedAt: exam.results_released_at,
      },
      statistics: {
        totalParticipants: results.length,
        submittedCount,
        averageScore,
        averagePercentage,
        highestScore: submittedCount > 0 ? highestScore : 0,
        lowestScore: submittedCount > 0 ? lowestScore : 0,
        passCount,
        passPercentage,
        gradeDistribution: gradeDist,
      },
      results,
    });
  } catch (error) {
    return next(error);
  }
};

export const getStudentResultDetail = async (req, res, next) => {
  try {
    const { examId, participantId } = req.params;
    const exam = await verifyExamOwner(examId, req.user.id);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }

    const participantResult = await pool.query(
      `SELECT id, full_name, roll_number, status, score, joined_at, submitted_at
       FROM exam_participants
       WHERE id = $1 AND exam_id = $2`,
      [participantId, examId]
    );
    if (!participantResult.rowCount) {
      return res.status(404).json({ success: false, message: 'Student participant record not found.' });
    }
    const participant = participantResult.rows[0];

    const questionsResult = await pool.query(
      `SELECT eq.id, eq.position, eq.question_data, ea.selected_option_ids
       FROM exam_questions eq
       LEFT JOIN exam_answers ea
         ON ea.exam_question_id = eq.id AND ea.participant_id = $2
       WHERE eq.exam_id = $1
       ORDER BY eq.position ASC`,
      [examId, participantId]
    );

    const questions = questionsResult.rows.map((row) => {
      const qData = row.question_data || {};
      const options = (qData.options || []).map((opt) => ({
        id: String(opt.id),
        text: opt.text,
        isCorrect: Boolean(opt.isCorrect),
      }));
      const selectedOptionIds = (row.selected_option_ids || []).map(String);
      const correctOptionIds = options.filter((o) => o.isCorrect).map((o) => o.id);

      const isCorrect = correctOptionIds.length > 0 &&
        correctOptionIds.length === selectedOptionIds.length &&
        correctOptionIds.every((id) => selectedOptionIds.includes(id));

      const marksAwarded = isCorrect ? Number(qData.marks || 0) : 0;

      return {
        id: row.id,
        position: row.position,
        statement: qData.statement,
        type: qData.type,
        marks: Number(qData.marks || 0),
        options,
        selectedOptionIds,
        correctOptionIds,
        isCorrect,
        marksAwarded,
      };
    });

    const totalMarks = Number(exam.total_marks || 0);
    const score = participant.score != null ? Number(participant.score) : 0;
    const percentage = totalMarks > 0 ? Number(((score / totalMarks) * 100).toFixed(1)) : 0;

    return res.json({
      success: true,
      exam: {
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        totalMarks,
      },
      participant: {
        id: participant.id,
        fullName: participant.full_name,
        rollNumber: participant.roll_number,
        status: participant.status,
        score,
        totalMarks,
        percentage,
        passed: percentage >= 40,
        joinedAt: participant.joined_at,
        submittedAt: participant.submitted_at,
      },
      questions,
    });
  } catch (error) {
    return next(error);
  }
};

export const toggleResultsRelease = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const exam = await verifyExamOwner(examId, req.user.id);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }

    const newStatus = !exam.results_released;
    await pool.query(
      `UPDATE exams
       SET results_released = $1,
           results_released_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $2`,
      [newStatus, examId]
    );

    const io = getSocketIO();
    if (io) {
      io.to(`exam:${examId}`).emit('exam:results_released', {
        examId,
        resultsReleased: newStatus,
      });
    }

    return res.json({
      success: true,
      resultsReleased: newStatus,
      message: newStatus ? 'Results have been released to students.' : 'Results are now hidden from students.',
    });
  } catch (error) {
    return next(error);
  }
};

export const getExamRoster = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const exam = await verifyExamOwner(examId, req.user.id);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }

    // Combine expected students and actual participants
    const query = `
      SELECT
        COALESCE(e.roll_number, p.roll_number) AS roll_number,
        COALESCE(p.full_name, e.full_name) AS full_name,
        p.id AS participant_id,
        p.status AS participant_status,
        p.joined_at,
        p.submitted_at,
        p.last_seen_at,
        p.attempt_started_at,
        p.score,
        (e.id IS NOT NULL) AS is_expected
      FROM exam_expected_students e
      FULL OUTER JOIN exam_participants p
        ON p.exam_id = e.exam_id AND UPPER(p.roll_number) = UPPER(e.roll_number)
      WHERE COALESCE(e.exam_id, p.exam_id) = $1
      ORDER BY roll_number ASC;
    `;
    const result = await pool.query(query, [examId]);

    const students = result.rows.map((row) => {
      let attendanceStatus = 'Absent';
      if (row.participant_id) {
        if (row.participant_status === 'submitted') {
          attendanceStatus = 'Submitted';
        } else if (row.attempt_started_at) {
          attendanceStatus = 'In Progress';
        } else if (['connected', 'joined'].includes(row.participant_status)) {
          attendanceStatus = 'Present';
        } else {
          attendanceStatus = 'In Progress';
        }
      }

      return {
        rollNumber: row.roll_number,
        fullName: row.full_name,
        attendanceStatus,
        participantStatus: row.participant_status || null,
        joinedAt: row.joined_at,
        submittedAt: row.submitted_at,
        lastSeenAt: row.last_seen_at,
        score: row.score == null ? null : Number(row.score),
        isExpected: Boolean(row.is_expected),
        participantId: row.participant_id,
      };
    });

    const summary = {
      total: students.length,
      present: students.filter((s) => s.attendanceStatus === 'Present').length,
      inProgress: students.filter((s) => s.attendanceStatus === 'In Progress').length,
      submitted: students.filter((s) => s.attendanceStatus === 'Submitted').length,
      absent: students.filter((s) => s.attendanceStatus === 'Absent').length,
    };

    return res.json({
      success: true,
      exam: {
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        course: exam.course,
      },
      summary,
      students,
    });
  } catch (error) {
    return next(error);
  }
};

export const addExpectedStudents = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const exam = await verifyExamOwner(examId, req.user.id);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }

    const studentsInput = Array.isArray(req.body.students)
      ? req.body.students
      : req.body.rollNumber && req.body.fullName
        ? [{ rollNumber: req.body.rollNumber, fullName: req.body.fullName }]
        : [];

    if (!studentsInput.length) {
      return res.status(400).json({ success: false, message: 'Provide student name and roll number.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const s of studentsInput) {
        const roll = String(s.rollNumber || '').trim().toUpperCase();
        const name = String(s.fullName || '').trim();
        if (roll && name) {
          await client.query(
            `INSERT INTO exam_expected_students (exam_id, roll_number, full_name)
             VALUES ($1, $2, $3)
             ON CONFLICT (exam_id, roll_number) DO UPDATE SET full_name = EXCLUDED.full_name`,
            [examId, roll, name]
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.json({ success: true, message: 'Expected students added to roster.' });
  } catch (error) {
    return next(error);
  }
};

export const removeExpectedStudent = async (req, res, next) => {
  try {
    const { examId, rollNumber } = req.params;
    const exam = await verifyExamOwner(examId, req.user.id);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }

    await pool.query(
      `DELETE FROM exam_expected_students WHERE exam_id = $1 AND UPPER(roll_number) = UPPER($2)`,
      [examId, rollNumber]
    );

    return res.json({ success: true, message: 'Student removed from expected roster.' });
  } catch (error) {
    return next(error);
  }
};
