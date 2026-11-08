import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Input, Select } from '../../components/common'; // Assuming barrel export; otherwise use explicit paths
import { Button } from '../../components/common/Button';
import { MOCK_EXAM_RESULTS, MOCK_EXAMS } from '../../data/mockResultsExtended';
import './StudentResultPage.css';

export const StudentResultPage = () => {
  const { examId, studentId } = useParams();
  const navigate = useNavigate();
  const exam = MOCK_EXAMS.find((e) => e.id === examId);
  const studentResult = (MOCK_EXAM_RESULTS[examId] || []).find((r) => r.studentId === studentId);

  if (!exam || !studentResult) {
    return <div>Result not found.</div>;
  }

  const [filterPass, setFilterPass] = React.useState(''); // not used but placeholder for consistency

  return (
    <div className="student-result-page">
      <h2 className="page-title">Student Result – {studentResult.name}</h2>
      <div className="summary">
        <p><strong>Exam:</strong> {exam.name} ({exam.date})</p>
        <p><strong>Student:</strong> {studentResult.name} (ID: {studentResult.studentId})</p>
        <p><strong>Total Marks:</strong> {studentResult.totalMarks}/{studentResult.maxMarks}</p>
        <p><strong>Percentage:</strong> {studentResult.percentage}%</p>
        <p><strong>Correct Answers:</strong> {studentResult.correctAnswers}</p>
        <p><strong>Incorrect Answers:</strong> {studentResult.incorrectAnswers}</p>
        <p><strong>Unattempted:</strong> {studentResult.unattempted}</p>
        <p><strong>Time Taken:</strong> {Math.floor(studentResult.timeTaken / 60)}m {studentResult.timeTaken % 60}s</p>
        <p><strong>Status:</strong> {studentResult.passed ? 'Passed' : 'Failed'}</p>
      </div>
      <div className="actions">
        <Button size="sm" variant="primary" onClick={() => navigate(`/results/exams/${examId}/students/${studentId}/review`)}>
          View Answer Review
        </Button>
      </div>
    </div>
  );
};

