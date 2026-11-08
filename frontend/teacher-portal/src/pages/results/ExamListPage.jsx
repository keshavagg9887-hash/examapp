import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';
import { MOCK_EXAMS } from '../../data/mockResultsExtended';
import './ExamListPage.css';

export const ExamListPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('');

  const filtered = MOCK_EXAMS.filter((e) => {
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.subject.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus ? e.status === filterStatus : true;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="exam-list-page">
      <h2 className="page-title">All Examinations</h2>
      <div className="toolbar">
        <Input label="Search" placeholder="Exam name or subject" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select
          label="Status"
          options={[{ value: '', label: 'All' }, { value: 'running', label: 'Running' }, { value: 'completed', label: 'Completed' }]}
          value={filterStatus}
          onChange={(v) => setFilterStatus(v)}
        />
      </div>
      <table className="exam-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Subject</th>
            <th>Category</th>
            <th>Date</th>
            <th>Total Students</th>
            <th>Attempted</th>
            <th>Not Attempted</th>
            <th>Avg Score</th>
            <th>Highest</th>
            <th>Lowest</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((exam) => (
            <tr key={exam.id}>
              <td>{exam.name}</td>
              <td>{exam.subject}</td>
              <td>{exam.category}</td>
              <td>{exam.date}</td>
              <td>{exam.totalStudents}</td>
              <td>{exam.attempted}</td>
              <td>{exam.notAttempted}</td>
              <td>{exam.avgScore}%</td>
              <td>{exam.highest}</td>
              <td>{exam.lowest}</td>
              <td>{exam.status}</td>
              <td>
                <Button size="sm" variant="primary" onClick={() => navigate(`/results/exams/${exam.id}`)}>
                  View Results
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

