import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';
import { MOCK_EXAM_RESULTS, MOCK_EXAMS } from '../../data/mockResultsExtended';
import './ExamResultsPage.css';

export const ExamResultsPage = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const exam = MOCK_EXAMS.find((e) => e.id === examId);
  const results = MOCK_EXAM_RESULTS[examId] || [];

  const [search, setSearch] = React.useState('');
  const [filterPass, setFilterPass] = React.useState('');

  const filtered = results.filter((r) => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase()) || r.studentId.toLowerCase().includes(search.toLowerCase());
    const matchesPass = filterPass ? (filterPass === 'passed' ? r.passed : !r.passed) : true;
    return matchesSearch && matchesPass;
  });

  return (
    <div className="exam-results-page">
      <h2 className="page-title">Results – {exam?.name}</h2>
      <div className="toolbar">
        <Input label="Search" placeholder="Student name or ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select
          label="Status"
          options={[{ value: '', label: 'All' }, { value: 'passed', label: 'Passed' }, { value: 'failed', label: 'Failed' }]}
          value={filterPass}
          onChange={(v) => setFilterPass(v)}
        />
      </div>
      <table className="student-results-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Roll ID</th>
            <th>Total Marks</th>
            <th>Max Marks</th>
            <th>Percentage</th>
            <th>Correct</th>
            <th>Incorrect</th>
            <th>Unattempted</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.studentId}>
              <td>{r.name}</td>
              <td>{r.studentId}</td>
              <td>{r.totalMarks}</td>
              <td>{r.maxMarks}</td>
              <td>{r.percentage}%</td>
              <td>{r.correctAnswers}</td>
              <td>{r.incorrectAnswers}</td>
              <td>{r.unattempted}</td>
              <td>{r.passed ? 'Passed' : 'Failed'}</td>
              <td>
                <Button size="xs" variant="primary" onClick={() => navigate(`/results/exams/${examId}/students/${r.studentId}`)}>
                  View
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
