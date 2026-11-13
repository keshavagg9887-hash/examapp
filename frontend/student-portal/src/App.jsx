import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';

function App() {
  const joinCode = window.location.pathname.match(/^\/join\/([^/]+)\/?$/)?.[1];
  const [exam, setExam] = useState(null);
  const [state, setState] = useState(joinCode ? 'loading' : 'home');
  const [student, setStudent] = useState(null);
  const [fullName, setFullName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [joinError, setJoinError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [liveSession, setLiveSession] = useState({ status: 'waiting' });
  const [attemptEndsAt, setAttemptEndsAt] = useState(null);
  const [extraTimeSeconds, setExtraTimeSeconds] = useState(0);
  const [warning, setWarning] = useState('');
  const [terminated, setTerminated] = useState(false);
  const [terminatedMessage, setTerminatedMessage] = useState('');
  const [result, setResult] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answerError, setAnswerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [fullscreenActive, setFullscreenActive] = useState(Boolean(document.fullscreenElement));
  const [awaySeconds, setAwaySeconds] = useState(0);
  const [securityError, setSecurityError] = useState('');
  const [attemptStarted, setAttemptStarted] = useState(false);
  const socketRef = useRef(null);
  const awayActiveRef = useRef(false);
  const attemptStartedRef = useRef(false);
  const loadQuestionsRef = useRef(() => {});

  useEffect(() => {
    if (!joinCode) return;
    let cancelled = false;
    fetch(`/api/student/exams/${encodeURIComponent(joinCode)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Unable to open this exam.');
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setExam(data.exam);
        setStudent(data.student || null);
        setLiveSession(data.liveSession || { status: 'waiting' });
        setAttemptEndsAt(data.student?.attemptEndsAt || null);
        setAttemptStarted(Boolean(data.student?.attemptStartedAt));
        attemptStartedRef.current = Boolean(data.student?.attemptStartedAt);
        if (data.student?.terminated) {
          setTerminated(true);
          setTerminatedMessage(data.student.status === 'submitted'
            ? 'This attempt is locked and cannot be reopened.'
            : 'Your teacher ended this exam session.');
        }
        if (data.student?.score != null) setResult({ score: data.student.score, totalMarks: data.exam.total_marks });
        setState('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        setState('error');
        setExam({ error: error.message });
      });
    return () => { cancelled = true; };
  }, [joinCode]);

  useEffect(() => {
    if (!student?.id) return undefined;
    const loadQuestions = async () => {
      try {
        const response = await fetch(`/api/student/exams/${encodeURIComponent(joinCode)}/questions`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Could not load exam questions.');
        setQuestions(data.questions || []);
        setAnswerError('');
      } catch (error) {
        setAnswerError(error.message);
      }
    };
    loadQuestionsRef.current = loadQuestions;
    const socket = io({ withCredentials: true });
    socketRef.current = socket;
    socket.on('student:session_state', (data) => {
      setLiveSession(data.liveSession || { status: 'waiting' });
      setExtraTimeSeconds(data.extraTimeSeconds || 0);
      setAttemptEndsAt(data.attemptEndsAt || null);
      setAttemptStarted(Boolean(data.attemptStartedAt));
      attemptStartedRef.current = Boolean(data.attemptStartedAt);
      if (data.result) setResult(data.result);
    });
    socket.on('exam:session', (session) => {
      setLiveSession(session);
    });
    socket.on('exam:questions_updated', () => {
      if (attemptStartedRef.current) loadQuestionsRef.current();
    });
    socket.on('student:time_adjusted', ({ extraTimeSeconds: seconds }) => setExtraTimeSeconds(seconds || 0));
    socket.on('student:attempt_time_adjusted', ({ attemptEndsAt: endsAt, extraTimeSeconds: seconds }) => {
      setAttemptEndsAt(endsAt || null);
      if (seconds != null) setExtraTimeSeconds(seconds);
    });
    socket.on('student:warning', ({ message }) => setWarning(message));
    socket.on('student:terminated', (data = {}) => {
      setTerminated(true);
      setTerminatedMessage(data.message || 'Your teacher ended this exam session.');
    });
    socket.on('student:result', setResult);
    socket.on('student:returned', () => {
      awayActiveRef.current = false;
      setAwaySeconds(0);
    });
    socket.on('exam:manager_state', (data) => {
      setLiveSession(data.liveSession || { status: 'waiting' });
      const me = data.students?.find((item) => item.id === student.id);
      if (me) setAttemptEndsAt(me.attemptEndsAt || null);
      if (me?.score != null) setResult({ score: me.score, totalMarks: exam?.total_marks, status: me.status });
      if (me?.status === 'terminated') setTerminated(true);
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
      loadQuestionsRef.current = () => {};
    };
  }, [student?.id, exam?.total_marks, joinCode]);

  useEffect(() => {
    attemptStartedRef.current = attemptStarted;
    if (attemptStarted && fullscreenActive && liveSession.status === 'live' && questions.length === 0) loadQuestionsRef.current();
  }, [attemptStarted, fullscreenActive, liveSession.status, questions.length]);

  useEffect(() => {
    setCurrentQuestionIndex((current) => Math.max(0, Math.min(current, questions.length - 1)));
  }, [questions.length]);

  useEffect(() => {
    if (liveSession.status !== 'live' || !student?.id || !attemptStarted || result || terminated) return undefined;
    let countdown;
    const beginAway = (kind, details) => {
      if (awayActiveRef.current) return;
      awayActiveRef.current = true;
      setAwaySeconds(5);
      socketRef.current?.emit('student:away', { kind, details });
      countdown = window.setInterval(() => {
        setAwaySeconds((remaining) => {
          if (remaining <= 1) {
            window.clearInterval(countdown);
            return 0;
          }
          return remaining - 1;
        });
      }, 1000);
    };
    const returnToExam = () => {
      if (!awayActiveRef.current) return;
      awayActiveRef.current = false;
      window.clearInterval(countdown);
      setAwaySeconds(0);
      socketRef.current?.emit('student:returned');
    };
    const onVisibilityChange = () => {
      if (document.hidden) beginAway('tab_switch', 'Student switched away from the exam tab.');
      else returnToExam();
    };
    const onBlur = () => beginAway('window_blur', 'Student switched away from the exam window.');
    const onFocus = () => returnToExam();
    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setFullscreenActive(active);
      if (active) returnToExam();
      else beginAway('fullscreen_exit', 'Student exited full-screen mode.');
    };
    const recordBlockedAction = (kind, details) => (event) => {
      event.preventDefault();
      socketRef.current?.emit('student:violation', { kind, details });
    };
    const onCopy = recordBlockedAction('copy', 'Copy was blocked during the exam.');
    const onCut = recordBlockedAction('cut', 'Cut was blocked during the exam.');
    const onPaste = recordBlockedAction('paste', 'Paste was blocked during the exam.');
    const onContextMenu = recordBlockedAction('context_menu', 'Context menu was blocked during the exam.');
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      const blockedCombo = (modifier && ['a', 'c', 'v', 'x', 'p', 's', 'u', 'tab', 'insert'].includes(key))
        || (event.shiftKey && ['insert', 'delete'].includes(key))
        || (event.altKey && ['arrowleft', 'arrowright', 'tab'].includes(key));
      const developerCombo = modifier && event.shiftKey && ['i', 'j', 'c'].includes(key);
      if (blockedCombo || developerCombo || key === 'f12') {
        event.preventDefault();
        socketRef.current?.emit('student:violation', {
          kind: 'blocked_shortcut', details: `Blocked keyboard shortcut: ${event.key}`,
        });
      }
      if (key === 'escape') {
        event.preventDefault();
        beginAway('fullscreen_exit', 'Escape key pressed during the exam.');
      }
    };
    const preventDrag = (event) => event.preventDefault();
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('dragstart', preventDrag);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    if (document.hidden || !document.hasFocus()) beginAway('window_blur', 'Exam began while the exam window was not active.');
    return () => {
      window.clearInterval(countdown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('dragstart', preventDrag);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [liveSession.status, student?.id, attemptStarted, result, terminated]);

  useEffect(() => {
    if (liveSession.status !== 'live' || !attemptEndsAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [liveSession.status, attemptEndsAt]);

  const handleJoin = async (event) => {
    event.preventDefault();
    setJoinError('');
    setIsJoining(true);
    try {
      const response = await fetch(`/api/student/exams/${encodeURIComponent(joinCode)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, rollNumber }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not join this exam.');
      setStudent(data.student);
    } catch (error) {
      setJoinError(error.message);
    } finally {
      setIsJoining(false);
    }
  };

  const enterFullscreen = async () => {
    setSecurityError('');
    try {
      if (!document.documentElement.requestFullscreen) throw new Error('Full-screen mode is not supported by this browser.');
      await document.documentElement.requestFullscreen();
      setFullscreenActive(true);
      const questionsResponse = await fetch(`/api/student/exams/${encodeURIComponent(joinCode)}/questions`);
      const questionsData = await questionsResponse.json().catch(() => ({}));
      if (!questionsResponse.ok) throw new Error(questionsData.message || 'Could not load exam questions.');
      if (!questionsData.questions?.length) throw new Error('This exam has no questions to load yet. Contact your teacher.');
      const startResponse = await fetch(`/api/student/exams/${encodeURIComponent(joinCode)}/start`, { method: 'POST' });
      const startData = await startResponse.json().catch(() => ({}));
      if (!startResponse.ok) throw new Error(startData.message || 'Could not start your exam timer.');
      setQuestions(questionsData.questions || []);
      setAttemptEndsAt(startData.endsAt);
      setLiveSession((current) => ({ ...current, status: 'live', startedAt: startData.startedAt }));
      setAttemptStarted(true);
      attemptStartedRef.current = true;
    } catch (error) {
      setSecurityError(error.message || 'Allow full-screen mode to begin answering.');
      setFullscreenActive(false);
    }
  };

  const handleAnswer = async (question, optionId, checked) => {
    const selectedOptionIds = question.type === 'mcq_single'
      ? [optionId]
      : checked
        ? [...question.selectedOptionIds, optionId]
        : question.selectedOptionIds.filter((id) => id !== optionId);
    setQuestions((current) => current.map((item) => item.id === question.id ? { ...item, selectedOptionIds } : item));
    setAnswerError('');
    try {
      const response = await fetch(`/api/student/exams/${encodeURIComponent(joinCode)}/answers/${encodeURIComponent(question.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedOptionIds }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Answer could not be saved.');
    } catch (error) {
      setAnswerError(error.message);
    }
  };

  const handleSubmitExam = async () => {
    if (!window.confirm('Submit your exam now? You will not be able to change your answers.')) return;
    setIsSubmitting(true);
    setAnswerError('');
    try {
      const response = await fetch(`/api/student/exams/${encodeURIComponent(joinCode)}/submit`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Exam could not be submitted.');
      setResult(data.result);
    } catch (error) {
      setAnswerError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingSeconds = attemptEndsAt
    ? Math.max(0, Math.floor((new Date(attemptEndsAt).getTime() + extraTimeSeconds * 1000 - now) / 1000))
    : null;
  const remainingLabel = remainingSeconds == null
    ? ''
    : `${String(Math.floor(remainingSeconds / 3600)).padStart(2, '0')}:${String(Math.floor((remainingSeconds % 3600) / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;
  const currentQuestion = questions[currentQuestionIndex];

  return (
    <main className={`student-shell ${attemptStarted && liveSession.status === 'live' ? 'exam-mode-shell' : ''}`}>
      <header className="student-header">
        <a className="brand" href="/" aria-label="ExamLAN home"><span className="brand-mark">E</span> ExamLAN</a>
        <span className="header-note">Student Portal</span>
      </header>

      <section className={`student-card ${attemptStarted && liveSession.status === 'live' ? 'exam-mode-card' : ''}`} aria-live="polite">
        {!joinCode && (
          <>
            <div className="eyebrow">EXAMLAN STUDENT PORTAL</div>
            <h1>Welcome</h1>
            <p className="lead">Open the exam link shared by your teacher to view its details.</p>
          </>
        )}
        {state === 'loading' && <p className="lead">Loading exam details…</p>}
        {state === 'error' && (
          <div className="notice error-notice">
            <h1>Exam link unavailable</h1>
            <p>{exam?.error}</p>
            <p>Check that you opened the complete link shared by your teacher.</p>
          </div>
        )}
        {state === 'ready' && (
          <>
            <div className="eyebrow">EXAM DETAILS</div>
            <h1>{exam.title}</h1>
            <p className="lead">{exam.subject}{exam.course ? ` · ${exam.course}` : ''}</p>
            <div className="exam-facts">
              <div><span>Duration</span><strong>{exam.duration} minutes</strong></div>
              <div><span>Total marks</span><strong>{exam.total_marks}</strong></div>
            </div>
            {exam.instructions && <div className="instructions"><h2>Instructions</h2><p>{exam.instructions}</p></div>}
            {!student && liveSession.status === 'waiting' && (
              <div className="notice waiting-notice">
                <strong>Exam details are ready</strong>
                <p>The exam has not started yet. Enter your student details below; the questions will appear when your teacher starts it.</p>
              </div>
            )}
            {student ? (
              <div className="student-exam-state">
                {warning && <div className="warning-backdrop" role="presentation">
                  <section className="warning-dialog" role="alertdialog" aria-modal="true" aria-labelledby="teacher-warning-title">
                    <div className="warning-dialog-icon" aria-hidden="true">!</div>
                    <h2 id="teacher-warning-title">Message from your teacher</h2>
                    <p>{warning}</p>
                    <button type="button" className="jee-primary-button" onClick={() => setWarning('')}>I understand</button>
                  </section>
                </div>}
                {terminated ? (
                  <div className="notice error-notice"><h2>Attempt locked</h2><p>{terminatedMessage || 'This exam attempt has ended and cannot be reopened.'}</p>{result && <p>Score: {result.score} / {result.totalMarks ?? exam.total_marks}</p>}</div>
                ) : result ? (
                  <div className="notice success-notice"><strong>Exam result</strong><p>{student.fullName} · Roll number {student.rollNumber}</p><p>Score: {result.score} / {result.totalMarks ?? exam.total_marks}</p></div>
                ) : (
                  <div className={`notice ${liveSession.status === 'live' ? 'success-notice' : liveSession.status === 'waiting' ? 'waiting-notice' : ''}`}>
                    <strong>{liveSession.status === 'live' ? 'Exam is in progress' : liveSession.status === 'finished' ? 'Exam finished' : 'Waiting for your teacher to start the exam'}</strong>
                    <p>{student.fullName} · Roll number {student.rollNumber}</p>
                    {liveSession.status === 'live'
                      ? attemptEndsAt
                        ? <p>Time remaining: <strong>{remainingLabel}</strong>{extraTimeSeconds > 0 ? ` · ${Math.floor(extraTimeSeconds / 60)} minutes extra time` : ''}</p>
                        : <p>Your teacher has opened the exam. Your timer starts after you enter full-screen and the questions finish loading.</p>
                      : liveSession.status === 'finished'
                        ? <p>Your result is being prepared.</p>
                        : <p>Keep this page open. The exam details are ready, and your teacher will start the exam from Live Exam Manager.</p>}
                  </div>
                )}
                {liveSession.status === 'live' && !result && !terminated && (
                  <>
                    {awaySeconds > 0 && <div className="notice warning-notice" role="alert"><strong>Return to your exam now</strong><p>Your exam will be submitted if you do not return within {awaySeconds} second{awaySeconds === 1 ? '' : 's'}.</p></div>}
                    {securityError && <div className="join-error" role="alert">{securityError}</div>}
                    {!fullscreenActive ? (
                      <section className="secure-mode-card">
                        <div className="eyebrow">SECURE EXAM MODE</div>
                        <h2>Enter full-screen to answer</h2>
                        <p>Stay on this page. Leaving the tab or exiting full-screen starts a five-second return countdown. Your timer starts after the questions load.</p>
                        <button className="join-button" type="button" onClick={enterFullscreen}>{securityError ? 'Retry loading exam' : 'Enter exam'}</button>
                      </section>
                    ) : <section className="student-quiz jee-quiz">
                      <div className="jee-topbar">
                        <div><span>QUESTION</span><strong>{String(currentQuestionIndex + 1).padStart(2, '0')} <small>/ {String(questions.length).padStart(2, '0')}</small></strong></div>
                        <div><span>TIME LEFT</span><strong>{remainingLabel || '—'}</strong></div>
                      </div>
                      {answerError && <div className="join-error" role="alert">{answerError}</div>}
                      {!currentQuestion ? <p className="lead">Loading questions…</p> : (
                        <article className="jee-question" key={currentQuestion.id}>
                          <div className="jee-question-heading">
                            <span>QUESTION {String(currentQuestionIndex + 1).padStart(2, '0')}</span>
                            <span>CORRECT: +{currentQuestion.marks} MARKS | INCORRECT: 0 · {currentQuestion.type === 'mcq_multi' ? 'SELECT ALL THAT APPLY' : 'SINGLE CORRECT'}</span>
                          </div>
                          <h2>{currentQuestion.statement}</h2>
                          <div className="jee-options">
                            {currentQuestion.options.map((option, optionIndex) => (
                              <label className={currentQuestion.selectedOptionIds?.includes(option.id) ? 'selected' : ''} key={option.id}>
                                <input
                                  type={currentQuestion.type === 'mcq_single' ? 'radio' : 'checkbox'}
                                  name={currentQuestion.id}
                                  checked={currentQuestion.selectedOptionIds?.includes(option.id) || false}
                                  onChange={(event) => handleAnswer(currentQuestion, option.id, event.target.checked)}
                                />
                                <span className="jee-option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                                <span className="jee-option-text">{option.text}</span>
                              </label>
                            ))}
                          </div>
                        </article>
                      )}
                      <div className="jee-navigation">
                        <button type="button" className="jee-secondary-button" onClick={() => setCurrentQuestionIndex((index) => Math.max(0, index - 1))} disabled={currentQuestionIndex === 0}>← Previous</button>
                        <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
                        <button type="button" className="jee-primary-button" onClick={() => setCurrentQuestionIndex((index) => Math.min(questions.length - 1, index + 1))} disabled={currentQuestionIndex >= questions.length - 1}>Save &amp; Next →</button>
                      </div>
                      <div className="jee-question-palette" aria-label="Question navigation">
                        {questions.map((question, index) => (
                          <button
                            type="button"
                            key={question.id}
                            className={`${index === currentQuestionIndex ? 'current' : ''} ${question.selectedOptionIds?.length ? 'answered' : ''}`}
                            onClick={() => setCurrentQuestionIndex(index)}
                            aria-label={`Go to question ${index + 1}${question.selectedOptionIds?.length ? ', answered' : ', unanswered'}`}
                          >{index + 1}</button>
                        ))}
                      </div>
                      {questions.length > 0 && <button className="jee-submit-button" type="button" onClick={handleSubmitExam} disabled={isSubmitting}>{isSubmitting ? 'Submitting…' : 'Submit exam'}</button>}
                    </section>}
                  </>
                )}
              </div>
            ) : liveSession.status === 'finished' ? (
              <div className="notice error-notice"><h2>Exam finished</h2><p>This exam is no longer accepting students.</p></div>
            ) : (
              <form className="join-form" onSubmit={handleJoin}>
                <h2>Enter your student details</h2>
                <p>Use the name and roll number your teacher expects for this exam.</p>
                <label>
                  Full name
                  <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required minLength={2} maxLength={120} />
                </label>
                <label>
                  Roll number
                  <input value={rollNumber} onChange={(event) => setRollNumber(event.target.value)} autoComplete="off" required maxLength={40} />
                </label>
                {joinError && <div className="join-error" role="alert">{joinError}</div>}
                <button className="join-button" type="submit" disabled={isJoining}>
                  {isJoining ? 'Joining…' : 'Continue'}
                </button>
                <small>This is an exam-specific sign-in using your name and roll number; it doesn’t create a password-based account.</small>
              </form>
            )}
          </>
        )}
      </section>
      <footer>Use the link provided by your teacher. No installation is required.</footer>
    </main>
  );
}

export default App;
