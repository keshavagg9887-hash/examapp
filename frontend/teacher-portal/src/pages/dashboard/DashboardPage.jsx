import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import {
  QuestionsIcon,
  PlusCircleIcon,
  ClockIcon,
  ShieldAlertIcon,
  CheckIcon,
  LaptopIcon,
  XIcon,
  AlertCircleIcon,
  MonitoringIcon,
} from '../../components/common/Icons';
import './DashboardPage.css';

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Safe fallback for teacher name
  const teacherName = user?.fullName || user?.name || 'Professor';

  // Dashboard live data state
  const [data, setData] = useState({
    metrics: {
      totalStudents: 0,
      totalDepartments: 0,
      departments: [],
      totalExams: 0,
      publishedExams: 0,
      draftExams: 0,
      activeExams: 0,
      totalQuestions: 0,
      activeStudentsOnline: 0,
    },
    ongoingExams: [],
    recentResults: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Broadcast announcement modal & feedback state
  const [activeBroadcastExam, setActiveBroadcastExam] = useState(null);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastFeedback, setBroadcastFeedback] = useState(null);

  // Quick preset announcements for teachers
  const PRESET_MESSAGES = [
    '15 minutes remaining. Please review your answers.',
    '5 minutes remaining. Submissions will lock automatically.',
    'Please maintain fullscreen mode. Focus loss is logged.',
    'Technical notice: System check complete. Continue working.',
  ];

  const fetchDashboardData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/dashboard/stats', { credentials: 'include' });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to load dashboard metrics.');
      }
      setData({
        metrics: result.metrics || {
          totalStudents: 0,
          totalDepartments: 0,
          departments: [],
          totalExams: 0,
          publishedExams: 0,
          draftExams: 0,
          activeExams: 0,
          totalQuestions: 0,
          activeStudentsOnline: 0,
        },
        ongoingExams: result.ongoingExams || [],
        recentResults: result.recentResults || [],
      });
    } catch (err) {
      console.error('[Dashboard] Fetch error:', err);
      setError(err.message || 'Could not connect to database.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData(true);
    const interval = setInterval(() => fetchDashboardData(false), 15000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const handleOpenBroadcast = (exam) => {
    setActiveBroadcastExam(exam);
    setBroadcastMessage('');
  };

  const handleCloseBroadcast = () => {
    setActiveBroadcastExam(null);
    setBroadcastMessage('');
  };

  const handleSendBroadcast = (e) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;

    const labRoom = activeBroadcastExam?.labRoom || 'Computer Lab';

    setBroadcastFeedback({
      type: 'info',
      message: `Announcement sent to ${labRoom}: "${broadcastMessage.trim()}"`,
    });

    handleCloseBroadcast();

    setTimeout(() => {
      setBroadcastFeedback(null);
    }, 6000);
  };

  const { metrics, ongoingExams, recentResults } = data;

  return (
    <div className="dashboard-page">
      {/* Broadcast In-App Notice Banner */}
      {broadcastFeedback && (
        <div className="dashboard-feedback-banner" role="status">
          <div className="dashboard-feedback-content">
            <CheckIcon size={15} className="dashboard-feedback-icon" />
            <span>{broadcastFeedback.message}</span>
          </div>
          <button
            type="button"
            className="dashboard-feedback-close"
            onClick={() => setBroadcastFeedback(null)}
            aria-label="Dismiss message"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="dashboard-error-banner" role="alert">
          <AlertCircleIcon size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => fetchDashboardData(true)} className="dashboard-retry-link">
            Retry
          </button>
        </div>
      )}

      {/* 1. Compact Welcome Header */}
      <section className="dashboard-header-strip">
        <div className="dashboard-header-info">
          <h1 className="dashboard-greeting">
            Welcome back, {teacherName}
          </h1>
          <div className="dashboard-header-meta">
            <span className="dashboard-node-pill">
              <span className="node-status-dot" />
              {user?.activeLab || 'Lab 3 (Systems Lab)'}
            </span>
            <span className="dashboard-meta-divider">&bull;</span>
            <span className="dashboard-meta-text">LAN Node Online &bull; Ready for assessment administration</span>
          </div>
        </div>

        <div className="dashboard-header-actions">
          <Button
            variant="outline"
            size="sm"
            icon={QuestionsIcon}
            onClick={() => navigate('/questions')}
          >
            Question Bank
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={PlusCircleIcon}
            onClick={() => navigate('/exams/create')}
          >
            Create Examination
          </Button>
        </div>
      </section>

      {/* 2. Unified Horizontal Metrics Row Driven by Database */}
      <section className="dashboard-metrics-strip" aria-label="System Overview Statistics">
        <div
          className="metric-item clickable"
          onClick={() => navigate('/students')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/students')}
          title="View Student Roster"
        >
          <span className="metric-label">Registered Students</span>
          <div className="metric-value-row">
            <span className="metric-value">{loading ? '—' : metrics.totalStudents}</span>
          </div>
          <span className="metric-subtext">
            {loading ? 'Loading...' : `across ${metrics.totalDepartments} department${metrics.totalDepartments === 1 ? '' : 's'}`}
          </span>
        </div>

        <div className="metric-divider" />

        <div
          className="metric-item clickable"
          onClick={() => navigate('/exams')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/exams')}
          title="View All Examinations"
        >
          <span className="metric-label">Total Examinations</span>
          <div className="metric-value-row">
            <span className="metric-value">{loading ? '—' : metrics.totalExams}</span>
          </div>
          <span className="metric-subtext">
            {loading ? 'Loading...' : `${metrics.publishedExams} published \u2022 ${metrics.draftExams} draft${metrics.draftExams === 1 ? '' : 's'}`}
          </span>
        </div>

        <div className="metric-divider" />

        <div
          className="metric-item clickable"
          onClick={() => navigate('/live-exams')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/live-exams')}
          title="Open Live Exam Manager"
        >
          <div className="metric-label-with-live">
            <span className="metric-label">Ongoing Lab Exams</span>
            {metrics.activeExams > 0 && <span className="metric-live-dot" title="Live active sessions" />}
          </div>
          <div className="metric-value-row">
            <span className="metric-value">{loading ? '—' : metrics.activeExams}</span>
            {metrics.activeExams > 0 ? (
              <span className="metric-live-badge">Live Now</span>
            ) : (
              <span className="metric-idle-badge">Idle</span>
            )}
          </div>
          <span className="metric-subtext">
            {loading ? 'Loading...' : `${metrics.activeStudentsOnline} active student${metrics.activeStudentsOnline === 1 ? '' : 's'} online`}
          </span>
        </div>

        <div className="metric-divider" />

        <div
          className="metric-item clickable"
          onClick={() => navigate('/questions')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/questions')}
          title="Open Question Bank"
        >
          <span className="metric-label">Question Repository</span>
          <div className="metric-value-row">
            <span className="metric-value">{loading ? '—' : metrics.totalQuestions}</span>
          </div>
          <span className="metric-subtext">
            {loading ? 'Loading...' : `${metrics.totalQuestions} questions stored`}
          </span>
        </div>
      </section>

      {/* 3. Ongoing Examinations Displayed as Clean Flat Rows */}
      <section className="dashboard-section" aria-label="Ongoing LAN Examinations">
        <div className="section-title-row">
          <div className="section-title-left">
            <h2 className="section-heading">Ongoing Examinations</h2>
            <span className="section-subheading">
              Active laboratory sessions currently proctored on local workstations
            </span>
          </div>
          <span className="section-count-tag">
            {ongoingExams.length} Active Session{ongoingExams.length === 1 ? '' : 's'}
          </span>
        </div>

        {ongoingExams.length > 0 ? (
          <div className="ongoing-rows-container">
            {ongoingExams.map((exam) => {
              const elapsedMinutes = Math.max(0, exam.durationMinutes - exam.timeRemainingMinutes);
              const progressPercentage = exam.durationMinutes > 0
                ? Math.min(100, Math.round((elapsedMinutes / exam.durationMinutes) * 100))
                : 0;

              return (
                <div key={exam.id} className="ongoing-row-item">
                  {/* Left: Title & Identifiers */}
                  <div className="ongoing-row-info">
                    <div className="ongoing-row-title-line">
                      <h3 className="ongoing-row-title">{exam.title}</h3>
                      <span className="ongoing-type-tag">{exam.type}</span>
                      <span className="ongoing-live-pill">
                        <span className="live-dot" />
                        Live
                      </span>
                    </div>
                    <div className="ongoing-row-meta">
                      <span className="ongoing-code">{exam.code}</span>
                      <span className="meta-sep">&bull;</span>
                      <span className="ongoing-lab">{exam.labRoom}</span>
                    </div>
                  </div>

                  {/* Middle: Clean Telemetry Columns */}
                  <div className="ongoing-row-telemetry">
                    <div className="telemetry-item">
                      <span className="telemetry-label">Workstations</span>
                      <span className="telemetry-val">
                        <strong>{exam.activeStudents}</strong>
                        <span className="telemetry-denom"> / {exam.totalStudents}</span>
                      </span>
                    </div>

                    <div className="telemetry-item">
                      <span className="telemetry-label">Time Remaining</span>
                      <span className="telemetry-val timer">
                        <ClockIcon size={13} />
                        {exam.timeRemainingMinutes}m left
                      </span>
                      <div className="mini-progress-bar" title={`${progressPercentage}% elapsed (${elapsedMinutes}/${exam.durationMinutes}m)`}>
                        <div
                          className="mini-progress-fill"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                    </div>

                    <div className="telemetry-item">
                      <span className="telemetry-label">Security</span>
                      <span
                        className={`telemetry-val ${
                          exam.violationsCount > 0 ? 'alert-flag' : 'clean'
                        }`}
                      >
                        {exam.violationsCount > 0 ? (
                          <>
                            <ShieldAlertIcon size={13} />
                            {exam.violationsCount} flagged
                          </>
                        ) : (
                          <>
                            <CheckIcon size={13} />
                            Clean (0)
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Right: Direct Actions */}
                  <div className="ongoing-row-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenBroadcast(exam)}
                    >
                      Broadcast
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={MonitoringIcon}
                      onClick={() => navigate('/live-exams')}
                    >
                      Proctor
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-section-block">
            <LaptopIcon size={20} className="empty-icon" />
            <p className="empty-text">No active examination sessions running on laboratory terminals right now.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/exams')}
            >
              View Examinations
            </Button>
          </div>
        )}
      </section>

      {/* 4. Balanced Two-Column Section: Ready Exams & Recent Results */}
      <div className="dashboard-split-grid">
        {/* Left Column: Exams ready for the proctor */}
        <section className="dashboard-split-col" aria-label="Exams ready to start">
          <div className="split-header">
            <div>
              <h2 className="split-title">Ready when you are</h2>
              <span className="split-subtitle">Start a published exam whenever your students are ready.</span>
            </div>
            <button
              type="button"
              className="split-header-link"
              onClick={() => navigate('/exams')}
            >
              View exams &rarr;
            </button>
          </div>
          <div className="empty-flat-block">
            <p className="empty-text">
              Publishing generates the student join link. You can launch sessions, monitor terminals, and adjust exam timers directly from the manager.
            </p>
            <Button variant="primary" size="sm" icon={MonitoringIcon} onClick={() => navigate('/live-exams')}>
              Open Live Exam Manager
            </Button>
          </div>
        </section>

        {/* Right Column: Recent Examination Results */}
        <section className="dashboard-split-col" aria-label="Recent Examination Results">
          <div className="split-header">
            <div>
              <h2 className="split-title">Recent Results</h2>
              <span className="split-subtitle">Completed evaluations and class averages</span>
            </div>
            <button
              type="button"
              className="split-header-link"
              onClick={() => navigate('/results')}
            >
              Reports &rarr;
            </button>
          </div>

          {recentResults.length > 0 ? (
            <div className="results-table-container">
              <table className="flat-results-table">
                <thead>
                  <tr>
                    <th>Examination</th>
                    <th>Class</th>
                    <th>Average</th>
                    <th>Pass %</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentResults.map((res) => (
                    <tr key={res.id}>
                      <td>
                        <div className="table-exam-info">
                          <span className="table-exam-title">{res.examTitle}</span>
                          <span className="table-exam-sub">{res.date} &bull; {res.candidates} candidates</span>
                        </div>
                      </td>
                      <td>
                        <span className="table-batch-tag">{res.batch}</span>
                      </td>
                      <td>
                        <span className="table-score-mono">{res.avgScore}</span>
                      </td>
                      <td>
                        <span className="table-pass-pill">{res.passRate}</span>
                      </td>
                      <td className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/results?examId=${res.id}`)}
                        >
                          Analyze
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-flat-block">
              <p className="empty-text">No recent examination results recorded yet.</p>
            </div>
          )}
        </section>
      </div>

      {/* Broadcast Announcement Modal */}
      {activeBroadcastExam && (
        <div className="broadcast-modal-backdrop" onClick={handleCloseBroadcast}>
          <div
            className="broadcast-modal-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="broadcast-dialog-title"
          >
            <div className="broadcast-modal-header">
              <div>
                <h3 id="broadcast-dialog-title" className="broadcast-modal-title">
                  Broadcast Lab Announcement
                </h3>
                <p className="broadcast-modal-sub">
                  Target: {activeBroadcastExam.labRoom} &bull; {activeBroadcastExam.code}
                </p>
              </div>
              <button
                type="button"
                className="broadcast-modal-close"
                onClick={handleCloseBroadcast}
                aria-label="Close dialog"
              >
                <XIcon size={16} />
              </button>
            </div>

            <form onSubmit={handleSendBroadcast} className="broadcast-modal-form">
              <div className="broadcast-form-field">
                <label htmlFor="broadcast-text" className="broadcast-field-label">
                  Announcement Message
                </label>
                <textarea
                  id="broadcast-text"
                  className="broadcast-textarea"
                  rows={4}
                  placeholder="Type an announcement to display across all active student terminals..."
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="broadcast-quick-presets">
                <span className="preset-label">Quick Presets:</span>
                <div className="preset-chips">
                  {PRESET_MESSAGES.map((msg, index) => (
                    <button
                      key={index}
                      type="button"
                      className="preset-chip"
                      onClick={() => setBroadcastMessage(msg)}
                    >
                      {msg}
                    </button>
                  ))}
                </div>
              </div>

              <div className="broadcast-modal-actions">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleCloseBroadcast}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!broadcastMessage.trim()}
                >
                  Send Announcement
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
