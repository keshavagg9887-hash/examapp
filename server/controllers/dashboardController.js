import pool from '../conn.js';

export const getDashboardStats = async (req, res, next) => {
  try {
    const teacherId = req.user?.id;

    // 1. Total registered unique students
    const studentCountResult = await pool.query(
      `SELECT COUNT(DISTINCT roll_number)::int AS count FROM exam_participants`
    );
    const totalStudents = studentCountResult.rows[0]?.count || 0;

    // 2. Total exams & breakdown (by teacher, or fallback to all exams in lab)
    const examCountsResult = await pool.query(`
      SELECT 
        COUNT(*)::int AS total_exams,
        COUNT(*) FILTER (WHERE status = 'published')::int AS published_exams,
        COUNT(*) FILTER (WHERE status = 'draft')::int AS draft_exams
      FROM exams
      WHERE created_by = $1 OR NOT EXISTS (SELECT 1 FROM exams WHERE created_by = $1)
    `, [teacherId]);
    const examCounts = examCountsResult.rows[0] || { total_exams: 0, published_exams: 0, draft_exams: 0 };

    // 3. Question repository count
    const questionsCountResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM questions`
    );
    const totalQuestions = questionsCountResult.rows[0]?.count || 0;

    // 4. Distinct departments derived from participants
    const departmentsResult = await pool.query(`
      WITH student_departments AS (
        SELECT DISTINCT
          CASE 
            WHEN roll_number ~* 'EC|ECE|ELEC' THEN 'Electronics & Communication'
            WHEN roll_number ~* 'IT|INFO' THEN 'Information Technology'
            WHEN roll_number ~* 'ME|MECH' THEN 'Mechanical Engineering'
            WHEN roll_number ~* 'EE|ELECTRICAL' THEN 'Electrical Engineering'
            WHEN roll_number ~* 'CE|CIVIL' THEN 'Civil Engineering'
            ELSE 'Computer Science'
          END AS department
        FROM exam_participants
      )
      SELECT department FROM student_departments ORDER BY department
    `);
    const departmentList = departmentsResult.rows.map((r) => r.department);
    const departmentCount = Math.max(departmentList.length, 1);

    // 5. Active live ongoing exams
    const ongoingSessionsResult = await pool.query(`
      SELECT 
        s.exam_id,
        s.status AS session_status,
        s.started_at,
        s.ends_at,
        e.title,
        e.subject,
        e.course,
        e.batch,
        e.lab,
        e.duration,
        e.total_marks,
        e.join_code,
        COUNT(DISTINCT p.id)::int AS total_students,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'connected' AND p.last_seen_at > NOW() - INTERVAL '45 seconds')::int AS active_students,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'disconnected')::int AS disconnected_students,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'submitted')::int AS submitted_students,
        COUNT(DISTINCT v.id)::int AS violations_count
      FROM exam_live_sessions s
      JOIN exams e ON e.id = s.exam_id
      LEFT JOIN exam_participants p ON p.exam_id = s.exam_id
      LEFT JOIN exam_violations v ON v.exam_id = s.exam_id
      WHERE s.status = 'live'
      GROUP BY s.exam_id, s.status, s.started_at, s.ends_at, e.id
      ORDER BY s.started_at DESC
    `);

    const now = Date.now();
    const ongoingExams = ongoingSessionsResult.rows.map((row) => {
      let timeRemainingMinutes = 0;
      if (row.ends_at) {
        timeRemainingMinutes = Math.max(0, Math.ceil((new Date(row.ends_at).getTime() - now) / 60000));
      } else if (row.started_at && row.duration) {
        const totalDurationMs = Number(row.duration) * 60000;
        const elapsedMs = now - new Date(row.started_at).getTime();
        timeRemainingMinutes = Math.max(0, Math.ceil((totalDurationMs - elapsedMs) / 60000));
      }

      return {
        id: String(row.exam_id),
        title: row.title,
        code: row.join_code ? `EXAM-${String(row.join_code).slice(0, 8).toUpperCase()}` : `EXAM-${row.exam_id}`,
        type: 'Quiz / Practical',
        labRoom: row.lab || 'Computer Lab',
        totalStudents: Number(row.total_students || 0),
        activeStudents: Number(row.active_students || 0),
        disconnectedStudents: Number(row.disconnected_students || 0),
        submittedStudents: Number(row.submitted_students || 0),
        durationMinutes: Number(row.duration || 60),
        timeRemainingMinutes,
        violationsCount: Number(row.violations_count || 0),
        status: 'In Progress',
        batch: row.batch || 'All Batches',
      };
    });

    // 6. Active students online across ongoing exams
    const onlineStudentsResult = await pool.query(`
      SELECT COUNT(DISTINCT p.roll_number)::int AS count
      FROM exam_participants p
      JOIN exam_live_sessions s ON s.exam_id = p.exam_id
      WHERE s.status = 'live' AND p.status = 'connected' AND p.last_seen_at > NOW() - INTERVAL '45 seconds'
    `);
    const activeStudentsOnline = onlineStudentsResult.rows[0]?.count || 0;

    // 7. Recent examination results
    const recentResultsResult = await pool.query(`
      SELECT 
        e.id,
        e.title,
        e.subject,
        e.batch,
        e.total_marks,
        MAX(COALESCE(p.submitted_at, p.last_seen_at, s.finished_at, e.updated_at)) AS latest_activity,
        COUNT(p.id)::int AS total_participants,
        COUNT(p.id) FILTER (WHERE p.status = 'submitted' OR p.score IS NOT NULL)::int AS candidates,
        AVG(p.score) FILTER (WHERE p.score IS NOT NULL) AS avg_score,
        MAX(p.score) FILTER (WHERE p.score IS NOT NULL) AS max_score,
        MIN(p.score) FILTER (WHERE p.score IS NOT NULL) AS min_score,
        COUNT(p.id) FILTER (WHERE p.score IS NOT NULL AND (e.total_marks = 0 OR p.score >= (e.total_marks * 0.4)))::int AS pass_count
      FROM exams e
      LEFT JOIN exam_live_sessions s ON s.exam_id = e.id
      JOIN exam_participants p ON p.exam_id = e.id
      WHERE p.status = 'submitted' OR p.score IS NOT NULL
      GROUP BY e.id, e.title, e.subject, e.batch, e.total_marks
      ORDER BY latest_activity DESC
      LIMIT 6
    `);

    const recentResults = recentResultsResult.rows.map((row) => {
      const candidates = Number(row.candidates || 0);
      const totalMarks = Number(row.total_marks || 0);
      const rawAvg = row.avg_score != null ? Number(row.avg_score) : 0;
      const avgPercentage = totalMarks > 0 ? (rawAvg / totalMarks) * 100 : rawAvg;
      const passCount = Number(row.pass_count || 0);
      const passRate = candidates > 0 ? ((passCount / candidates) * 100).toFixed(1) + '%' : '0%';
      const maxScore = row.max_score != null ? Number(row.max_score) : 0;

      const actDate = row.latest_activity ? new Date(row.latest_activity) : new Date();
      const dateFormatted = actDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      return {
        id: String(row.id),
        examTitle: row.title,
        batch: row.batch ? row.batch.trim() : (row.subject ? `${row.subject.toUpperCase()}` : 'General'),
        date: dateFormatted,
        candidates,
        avgScore: `${avgPercentage.toFixed(1)}%`,
        topScore: `${maxScore} / ${totalMarks}`,
        passRate,
        evalStatus: 'Fully Evaluated',
      };
    });

    return res.json({
      success: true,
      metrics: {
        totalStudents,
        totalDepartments: departmentCount,
        departments: departmentList,
        totalExams: examCounts.total_exams,
        publishedExams: examCounts.published_exams,
        draftExams: examCounts.draft_exams,
        activeExams: ongoingExams.length,
        totalQuestions,
        activeStudentsOnline,
      },
      ongoingExams,
      recentResults,
    });
  } catch (error) {
    return next(error);
  }
};
