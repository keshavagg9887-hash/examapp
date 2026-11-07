import pool from '../conn.js';
import crypto from 'node:crypto';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get or pick first teacher
    const teacherRes = await client.query('SELECT id FROM teachers ORDER BY id LIMIT 1');
    if (!teacherRes.rowCount) {
      throw new Error('No teacher found in database. Create a teacher first.');
    }
    const teacherId = teacherRes.rows[0].id;

    // 2. Create or find test Question Bank
    let bankId;
    const existingBank = await client.query(
      `SELECT id FROM question_banks WHERE name = 'CS201 Data Structures & Algorithms' AND teacher_id = $1`,
      [teacherId]
    );
    if (existingBank.rowCount) {
      bankId = existingBank.rows[0].id;
    } else {
      const bankInsert = await client.query(
        `INSERT INTO question_banks (teacher_id, name) VALUES ($1, 'CS201 Data Structures & Algorithms') RETURNING id`,
        [teacherId]
      );
      bankId = bankInsert.rows[0].id;
    }

    // 3. Define questions
    const q1Id = '11111111-1111-4111-8111-111111111111';
    const q2Id = '22222222-2222-4222-8222-222222222222';
    const q3Id = '33333333-3333-4333-8333-333333333333';
    const q4Id = '44444444-4444-4444-8444-444444444444';

    const questions = [
      {
        id: q1Id,
        statement: 'Which data structure follows the LIFO (Last In First Out) principle?',
        type: 'mcq_single',
        marks: 5,
        options: [
          { id: 'opt-1a', text: 'Queue', isCorrect: false },
          { id: 'opt-1b', text: 'Stack', isCorrect: true },
          { id: 'opt-1c', text: 'Array', isCorrect: false },
          { id: 'opt-1d', text: 'Tree', isCorrect: false },
        ]
      },
      {
        id: q2Id,
        statement: 'What is the average time complexity of searching in a balanced Binary Search Tree?',
        type: 'mcq_single',
        marks: 5,
        options: [
          { id: 'opt-2a', text: 'O(1)', isCorrect: false },
          { id: 'opt-2b', text: 'O(n)', isCorrect: false },
          { id: 'opt-2c', text: 'O(log n)', isCorrect: true },
          { id: 'opt-2d', text: 'O(n^2)', isCorrect: false },
        ]
      },
      {
        id: q3Id,
        statement: 'Which of the following are non-linear data structures? (Select all that apply)',
        type: 'mcq_multi',
        marks: 5,
        options: [
          { id: 'opt-3a', text: 'Stack', isCorrect: false },
          { id: 'opt-3b', text: 'Tree', isCorrect: true },
          { id: 'opt-3c', text: 'Graph', isCorrect: true },
          { id: 'opt-3d', text: 'Array', isCorrect: false },
        ]
      },
      {
        id: q4Id,
        statement: 'Which sorting algorithm has the best worst-case time complexity among the following?',
        type: 'mcq_single',
        marks: 5,
        options: [
          { id: 'opt-4a', text: 'Quick Sort', isCorrect: false },
          { id: 'opt-4b', text: 'Merge Sort', isCorrect: true },
          { id: 'opt-4c', text: 'Bubble Sort', isCorrect: false },
          { id: 'opt-4d', text: 'Selection Sort', isCorrect: false },
        ]
      }
    ];

    // 4. Create or update Exam
    const joinCode = 'CS201-DEMO';
    let examId;
    const existingExam = await client.query('SELECT id FROM exams WHERE join_code = $1', [joinCode]);
    if (existingExam.rowCount) {
      examId = existingExam.rows[0].id;
      await client.query(
        `UPDATE exams SET 
           title = 'CS201 Midterm Examination (Demo)', 
           subject = 'Data Structures', 
           course = 'CS201',
           duration = 30,
           total_marks = 20,
           status = 'published',
           results_released = false,
           updated_at = NOW()
         WHERE id = $1`,
        [examId]
      );
    } else {
      const examInsert = await client.query(
        `INSERT INTO exams (
           created_by, title, subject, course, instructions, duration,
           lab, batch, allow_tab_switch, enable_audio_monitor, total_marks,
           status, join_code, results_released
         ) VALUES ($1, 'CS201 Midterm Examination (Demo)', 'Data Structures', 'CS201',
           'Answer all questions. Fullscreen proctoring is enabled.', 30,
           'Lab 1', '2025-CS', false, false, 20,
           'published', $2, false)
         RETURNING id`,
        [teacherId, joinCode]
      );
      examId = examInsert.rows[0].id;
    }

    // 5. Insert Exam Live Session
    await client.query(
      `INSERT INTO exam_live_sessions (exam_id, status, started_at, ends_at, updated_at)
       VALUES ($1, 'live', NOW() - INTERVAL '40 minutes', NOW() + INTERVAL '20 minutes', NOW())
       ON CONFLICT (exam_id) DO UPDATE SET
         status = 'live',
         updated_at = NOW()`,
      [examId]
    );

    // 6. Insert questions in exam_questions
    await client.query('DELETE FROM exam_questions WHERE exam_id = $1', [examId]);
    const examQuestionMap = new Map();
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const insertedQ = await client.query(
        `INSERT INTO exam_questions (exam_id, position, question_data)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [examId, i + 1, JSON.stringify(q)]
      );
      examQuestionMap.set(q.id, insertedQ.rows[0].id);
    }

    // 7. Define 10 fictional students
    const students = [
      { roll: '2025CS01', name: 'Aarav Patel', status: 'submitted', answers: { [q1Id]: ['opt-1b'], [q2Id]: ['opt-2c'], [q3Id]: ['opt-3b', 'opt-3c'], [q4Id]: ['opt-4b'] }, score: 20 },
      { roll: '2025CS02', name: 'Bhavna Sharma', status: 'submitted', answers: { [q1Id]: ['opt-1b'], [q2Id]: ['opt-2c'], [q3Id]: ['opt-3b', 'opt-3c'], [q4Id]: ['opt-4a'] }, score: 15 },
      { roll: '2025CS03', name: 'Chirag Mehta', status: 'submitted', answers: { [q1Id]: ['opt-1b'], [q2Id]: ['opt-2c'], [q3Id]: ['opt-3b'], [q4Id]: ['opt-4a'] }, score: 10 },
      { roll: '2025CS04', name: 'Divya Nair', status: 'submitted', answers: { [q1Id]: ['opt-1b'], [q2Id]: ['opt-2b'], [q3Id]: ['opt-3a'], [q4Id]: ['opt-4a'] }, score: 5 },
      { roll: '2025CS05', name: 'Eshan Roy', status: 'submitted', answers: { [q1Id]: ['opt-1b'], [q2Id]: ['opt-2c'], [q3Id]: ['opt-3b', 'opt-3c'], [q4Id]: ['opt-4d'] }, score: 15 },
      { roll: '2025CS06', name: 'Farhan Ali', status: 'submitted', answers: { [q1Id]: ['opt-1a'], [q2Id]: ['opt-2c'], [q3Id]: ['opt-3b', 'opt-3c'], [q4Id]: ['opt-4a'] }, score: 10 },
      { roll: '2025CS07', name: 'Gauri Deshmukh', status: 'connected', answers: { [q1Id]: ['opt-1b'], [q2Id]: ['opt-2c'] }, score: null, attemptStarted: true },
      { roll: '2025CS08', name: 'Harish Rao', status: 'joined', answers: {}, score: null, attemptStarted: false },
      { roll: '2025CS09', name: 'Ishaan Verma', status: 'absent' },
      { roll: '2025CS10', name: 'Jiya Kapoor', status: 'absent' },
    ];

    // 8. Populate expected students
    for (const s of students) {
      await client.query(
        `INSERT INTO exam_expected_students (exam_id, roll_number, full_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (exam_id, roll_number) DO UPDATE SET full_name = EXCLUDED.full_name`,
        [examId, s.roll, s.name]
      );
    }

    // 9. Populate participants and answers
    for (const s of students) {
      if (s.status === 'absent') continue; // Absent students do NOT have a row in exam_participants!

      const accessToken = crypto.randomBytes(32).toString('hex');
      const joinedAt = new Date(Date.now() - 35 * 60 * 1000);
      const submittedAt = s.status === 'submitted' ? new Date(Date.now() - 5 * 60 * 1000) : null;
      const attemptStartedAt = s.status === 'submitted' || s.attemptStarted ? joinedAt : null;
      const attemptEndsAt = attemptStartedAt ? new Date(joinedAt.getTime() + 30 * 60 * 1000) : null;

      const pRes = await client.query(
        `INSERT INTO exam_participants (
           exam_id, full_name, roll_number, joined_at, last_seen_at, status,
           score, submitted_at, attempt_started_at, attempt_ends_at, access_token
         ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10)
         ON CONFLICT (exam_id, roll_number) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           status = EXCLUDED.status,
           score = EXCLUDED.score,
           submitted_at = EXCLUDED.submitted_at,
           attempt_started_at = EXCLUDED.attempt_started_at,
           attempt_ends_at = EXCLUDED.attempt_ends_at,
           access_token = COALESCE(exam_participants.access_token, EXCLUDED.access_token)
         RETURNING id`,
        [examId, s.name, s.roll, joinedAt, s.status, s.score, submittedAt, attemptStartedAt, attemptEndsAt, accessToken]
      );
      const participantId = pRes.rows[0].id;

      // Insert answers
      if (s.answers) {
        for (const [qid, selected] of Object.entries(s.answers)) {
          const eqId = examQuestionMap.get(qid);
          if (eqId) {
            await client.query(
              `INSERT INTO exam_answers (participant_id, exam_question_id, selected_option_ids, updated_at)
               VALUES ($1, $2, $3, NOW())
               ON CONFLICT (participant_id, exam_question_id) DO UPDATE SET
                 selected_option_ids = EXCLUDED.selected_option_ids`,
              [participantId, eqId, JSON.stringify(selected)]
            );
          }
        }
      }
    }

    await client.query('COMMIT');
    console.log(`Demo test data seeded successfully!`);
    console.log(`Exam ID: ${examId}, Join Code: ${joinCode}`);
    console.log(`Join URL: http://localhost:5174/join/${joinCode}`);
    console.log(`10 students configured: 6 submitted, 1 in-progress, 1 present (joined), 2 absent.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
