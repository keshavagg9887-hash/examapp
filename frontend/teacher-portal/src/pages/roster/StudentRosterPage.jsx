import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import './StudentRosterPage.css';

const ATTENDANCE_COLORS = {
  'Submitted':   { bg: '#dcfce7', color: '#166534' },
  'In Progress': { bg: '#dbeafe', color: '#1e40af' },
  'Present':     { bg: '#fef3c7', color: '#92400e' },
  'Absent':      { bg: '#fee2e2', color: '#991b1b' },
};

const fmtDate = (d) => d ? new Date(d).toLocaleString() : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString() : '—';

export const StudentRosterPage = () => {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(examId || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [addRoll, setAddRoll] = useState('');
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);

  // Load list of exams for dropdown
  useEffect(() => {
    fetch('/api/exams', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setExams(d.exams || []))
      .catch(() => {});
  }, []);

  const fetchRoster = useCallback(async (eid) => {
    if (!eid) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/exams/${eid}/roster`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load roster.');
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedExamId) fetchRoster(selectedExamId);
    else setData(null);
  }, [selectedExamId, fetchRoster]);

  const handleAddExpected = async () => {
    const roll = addRoll.trim().toUpperCase();
    const name = addName.trim();
    if (!roll || !name) { alert('Enter both roll number and name.'); return; }
    setAdding(true);
    try {
      const res = await fetch(`/api/exams/${selectedExamId}/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rollNumber: roll, fullName: name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to add student.');
      setAddRoll('');
      setAddName('');
      fetchRoster(selectedExamId);
    } catch (err) {
      alert(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveExpected = async (rollNumber) => {
    if (!window.confirm(`Remove ${rollNumber} from expected roster?`)) return;
    try {
      await fetch(`/api/exams/${selectedExamId}/roster/${encodeURIComponent(rollNumber)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      fetchRoster(selectedExamId);
    } catch (err) {
      alert('Failed to remove student.');
    }
  };

  const handleExportCSV = () => {
    if (!data?.students) return;
    const rows = [
      ['Roll Number', 'Student Name', 'Attendance Status', 'Joined At', 'Submitted At', 'Score'],
      ...data.students.map((s) => [
        s.rollNumber, s.fullName, s.attendanceStatus,
        fmtDate(s.joinedAt), fmtDate(s.submittedAt),
        s.score != null ? s.score : ''
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(data.exam?.title || 'exam').replace(/\s+/g, '_')}_roster.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = (data?.students || []).filter((s) => {
    const q = search.toLowerCase();
    const matchSearch = s.fullName.toLowerCase().includes(q) || s.rollNumber.toLowerCase().includes(q);
    const matchStatus = filterStatus ? s.attendanceStatus === filterStatus : true;
    return matchSearch && matchStatus;
  });

  return (
    <div>
      {/* Exam Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Student Roster &amp; Attendance</h2>
          <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Track attendance, submission status, and manage expected student lists per exam.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Select
            options={[
              { value: '', label: '— Select an exam —' },
              ...exams.map((e) => ({ value: String(e.id), label: e.title })),
            ]}
            value={selectedExamId}
            onChange={setSelectedExamId}
          />
          {data && <Button size="sm" variant="secondary" onClick={handleExportCSV}>Export CSV</Button>}
          {data && <Button size="sm" variant="secondary" onClick={() => fetchRoster(selectedExamId)}>Refresh</Button>}
        </div>
      </div>

      {!selectedExamId && (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
          Select an exam above to view its roster.
        </div>
      )}

      {loading && <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading roster…</div>}
      {error && <div style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '6px', marginBottom: '1rem' }}>{error}</div>}

      {data && !loading && (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Total Expected', value: data.summary.total, color: '#475569' },
              { label: 'Submitted', value: data.summary.submitted, color: '#166534' },
              { label: 'In Progress', value: data.summary.inProgress, color: '#1e40af' },
              { label: 'Present', value: data.summary.present, color: '#92400e' },
              { label: 'Absent', value: data.summary.absent, color: '#991b1b' },
            ].map((s) => (
              <div key={s.label} style={{
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
                padding: '0.9rem 1rem', textAlign: 'center'
              }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.1rem' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Add Expected Student */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.6rem', color: '#475569' }}>Add Expected Student</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                placeholder="Roll Number"
                value={addRoll}
                onChange={(e) => setAddRoll(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.9rem', flex: '1 1 140px' }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddExpected()}
              />
              <input
                placeholder="Full Name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.9rem', flex: '2 1 200px' }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddExpected()}
              />
              <Button onClick={handleAddExpected} disabled={adding} size="sm">
                {adding ? 'Adding…' : 'Add Student'}
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <Input
              placeholder="Search by name or roll number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'Submitted', label: 'Submitted' },
                { value: 'In Progress', label: 'In Progress' },
                { value: 'Present', label: 'Present' },
                { value: 'Absent', label: 'Absent' },
              ]}
              value={filterStatus}
              onChange={setFilterStatus}
            />
          </div>

          {/* Roster Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['Roll No.', 'Student Name', 'Attendance', 'Join Time', 'Submit Time', 'Score', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No students match your filter.</td></tr>
                ) : (
                  filtered.map((s, idx) => {
                    const statusStyle = ATTENDANCE_COLORS[s.attendanceStatus] || { bg: '#f1f5f9', color: '#475569' };
                    return (
                      <tr key={s.rollNumber} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>{s.rollNumber}</td>
                        <td style={{ padding: '0.65rem 0.75rem' }}>{s.fullName}</td>
                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          <span style={{
                            padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600,
                            background: statusStyle.bg, color: statusStyle.color
                          }}>
                            {s.attendanceStatus}
                          </span>
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', color: '#64748b', fontSize: '0.8rem' }}>{fmtTime(s.joinedAt)}</td>
                        <td style={{ padding: '0.65rem 0.75rem', color: '#64748b', fontSize: '0.8rem' }}>{fmtTime(s.submittedAt)}</td>
                        <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>
                          {s.score != null ? s.score : '—'}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', display: 'flex', gap: '0.4rem' }}>
                          {s.participantId && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => navigate(`/results/exams/${selectedExamId}/students/${s.participantId}`)}
                            >
                              Results
                            </Button>
                          )}
                          {s.isExpected && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleRemoveExpected(s.rollNumber)}
                            >
                              Remove
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default StudentRosterPage;
