import pool from '../conn.js';

export const listStudents = async (req, res, next) => {
  try {
    const {
      search = '',
      department = '',
      semester = '',
      batch = '',
      page = 1,
      limit = 10,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    // CTE to derive clean, real student rows from participants and exams
    const cteSql = `
      WITH student_roster AS (
        SELECT 
          p.roll_number AS roll,
          MAX(p.full_name) AS name,
          MAX(p.last_seen_at) AS last_login,
          BOOL_OR(p.status = 'connected' AND p.last_seen_at > NOW() - INTERVAL '5 minutes') AS is_online,
          COUNT(DISTINCT p.exam_id)::int AS exams_taken,
          CASE 
            WHEN p.roll_number ~* 'EC|ECE|ELEC' THEN 'Electronics & Communication'
            WHEN p.roll_number ~* 'IT|INFO' THEN 'Information Technology'
            WHEN p.roll_number ~* 'ME|MECH' THEN 'Mechanical Engineering'
            WHEN p.roll_number ~* 'EE|ELECTRICAL' THEN 'Electrical Engineering'
            WHEN p.roll_number ~* 'CE|CIVIL' THEN 'Civil Engineering'
            ELSE 'Computer Science'
          END AS department,
          CASE 
            WHEN p.roll_number ~ '^2026' THEN '2'
            WHEN p.roll_number ~ '^2025' THEN '4'
            WHEN p.roll_number ~ '^2024' THEN '6'
            WHEN p.roll_number ~ '^2023' THEN '8'
            WHEN STRING_AGG(DISTINCT e.batch, ', ') ~* 'A2' THEN '2'
            ELSE '4'
          END AS semester,
          CASE 
            WHEN p.roll_number ~ '^(20\\d{2})' THEN SUBSTRING(p.roll_number FROM '^(20\\d{2})')
            WHEN COALESCE(STRING_AGG(DISTINCT NULLIF(e.batch, ''), ', '), '') <> '' THEN STRING_AGG(DISTINCT NULLIF(e.batch, ''), ', ')
            ELSE '2025'
          END AS batch,
          LOWER(p.roll_number) || '@college.edu' AS email
        FROM exam_participants p
        LEFT JOIN exams e ON e.id = p.exam_id
        GROUP BY p.roll_number
      )
    `;

    // Filter conditions
    const conditions = [];
    const params = [];

    if (search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      conditions.push(`(LOWER(name) LIKE $${params.length} OR LOWER(roll) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`);
    }

    if (department.trim()) {
      params.push(department.trim());
      conditions.push(`department = $${params.length}`);
    }

    if (semester.trim()) {
      params.push(semester.trim());
      conditions.push(`semester = $${params.length}`);
    }

    if (batch.trim()) {
      params.push(batch.trim());
      conditions.push(`batch = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count for pagination
    const countSql = `${cteSql} SELECT COUNT(*)::int AS total FROM student_roster ${whereClause}`;
    const countResult = await pool.query(countSql, params);
    const total = countResult.rows[0]?.total || 0;

    // Filter options for dropdowns (across all students)
    const optionsSql = `${cteSql}
      SELECT 
        ARRAY_AGG(DISTINCT department ORDER BY department) AS departments,
        ARRAY_AGG(DISTINCT semester ORDER BY semester) AS semesters,
        ARRAY_AGG(DISTINCT batch ORDER BY batch) AS batches
      FROM student_roster
    `;
    const optionsResult = await pool.query(optionsSql);
    const filterOptions = {
      departments: optionsResult.rows[0]?.departments || [],
      semesters: optionsResult.rows[0]?.semesters || [],
      batches: optionsResult.rows[0]?.batches || [],
    };

    // Paginated students query
    params.push(limitNum);
    const limitParamIndex = params.length;
    params.push(offset);
    const offsetParamIndex = params.length;

    const dataSql = `
      ${cteSql}
      SELECT * FROM student_roster
      ${whereClause}
      ORDER BY roll ASC
      LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
    `;

    const dataResult = await pool.query(dataSql, params);

    const students = dataResult.rows.map((row) => {
      let status = 'Offline';
      if (row.is_online) {
        status = 'Online';
      } else if (!row.last_login) {
        status = 'Never Logged In';
      }

      return {
        id: row.roll,
        name: row.name,
        roll: row.roll,
        department: row.department,
        semester: row.semester,
        batch: row.batch,
        email: row.email,
        status,
        lastLogin: row.last_login,
        examsTaken: Number(row.exams_taken || 0),
      };
    });

    return res.json({
      success: true,
      students,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      filterOptions,
    });
  } catch (error) {
    return next(error);
  }
};
