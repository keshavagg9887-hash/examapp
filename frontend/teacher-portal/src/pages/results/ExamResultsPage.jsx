import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';

const statusColors = {
  submitted: { bg: '#dcfce7', color: '#166534' },
  connected: { bg: '#dbeafe', color: '#1e40af' },
  joined: { bg: '#fef3c7', color: '#92400e' },
  disconnected: { bg: '#fee2e2', color: '#991b1b' },
};

export const ExamResultsPage = () => {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [releasing, setReleasing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortKey, setSortKey] = useState('roll_number');

  const fetchResults = useCallback(async () => {
    try {
      setError('');
      const res = await fetch(`/api/exams/${examId}/results`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load results.');
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  const handleToggleRelease = async () => {
    if (!window.confirm(data?.exam?.resultsReleased
      ? 'Hide results from students?'
      : 'Release results to all students now?')) return;
    setReleasing(true);
    try {
      const res = await fetch(`/api/exams/${examId}/results/toggle-release`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to toggle release.');
      setData((prev) => ({
        ...prev,
        exam: { ...prev.exam, resultsReleased: json.resultsReleased },
      }));
    } catch (err) {
      alert(err.message);
    } finally {
      setReleasing(false);
    }
  };

  const handleExportCSV = () => {
    if (!data?.results) return;
    const rows = [
      ['Roll Number', 'Student Name', 'Score', 'Total Marks', 'Percentage', 'Status', 'Submitted At'],
      ...data.results.map((r) => [
        r.rollNumber,
        r.fullName,
        r.score ?? '',
        r.totalMarks,
        r.percentage ?? '',
        r.status,
        r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '',
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.exam.title.replace(/\s+/g, '_')}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading results…</div>;
  if (error) return <div style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '6px' }}>{error}</div>;
  if (!data) return null;

  const { exam, statistics: stats, results } = data;

  const filtered = (results || [])
    .filter((r) => {
      const q = search.toLowerCase();
      const matchSearch = r.fullName.toLowerCase().includes(q) || r.rollNumber.toLowerCase().includes(q);
      const matchStatus = filterStatus ? r.status === filterStatus : true;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (sortKey === 'score') return (b.score ?? -1) - (a.score ?? -1);
      if (sortKey === 'name') return a.fullName.localeCompare(b.fullName);
      return a.rollNumber.localeCompare(b.rollNumber);
    });

  return (
    <div style={{ padding: '0 0.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <button onClick={() => navigate('/results')} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '0.9rem', padding: '0 0 0.25rem 0' }}>
            ← All Exams
          </button>
          <h2 style={{ margin: '0.25rem 0 0 0', fontSize: '1.4rem', fontWeight: 700 }}>{exam.title}</h2>
          <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            {exam.subject}{exam.course ? ` · ${exam.course}` : ''} · {exam.totalMarks} marks
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600,
            background: exam.resultsReleased ? '#dcfce7' : '#fef3c7',
            color: exam.resultsReleased ? '#166534' : '#92400e'
          }}>
            {exam.resultsReleased ? 'Results Published' : 'Results Hidden'}
          </span>
          <Button onClick={handleToggleRelease} disabled={releasing} variant={exam.resultsReleased ? 'danger' : 'primary'} size="sm">
            {releasing ? 'Updating…' : exam.resultsReleased ? 'Hide Results' : 'Release Results'}
          </Button>
          <Button onClick={handleExportCSV} variant="secondary" size="sm">Export CSV</Button>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.75rem' }}>
        {[
          { label: 'Participants', value: stats.totalParticipants },
          { label: 'Submitted', value: stats.submittedCount },
          { label: 'Average', value: `${stats.averageScore} / ${exam.totalMarks}` },
          { label: 'Avg %', value: `${stats.averagePercentage}%` },
          { label: 'Highest', value: stats.highestScore },
          { label: 'Lowest', value: stats.lowestScore },
          { label: 'Pass Rate', value: `${stats.passPercentage}%` },
          { label: 'Grade A', value: stats.gradeDistribution.A },
          { label: 'Grade F', value: stats.gradeDistribution.F },
        ].map((s) => (
          <div key={s.label} style={{
            background: '#f8fafc', borderRadius: '10px', padding: '0.9rem 1rem', textAlign: 'center',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b' }}>{s.value}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <Input placeholder="Search by name or roll number…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'submitted', label: 'Submitted' },
            { value: 'connected', label: 'In Progress' },
            { value: 'joined', label: 'Present (not started)' },
            { value: 'disconnected', label: 'Disconnected' },
          ]}
          value={filterStatus}
          onChange={setFilterStatus}
        />
        <Select
          options={[
            { value: 'roll_number', label: 'Sort: Roll No.' },
            { value: 'score', label: 'Sort: Score (high)' },
            { value: 'name', label: 'Sort: Name' },
          ]}
          value={sortKey}
          onChange={setSortKey}
        />
      </div>

      {/* Results Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              {['Roll No.', 'Student Name', 'Score', 'Total', 'Percentage', 'Correct', 'Unattempted', 'Status', 'Submitted At', 'Actions'].map((h) => (
                <th key={h} style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No students match your filter.</td></tr>
            ) : (
              filtered.map((r, idx) => (
                <tr key={r.participantId} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>{r.rollNumber}</td>
                  <td style={{ padding: '0.65rem 0.75rem' }}>{r.fullName}</td>
                  <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: r.score == null ? '#94a3b8' : (r.score / r.totalMarks >= 0.4 ? '#166534' : '#991b1b') }}>
                    {r.score == null ? '—' : r.score}
                  </td>
                  <td style={{ padding: '0.65rem 0.75rem', color: '#64748b' }}>{r.totalMarks}</td>
                  <td style={{ padding: '0.65rem 0.75rem' }}>{r.percentage != null ? `${r.percentage}%` : '—'}</td>
                  <td style={{ padding: '0.65rem 0.75rem' }}>{r.status === 'submitted' ? r.attemptedQuestions : '—'}</td>
                  <td style={{ padding: '0.65rem 0.75rem' }}>{r.status === 'submitted' ? r.unattemptedQuestions : '—'}</td>
                  <td style={{ padding: '0.65rem 0.75rem' }}>
                    <span style={{
                      display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600,
                      ...(statusColors[r.status] || { bg: '#f1f5f9', color: '#475569' }),
                      background: (statusColors[r.status] || {}).bg || '#f1f5f9',
                    }}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: '0.65rem 0.75rem', color: '#64748b', fontSize: '0.8rem' }}>
                    {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: '0.65rem 0.75rem' }}>
                    {r.status === 'submitted' && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => navigate(`/results/exams/${examId}/students/${r.participantId}`)}
                      >
                        Review
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExamResultsPage;
