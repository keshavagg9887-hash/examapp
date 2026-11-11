import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Badge } from '../../components/common/Badge';
import {
  DownloadIcon,
  RefreshIcon,
  CheckIcon,
  XIcon,
  AlertCircleIcon,
} from '../../components/common/Icons';
import './ResultsPage.css';

export const ResultsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryExamId = searchParams.get('examId') || '';

  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(queryExamId);
  const [selectedExam, setSelectedExam] = useState(null);
  const [search, setSearch] = useState('');
  const [filterPass, setFilterPass] = useState(''); // 'all', 'passed', 'failed'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Student answer review modal
  const [reviewingStudent, setReviewingStudent] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Fetch results overview for the chosen examination
  const fetchResults = useCallback(async (examIdToFetch = selectedExamId) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (examIdToFetch) params.append('examId', examIdToFetch);

      const response = await fetch(`/api/results?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch examination results.');
      }

      setExams(data.exams || []);
      if (data.selectedExam) {
        setSelectedExam(data.selectedExam);
        setSelectedExamId(String(data.selectedExam.id));
      } else {
        setSelectedExam(null);
      }
    } catch (err) {
      console.error('[ResultsPage] Error:', err);
      setError(err.message || 'Could not load examination results.');
    } finally {
      setLoading(false);
    }
  }, [selectedExamId]);

  // Sync selected exam from URL query param when it changes
  useEffect(() => {
    if (queryExamId && queryExamId !== selectedExamId) {
      setSelectedExamId(queryExamId);
      fetchResults(queryExamId);
    } else {
      fetchResults(selectedExamId);
    }
  }, [queryExamId]);

  // Handle dropdown exam change
  const handleExamChange = (newExamId) => {
    setSelectedExamId(newExamId);
    setSearchParams(newExamId ? { examId: newExamId } : {});
    fetchResults(newExamId);
  };

  // Fetch detailed student answers review
  const handleOpenReview = async (student) => {
    if (!selectedExam) return;
    setReviewingStudent(student);
    setReviewLoading(true);
    setReviewError('');
    setReviewData(null);

    try {
      const response = await fetch(
        `/api/results/exams/${selectedExam.id}/students/${student.participantId}`,
        { credentials: 'include' }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch student answer review.');
      }
      setReviewData(data);
    } catch (err) {
      console.error('[ResultsPage] Review Error:', err);
      setReviewError(err.message || 'Could not load student answers.');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleCloseReview = () => {
    setReviewingStudent(null);
    setReviewData(null);
    setReviewError('');
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!selectedExam || !selectedExam.studentResults?.length) return;

    const headers = [
      'Student ID',
      'Student Name',
      'Roll Number',
      'Exam ID',
      'Exam Title',
      'Score',
      'Max Score',
      'Percentage',
      'Status',
      'Violations Flagged',
      'Submitted At',
    ];

    const rows = selectedExam.studentResults.map((r) => [
      `"${r.participantId}"`,
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `"${(r.roll || '').replace(/"/g, '""')}"`,
      `"${selectedExam.id}"`,
      `"${(selectedExam.title || '').replace(/"/g, '""')}"`,
      r.score != null ? r.score : 0,
      r.maxScore != null ? r.maxScore : selectedExam.totalMarks,
      `${r.percentage}%`,
      r.passed ? 'PASSED' : 'FAILED',
      r.violationsCount || 0,
      r.submittedAt ? `"${new Date(r.submittedAt).toISOString()}"` : '""',
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeTitle = (selectedExam.title || 'exam').toLowerCase().replace(/[^a-z0-9]/g, '_');
    link.setAttribute('download', `${safeTitle}_results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Print Report
  const handlePrint = () => {
    window.print();
  };

  // Client-side filtering of student results
  const rawResults = selectedExam?.studentResults || [];
  const filteredResults = rawResults.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.roll.toLowerCase().includes(search.toLowerCase());
    const matchesPass =
      filterPass === 'passed' ? r.passed : filterPass === 'failed' ? !r.passed : true;
    return matchesSearch && matchesPass;
  });

  const statistics = selectedExam?.statistics || {
    classAvg: 0,
    classAvgPercentage: 0,
    highestMarks: 0,
    lowestMarks: 0,
    passPercentage: 0,
    passCount: 0,
    failCount: 0,
    totalCandidates: 0,
    gradeDistribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
  };

  const examOptions = exams.map((e) => ({
    value: String(e.id),
    label: `${e.title} (${e.candidatesCount} candidate${e.candidatesCount === 1 ? '' : 's'})`,
  }));

  return (
    <div className="results-page">
      {/* Header with Title and Exam Selector */}
      <div className="results-header-strip no-print">
        <div>
          <h2 className="page-title">Exam Results &amp; Reports</h2>
          <p className="results-subtitle">
            Official performance records, automated evaluations, and candidate score breakdowns.
          </p>
        </div>

        <div className="results-exam-selector">
          <Select
            label="Selected Examination"
            options={examOptions}
            value={selectedExamId}
            onChange={handleExamChange}
          />
        </div>
      </div>

      {error && (
        <div className="results-error-banner no-print" role="alert">
          <AlertCircleIcon size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => fetchResults(selectedExamId)} className="results-retry-link">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="results-loading-state">
          <p>Loading examination results from database...</p>
        </div>
      ) : !selectedExam ? (
        <div className="results-empty-state">
          <p className="empty-title">No examinations found</p>
          <p className="empty-desc">
            No examination results or student submissions are currently recorded in the database.
          </p>
          <Button variant="primary" size="sm" onClick={() => navigate('/exams')}>
            View Examinations
          </Button>
        </div>
      ) : (
        <>
          {/* Printable Report Header (shown in print mode) */}
          <div className="printable-report-header">
            <div className="report-inst-title">EXAMLAN ASSESSMENT &amp; EVALUATION REPORT</div>
            <h1 className="report-exam-title">{selectedExam.title}</h1>
            <div className="report-meta-row">
              <span><strong>Subject:</strong> {selectedExam.subject || 'General'}</span>
              <span>&bull;</span>
              <span><strong>Batch:</strong> {selectedExam.batch || 'All'}</span>
              <span>&bull;</span>
              <span><strong>Lab:</strong> {selectedExam.lab || 'Computer Lab'}</span>
              <span>&bull;</span>
              <span><strong>Total Marks:</strong> {selectedExam.totalMarks}</span>
              <span>&bull;</span>
              <span><strong>Generated:</strong> {new Date().toLocaleDateString()}</span>
            </div>
          </div>

          {/* Statistics Grid */}
          <section className="stats-grid" aria-label="Examination Summary Statistics">
            <div className="stat-card">
              <span className="stat-card-label">Class Average</span>
              <div className="stat-card-value">
                {statistics.classAvg} <span className="stat-denom">/ {selectedExam.totalMarks}</span>
              </div>
              <span className="stat-card-subtext">{statistics.classAvgPercentage}% overall score</span>
            </div>

            <div className="stat-card">
              <span className="stat-card-label">Highest Marks</span>
              <div className="stat-card-value">
                {statistics.highestMarks} <span className="stat-denom">/ {selectedExam.totalMarks}</span>
              </div>
              <span className="stat-card-subtext">Top score achieved</span>
            </div>

            <div className="stat-card">
              <span className="stat-card-label">Lowest Marks</span>
              <div className="stat-card-value">
                {statistics.lowestMarks} <span className="stat-denom">/ {selectedExam.totalMarks}</span>
              </div>
              <span className="stat-card-subtext">Minimum score</span>
            </div>

            <div className="stat-card">
              <span className="stat-card-label">Pass Percentage</span>
              <div className="stat-card-value">{statistics.passPercentage}%</div>
              <span className="stat-card-subtext">
                {statistics.passCount} of {statistics.totalCandidates} passed (40% threshold)
              </span>
            </div>

            <div className="stat-card grade-dist-card">
              <span className="stat-card-label">Grade Distribution</span>
              <div className="grade-pills-row">
                <span className="grade-pill" title="90% and above">
                  <strong>A:</strong> {statistics.gradeDistribution.A}
                </span>
                <span className="grade-pill" title="80% to 89%">
                  <strong>B:</strong> {statistics.gradeDistribution.B}
                </span>
                <span className="grade-pill" title="70% to 79%">
                  <strong>C:</strong> {statistics.gradeDistribution.C}
                </span>
                <span className="grade-pill" title="60% to 69%">
                  <strong>D:</strong> {statistics.gradeDistribution.D}
                </span>
                <span className="grade-pill grade-pill-f" title="Below 60%">
                  <strong>F:</strong> {statistics.gradeDistribution.F}
                </span>
              </div>
              <span className="stat-card-subtext">Standard academic criteria</span>
            </div>
          </section>

          {/* Controls: Search, Status Filter, Export, Print */}
          <div className="results-controls-row no-print">
            <div className="search-filter-group">
              <Input
                placeholder="Search by student name or roll..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="results-search-input"
              />
              <Select
                options={[
                  { value: '', label: 'All Results' },
                  { value: 'passed', label: 'Passed Only' },
                  { value: 'failed', label: 'Failed Only' },
                ]}
                value={filterPass}
                onChange={(v) => setFilterPass(v)}
                className="status-select"
              />
            </div>

            <div className="results-actions-group">
              <Button
                variant="outline"
                size="sm"
                icon={DownloadIcon}
                onClick={handleExportCSV}
                disabled={filteredResults.length === 0}
              >
                Export CSV
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handlePrint}
              >
                Print Report
              </Button>
            </div>
          </div>

          {/* Results Table */}
          <div className="results-table-container">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Roll Number</th>
                  <th>Score</th>
                  <th>Max</th>
                  <th>Percentage</th>
                  <th>Status</th>
                  <th className="no-print text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.length > 0 ? (
                  filteredResults.map((r) => (
                    <tr
                      key={r.participantId}
                      className="results-row"
                    >
                      <td>
                        <span className="student-name-bold">{r.name}</span>
                      </td>
                      <td>
                        <span className="student-roll-code">{r.roll}</span>
                      </td>
                      <td>
                        <span className="score-value-cell">{r.score}</span>
                      </td>
                      <td>
                        <span className="max-score-cell">{r.maxScore}</span>
                      </td>
                      <td>
                        <span className="percentage-cell">{r.percentage}%</span>
                      </td>
                      <td>
                        <Badge
                          variant={r.passed ? 'success' : 'danger'}
                          size="sm"
                        >
                          {r.passed ? 'Passed' : 'Failed'}
                        </Badge>
                      </td>
                      <td className="no-print text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenReview(r)}
                        >
                          Review Answers
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="results-empty-cell">
                      No student results match the current search query or filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Student Answer Review Modal */}
      {reviewingStudent && (
        <Modal
          onClose={handleCloseReview}
          title={`Answer Review — ${reviewingStudent.name} (${reviewingStudent.roll})`}
        >
          <div className="review-modal-body">
            <div className="review-summary-strip">
              <div className="review-stat">
                <span className="review-label">Total Score</span>
                <span className="review-val">
                  <strong>{reviewingStudent.score}</strong> / {reviewingStudent.maxScore}
                </span>
              </div>
              <div className="review-stat">
                <span className="review-label">Percentage</span>
                <span className="review-val">{reviewingStudent.percentage}%</span>
              </div>
              <div className="review-stat">
                <span className="review-label">Status</span>
                <Badge variant={reviewingStudent.passed ? 'success' : 'danger'} size="sm">
                  {reviewingStudent.passed ? 'Passed' : 'Failed'}
                </Badge>
              </div>
              <div className="review-stat">
                <span className="review-label">Violations</span>
                <span className="review-val">
                  {reviewingStudent.violationsCount > 0 ? (
                    <span className="text-danger">{reviewingStudent.violationsCount} Flagged</span>
                  ) : (
                    'Clean (0)'
                  )}
                </span>
              </div>
            </div>

            {reviewLoading ? (
              <p className="review-loading">Loading student submission details...</p>
            ) : reviewError ? (
              <p className="review-error">{reviewError}</p>
            ) : reviewData ? (
              <div className="review-questions-list">
                {reviewData.questions.map((q) => (
                  <div
                    key={q.id || q.position}
                    className={`review-question-card ${q.isCorrect ? 'correct' : 'incorrect'}`}
                  >
                    <div className="review-q-header">
                      <span className="review-q-number">Question {q.position}</span>
                      <div className="review-q-marks">
                        <span className={`marks-tag ${q.marksAwarded > 0 ? 'earned' : 'zero'}`}>
                          {q.marksAwarded} / {q.marks} marks
                        </span>
                        <span className={`status-pill ${q.isCorrect ? 'correct' : 'incorrect'}`}>
                          {q.isCorrect ? 'Correct' : 'Incorrect'}
                        </span>
                      </div>
                    </div>

                    <p className="review-q-statement">{q.statement}</p>

                    <div className="review-options-list">
                      {q.options.map((opt) => {
                        const isChosen = q.selectedOptionIds.includes(opt.id);
                        const isAnswer = opt.isCorrect;

                        let optClass = 'opt-neutral';
                        if (isAnswer) optClass = 'opt-correct';
                        else if (isChosen && !isAnswer) optClass = 'opt-wrong';

                        return (
                          <div key={opt.id} className={`review-option-item ${optClass}`}>
                            <div className="opt-indicator">
                              {isChosen ? (
                                isAnswer ? <CheckIcon size={14} color="#166534" /> : <XIcon size={14} color="#991b1b" />
                              ) : isAnswer ? (
                                <CheckIcon size={14} color="#166534" />
                              ) : (
                                <span className="opt-circle" />
                              )}
                            </div>
                            <span className="opt-text">{opt.text}</span>
                            <div className="opt-tags">
                              {isChosen && <span className="tag-chosen">Student Choice</span>}
                              {isAnswer && <span className="tag-correct">Correct Answer</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div className="review-q-explanation">
                        <strong>Explanation:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="review-modal-footer">
              <Button variant="secondary" size="sm" onClick={handleCloseReview}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
