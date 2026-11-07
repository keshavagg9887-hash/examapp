import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';
import './ExamListPage.css';

export const ExamListPage = () => {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    let mounted = true;
    const fetchExams = async () => {
      try {
        const res = await fetch('/api/exams', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to fetch exams');
        if (mounted) setExams(data.exams || []);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchExams();
    return () => { mounted = false; };
  }, []);

  const filtered = exams.filter((e) => {
    const matchesSearch =
      (e.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.subject || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus ? e.status === filterStatus : true;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="exam-list-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 className="page-title" style={{ margin: 0 }}>Exam Results &amp; Reports</h2>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0 0', fontSize: '0.95rem' }}>
            Select an exam to view detailed student submissions, question-wise performance, and publish results.
          </p>
        </div>
      </div>

      <div className="toolbar" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <Input
          placeholder="Search by exam title or subject..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'published', label: 'Published' },
            { value: 'draft', label: 'Draft' },
          ]}
          value={filterStatus}
          onChange={(v) => setFilterStatus(v)}
        />
      </div>

      {loading && <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading exams...</div>}
      {error && <div style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '6px' }}>{error}</div>}

      {!loading && !error && (
        <table className="exam-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Exam Title</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Subject</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Duration</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Total Marks</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Questions</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Status</th>
              <th style={{ textAlign: 'center', padding: '0.75rem 1rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  No exams found matching your criteria.
                </td>
              </tr>
            ) : (
              filtered.map((exam) => (
                <tr key={exam.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{exam.title}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{exam.subject}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{exam.duration} mins</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{exam.totalMarks}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{exam.questionCount}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '9999px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      background: exam.status === 'published' ? '#dcfce7' : '#f1f5f9',
                      color: exam.status === 'published' ? '#166534' : '#475569'
                    }}>
                      {exam.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => navigate(`/results/exams/${exam.id}`)}
                    >
                      View Results
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};
export default ExamListPage;
