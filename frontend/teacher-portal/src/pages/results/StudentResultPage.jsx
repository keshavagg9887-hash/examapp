import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button';

export const StudentResultPage = () => {
  const { examId, participantId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/exams/${examId}/results/students/${participantId}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load student result.');
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [examId, participantId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading student result…</div>;
  if (error) return <div style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '6px' }}>{error}</div>;
  if (!data) return null;

  const { exam, participant, questions } = data;
  const correctCount = questions.filter((q) => q.isCorrect).length;
  const incorrectCount = questions.filter((q) => !q.isCorrect && q.selectedOptionIds.length > 0).length;
  const unattemptedCount = questions.filter((q) => q.selectedOptionIds.length === 0).length;

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Nav */}
      <button onClick={() => navigate(`/results/exams/${examId}`)} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '0.9rem', padding: '0 0 0.5rem 0' }}>
        ← Back to {exam.title}
      </button>

      {/* Header Card */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{exam.subject}</div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>{participant.fullName}</h2>
            <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontFamily: 'monospace' }}>{participant.rollNumber}</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center', background: '#fff', borderRadius: '10px', padding: '0.75rem 1.25rem', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: participant.passed ? '#166534' : '#991b1b' }}>
                {participant.score} <span style={{ fontSize: '1rem', fontWeight: 400, color: '#64748b' }}>/ {participant.totalMarks}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.1rem' }}>Score</div>
            </div>
            <div style={{ textAlign: 'center', background: '#fff', borderRadius: '10px', padding: '0.75rem 1.25rem', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: participant.passed ? '#166534' : '#991b1b' }}>
                {participant.percentage}%
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.1rem' }}>Percentage</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem' }}>
            <strong>Status:</strong>{' '}
            <span style={{
              padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600,
              background: participant.passed ? '#dcfce7' : '#fee2e2',
              color: participant.passed ? '#166534' : '#991b1b'
            }}>
              {participant.passed ? 'PASSED' : 'FAILED'}
            </span>
          </span>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}><strong>Correct:</strong> {correctCount}</span>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}><strong>Incorrect:</strong> {incorrectCount}</span>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}><strong>Unattempted:</strong> {unattemptedCount}</span>
          {participant.submittedAt && (
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              <strong>Submitted:</strong> {new Date(participant.submittedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Question-by-question review */}
      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#475569', marginBottom: '1rem' }}>Answer Review</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {questions.map((q, idx) => {
          const hasAnswered = q.selectedOptionIds.length > 0;
          const borderColor = !hasAnswered ? '#94a3b8' : q.isCorrect ? '#22c55e' : '#ef4444';
          const bgColor = !hasAnswered ? '#f8fafc' : q.isCorrect ? '#f0fdf4' : '#fef2f2';

          return (
            <div key={q.id} style={{
              borderRadius: '10px', padding: '1.25rem', border: `2px solid ${borderColor}`,
              background: bgColor
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 700, color: '#475569', minWidth: '1.5rem' }}>Q{idx + 1}.</span>
                  <span style={{ fontWeight: 500 }}>{q.statement}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, marginLeft: '1rem' }}>
                  <span style={{
                    padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                    background: !hasAnswered ? '#e2e8f0' : q.isCorrect ? '#dcfce7' : '#fee2e2',
                    color: !hasAnswered ? '#64748b' : q.isCorrect ? '#166534' : '#991b1b'
                  }}>
                    {!hasAnswered ? 'Unattempted' : q.isCorrect ? 'Correct' : 'Incorrect'}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                    {q.marksAwarded} / {q.marks} marks
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginLeft: '2rem' }}>
                {q.options.map((opt) => {
                  const isSelected = q.selectedOptionIds.includes(opt.id);
                  const isCorrectOpt = opt.isCorrect;
                  let optBg = 'transparent';
                  let optBorder = '#d1d5db';
                  let optColor = '#374151';
                  if (isCorrectOpt) { optBg = '#dcfce7'; optBorder = '#22c55e'; optColor = '#166534'; }
                  if (isSelected && !isCorrectOpt) { optBg = '#fee2e2'; optBorder = '#ef4444'; optColor = '#991b1b'; }
                  return (
                    <div key={opt.id} style={{
                      padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.9rem',
                      background: optBg, border: `1px solid ${optBorder}`, color: optColor,
                      display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}>
                      <span style={{ fontWeight: 700, fontSize: '0.75rem' }}>
                        {isSelected ? (isCorrectOpt ? '✓' : '✗') : isCorrectOpt ? '✓' : '·'}
                      </span>
                      {opt.text}
                      {isCorrectOpt && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 600 }}>(Correct)</span>}
                      {isSelected && !isCorrectOpt && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 600 }}>(Your Answer)</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StudentResultPage;
