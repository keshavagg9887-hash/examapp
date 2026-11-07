import pool from './conn.js';
import cookieSignature from 'cookie-signature';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const SESSION_SECRET = process.env.SESSION_SECRET || 'examlan_master_lab_session_secret_2026';

async function test() {
  console.log('--- Starting Backend API Tests ---');

  // 1. Create a guaranteed active teacher session for teacher 1
  const testSid = 'test_teacher_session_' + Date.now();
  const teacherId = 1;
  const sessData = {
    cookie: { originalMaxAge: 604800000, expires: new Date(Date.now() + 604800000).toISOString(), httpOnly: true, path: '/' },
    teacher: { id: teacherId, fullName: 'keshav aggarwal', email: 'keshav@gmail.com', role: 'teacher' }
  };
  await pool.query(
    `INSERT INTO session (sid, sess, expire) VALUES ($1, $2, NOW() + INTERVAL '1 day')
     ON CONFLICT (sid) DO UPDATE SET sess = $2, expire = NOW() + INTERVAL '1 day'`,
    [testSid, JSON.stringify(sessData)]
  );
  const signedCookieValue = 's:' + cookieSignature.sign(testSid, SESSION_SECRET);
  const teacherCookie = `connect.sid=${signedCookieValue}`;

  // 2. Test student public exam endpoint
  const examRes = await fetch('http://localhost:3000/api/student/exams/CS201-DEMO');
  const examData = await examRes.json();
  console.log('1. Student exam endpoint:', examRes.status, examData.exam.title, 'Total marks:', examData.exam.total_marks);
  if (examRes.status !== 200) throw new Error('Failed to fetch public exam');
  const examId = examData.exam.id;

  // Reset exam results_released to false for consistent test state
  await pool.query('UPDATE exams SET results_released = false, results_released_at = NULL WHERE id = $1', [examId]);

  // 3. Test student result before release (Expected: 403 Forbidden)
  const pRes = await pool.query("SELECT id, access_token, roll_number, score FROM exam_participants WHERE roll_number = '2025CS01'");
  const studentToken = pRes.rows[0].access_token;

  const preReleaseRes = await fetch('http://localhost:3000/api/student/exams/CS201-DEMO/result', {
    headers: { 'x-participant-token': studentToken }
  });
  const preReleaseData = await preReleaseRes.json();
  console.log('2. Student result before release:', preReleaseRes.status, preReleaseData.message);
  if (preReleaseRes.status !== 403) throw new Error('Expected 403 before release, got ' + preReleaseRes.status);

  // 4. Test Teacher Results endpoint
  const resultsRes = await fetch(`http://localhost:3000/api/exams/${examId}/results`, {
    headers: { Cookie: teacherCookie }
  });
  const resultsData = await resultsRes.json();
  console.log('3. Teacher results endpoint status:', resultsRes.status);
  console.log('   Statistics:', resultsData.statistics);
  console.log('   Student results count:', resultsData.results?.length);
  if (resultsRes.status !== 200 || !resultsData.results?.length) throw new Error('Teacher results failed');

  // 5. Test Teacher individual student result detail
  const participantId = resultsData.results[0].participantId;
  const detailRes = await fetch(`http://localhost:3000/api/exams/${examId}/results/students/${participantId}`, {
    headers: { Cookie: teacherCookie }
  });
  const detailData = await detailRes.json();
  console.log('4. Teacher student result detail status:', detailRes.status);
  console.log('   Participant:', detailData.participant?.fullName, 'Score:', detailData.participant?.score);
  console.log('   Questions with review:', detailData.questions?.length);
  if (detailRes.status !== 200 || !detailData.questions?.length) throw new Error('Teacher student result detail failed');

  // 6. Test Teacher Roster endpoint
  const rosterRes = await fetch(`http://localhost:3000/api/exams/${examId}/roster`, {
    headers: { Cookie: teacherCookie }
  });
  const rosterData = await rosterRes.json();
  console.log('5. Teacher roster endpoint status:', rosterRes.status);
  console.log('   Roster summary:', rosterData.summary);
  const absentStudents = rosterData.students?.filter(s => s.attendanceStatus === 'Absent');
  console.log('   Absent students found:', absentStudents.map(s => s.rollNumber).join(', '));
  if (rosterRes.status !== 200 || absentStudents.length < 2) throw new Error('Roster absence tracking failed');

  // 7. Test Toggle Release Results
  const toggleRes = await fetch(`http://localhost:3000/api/exams/${examId}/results/toggle-release`, {
    method: 'POST',
    headers: { Cookie: teacherCookie }
  });
  const toggleData = await toggleRes.json();
  console.log('6. Toggle results release status:', toggleRes.status, 'Results released:', toggleData.resultsReleased);
  if (toggleRes.status !== 200 || toggleData.resultsReleased !== true) throw new Error('Toggle release failed');

  // 8. Test Student result after release (Expected: 200 OK)
  const postReleaseRes = await fetch('http://localhost:3000/api/student/exams/CS201-DEMO/result', {
    headers: { 'x-participant-token': studentToken }
  });
  const postReleaseData = await postReleaseRes.json();
  console.log('7. Student result after release status:', postReleaseRes.status);
  console.log('   Student:', postReleaseData.student?.fullName, 'Score:', postReleaseData.student?.score, '/', postReleaseData.student?.totalMarks, `(${postReleaseData.student?.percentage}%)`);
  console.log('   Questions reviewed count:', postReleaseData.questions?.length);
  if (postReleaseRes.status !== 200 || postReleaseData.student?.score !== 20) throw new Error('Student post-release result failed');

  // 9. Test IDOR protection: Token spoofing fails
  const fakeTokenRes = await fetch('http://localhost:3000/api/student/exams/CS201-DEMO/result', {
    headers: { 'x-participant-token': 'fake-token-attempting-idor-12345' }
  });
  console.log('8. Fake token check (Expected 401):', fakeTokenRes.status);
  if (fakeTokenRes.status !== 401) throw new Error('Expected 401 for unauthorized token');

  // Cleanup test session
  await pool.query('DELETE FROM session WHERE sid = $1', [testSid]);
  await pool.end();

  console.log('\n--- ALL BACKEND TESTS PASSED SUCCESSFULLY! ---');
}

test().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
