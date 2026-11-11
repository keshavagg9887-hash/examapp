import pool from '../conn.js';

const isExamId = (value) => typeof value === 'string' && /^[1-9]\d*$/.test(value);
const isUuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const getResultsOverview = async (req, res, next) => {
  try {
    const { examId, search = '', status: filterStatus = '' } = req.query;

    // 1. Get all exams with results summary
    const examsSummaryResult = await pool.query(`
      SELECT 
        e.id,
        e.title,
        e.subject,
        e.course,
        e.batch,
        e.lab,
        e.duration,
        e.total_marks,
        e.status,
        e.created_at,
        COUNT(p.id)::int AS total_participants,
        COUNT(p.id) FILTER (WHERE p.status = 'submitted' OR p.score IS NOT NULL)::int AS candidates_count,
        AVG(p.score) FILTER (WHERE p.score IS NOT NULL) AS avg_score,
        MAX(p.score) FILTER (WHERE p.score IS NOT NULL) AS max_score,
        MIN(p.score) FILTER (WHERE p.score IS NOT NULL) AS min_score
      FROM exams e
      LEFT JOIN exam_participants p ON p.exam_id = e.id
      GROUP BY e.id
      ORDER BY candidates_count DESC, e.updated_at DESC
    `);

    const examsList = examsSummaryResult.rows.map((row) => ({
      id: String(row.id),
      title: row.title,
      subject: row.subject,
      course: row.course,
      batch: row.batch || 'All Batches',
      lab: row.lab || 'Computer Lab',
      duration: Number(row.duration || 0),
      totalMarks: Number(row.total_marks || 0),
      status: row.status,
      totalParticipants: Number(row.total_participants || 0),
      candidatesCount: Number(row.candidates_count || 0),
      avgScore: row.avg_score != null ? Number(Number(row.avg_score).toFixed(2)) : null,
      maxScore: row.max_score != null ? Number(row.max_score) : null,
      minScore: row.min_score != null ? Number(row.min_score) : null,
    }));

    if (examsList.length === 0) {
      return res.json({
        success: true,
        exams: [],
        selectedExam: null,
      });
    }

    // Determine target exam: explicit examId or first exam with candidates or first exam
    let selectedExamMeta = null;
    if (examId && isExamId(examId)) {
      selectedExamMeta = examsList.find((e) => String(e.id) === String(examId));
    }
    if (!selectedExamMeta) {
      selectedExamMeta = examsList.find((e) => e.candidatesCount > 0) || examsList[0];
    }

    const currentExamId = selectedExamMeta.id;

    // 2. Query participants for the selected exam
    const participantsResult = await pool.query(`
      SELECT 
        p.id AS participant_id,
        p.full_name AS name,
        p.roll_number AS roll,
        p.status,
        p.score,
        p.attempt_started_at,
        p.attempt_ends_at,
        p.submitted_at,
        p.last_seen_at,
        COUNT(v.id)::int AS violations_count
      FROM exam_participants p
      LEFT JOIN exam_violations v ON v.participant_id = p.id
      WHERE p.exam_id = $1
      GROUP BY p.id
      ORDER BY p.score DESC NULLS LAST, p.submitted_at ASC
    `, [currentExamId]);

    const totalMarks = selectedExamMeta.totalMarks || 100;

    // Process participant rows
    let allStudentResults = participantsResult.rows.map((p) => {
      const score = p.score != null ? Number(p.score) : 0;
      const percentage = totalMarks > 0 ? Number(((score / totalMarks) * 100).toFixed(1)) : 0;
      // Pass rule: score >= 40% of total marks (or score > 0 if totalMarks is 0)
      const passed = totalMarks > 0 ? (score / totalMarks) >= 0.4 : score > 0;

      let timeTakenSeconds = 0;
      if (p.attempt_started_at && p.submitted_at) {
        timeTakenSeconds = Math.max(0, Math.floor((new Date(p.submitted_at).getTime() - new Date(p.attempt_started_at).getTime()) / 1000));
      }

      return {
        participantId: p.participant_id,
        name: p.name,
        roll: p.roll,
        score,
        maxScore: totalMarks,
        percentage,
        passed,
        status: p.status,
        submittedAt: p.submitted_at,
        attemptStartedAt: p.attempt_started_at,
        timeTakenSeconds,
        violationsCount: Number(p.violations_count || 0),
      };
    });

    // Compute comprehensive statistics across all participants with scores
    const scoredStudents = allStudentResults.filter((s) => s.status === 'submitted' || s.score != null);
    const totalCandidates = scoredStudents.length;

    let classAvg = 0;
    let highestMarks = 0;
    let lowestMarks = 0;
    let passCount = 0;
    const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };

    if (totalCandidates > 0) {
      const scores = scoredStudents.map((s) => s.score);
      classAvg = Number((scores.reduce((sum, val) => sum + val, 0) / totalCandidates).toFixed(2));
      highestMarks = Math.max(...scores);
      lowestMarks = Math.min(...scores);
      passCount = scoredStudents.filter((s) => s.passed).length;

      for (const s of scoredStudents) {
        const pct = s.percentage;
        if (pct >= 90) gradeDistribution.A++;
        else if (pct >= 80) gradeDistribution.B++;
        else if (pct >= 70) gradeDistribution.C++;
        else if (pct >= 60) gradeDistribution.D++;
        else gradeDistribution.F++;
      }
    }

    const passPercentage = totalCandidates > 0 ? Number(((passCount / totalCandidates) * 100).toFixed(1)) : 0;
    const classAvgPercentage = totalMarks > 0 ? Number(((classAvg / totalMarks) * 100).toFixed(1)) : 0;

    // Filter student results if search or status filter is applied
    let filteredResults = allStudentResults;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filteredResults = filteredResults.filter((s) =>
        s.name.toLowerCase().includes(q) || s.roll.toLowerCase().includes(q)
      );
    }
    if (filterStatus === 'passed') {
      filteredResults = filteredResults.filter((s) => s.passed);
    } else if (filterStatus === 'failed') {
      filteredResults = filteredResults.filter((s) => !s.passed);
    }

    return res.json({
      success: true,
      exams: examsList,
      selectedExam: {
        ...selectedExamMeta,
        statistics: {
          classAvg,
          classAvgPercentage,
          highestMarks,
          lowestMarks,
          passPercentage,
          passCount,
          failCount: totalCandidates - passCount,
          totalCandidates,
          gradeDistribution,
        },
        studentResults: filteredResults,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const getStudentAnswerReview = async (req, res, next) => {
  try {
    const { examId, participantId } = req.params;
    if (!isExamId(examId)) {
      return res.status(400).json({ success: false, message: 'Invalid exam ID.' });
    }
    if (!isUuid(participantId)) {
      return res.status(400).json({ success: false, message: 'Invalid participant ID.' });
    }

    // 1. Participant info
    const participantResult = await pool.query(`
      SELECT p.id, p.full_name, p.roll_number, p.score, p.status, p.attempt_started_at, p.submitted_at,
             e.title AS exam_title, e.subject, e.total_marks
      FROM exam_participants p
      JOIN exams e ON e.id = p.exam_id
      WHERE p.id = $1 AND p.exam_id = $2
    `, [participantId, examId]);

    if (!participantResult.rowCount) {
      return res.status(404).json({ success: false, message: 'Participant not found for this exam.' });
    }

    const participant = participantResult.rows[0];

    // 2. Exam questions with student's answers
    const questionsResult = await pool.query(`
      SELECT eq.id, eq.position, eq.question_data, ea.selected_option_ids
      FROM exam_questions eq
      LEFT JOIN exam_answers ea
        ON ea.exam_question_id = eq.id AND ea.participant_id = $2
      WHERE eq.exam_id = $1
      ORDER BY eq.position
    `, [examId, participantId]);

    const questions = questionsResult.rows.map((row) => {
      const qData = row.question_data || {};
      const correctOptionIds = (qData.options || [])
        .filter((opt) => opt.isCorrect)
        .map((opt) => String(opt.id))
        .sort();
      const selectedOptionIds = (row.selected_option_ids || []).map(String).sort();

      const isCorrect = correctOptionIds.length > 0 &&
        correctOptionIds.length === selectedOptionIds.length &&
        correctOptionIds.every((id, idx) => id === selectedOptionIds[idx]);

      const marks = Number(qData.marks || 1);
      const marksAwarded = isCorrect ? marks : 0;

      return {
        id: row.id,
        position: row.position,
        statement: qData.statement || qData.title || `Question ${row.position}`,
        type: qData.type,
        marks,
        marksAwarded,
        isCorrect,
        selectedOptionIds,
        correctOptionIds,
        options: (qData.options || []).map((opt) => ({
          id: String(opt.id),
          text: opt.text,
          isCorrect: Boolean(opt.isCorrect),
        })),
        explanation: qData.explanation || null,
      };
    });

    const totalMarks = Number(participant.total_marks || 0);
    const score = Number(participant.score || 0);
    const percentage = totalMarks > 0 ? Number(((score / totalMarks) * 100).toFixed(1)) : 0;
    const passed = totalMarks > 0 ? (score / totalMarks) >= 0.4 : score > 0;

    return res.json({
      success: true,
      participant: {
        id: participant.id,
        name: participant.full_name,
        roll: participant.roll_number,
        score,
        maxScore: totalMarks,
        percentage,
        passed,
        status: participant.status,
        attemptStartedAt: participant.attempt_started_at,
        submittedAt: participant.submitted_at,
      },
      exam: {
        id: examId,
        title: participant.exam_title,
        subject: participant.subject,
        totalMarks,
      },
      questions,
    });
  } catch (error) {
    return next(error);
  }
};
