// src/routes/AppRoutes.jsx
import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MainLayout } from '../layouts/MainLayout';
import { AuthPage } from '../pages/auth/AuthPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { QuestionsPage } from '../pages/questions/QuestionsPage';
import { CreateExamPage } from '../pages/exams/CreateExamPage';
import { AllExamsPage } from '../pages/exams/AllExamsPage';
import { LiveExamManagerPage } from '../pages/exams/LiveExamManagerPage';
import { ResultsPage } from '../pages/results/ResultsPage';
import { StudentRosterPage } from '../pages/roster/StudentRosterPage';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { QuestionBankProvider } from '../context/QuestionBankContext';

// Optional – only if these pages actually exist.
// import { ExamListPage } from '../pages/results/ExamListPage';
// import { ExamResultsPage } from '../pages/results/ExamResultsPage';
// import { StudentResultPage } from '../pages/results/StudentResultPage';
// import { AnswerReviewPage } from '../pages/results/AnswerReviewPage';

/* -------------------------------------------------------------------------- */
/*  Route guards                                                               */
/* -------------------------------------------------------------------------- */

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isSessionLoading } = useAuth();
  const location = useLocation();

  if (isSessionLoading) return <div className="route-loading">Checking your session…</div>;

  if (!isAuthenticated) {
    // Redirect unauthenticated users to the login page
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, isSessionLoading } = useAuth();

  if (isSessionLoading) return <div className="route-loading">Checking your session…</div>;

  if (isAuthenticated) {
    // If already logged in, prevent access to login / register pages
    return <Navigate to="/" replace />;
  }

  return children;
};

/* -------------------------------------------------------------------------- */
/*  Main routing tree                                                          */
/* -------------------------------------------------------------------------- */

export const AppRoutes = () => {
  return (
      <Routes>
        {/* Public Auth Routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <AuthPage initialMode="login" />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <AuthPage initialMode="register" />
            </PublicRoute>
          }
        />

        {/* Protected Teacher‑Portal Routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          {/* Dashboard */}
          <Route index element={<DashboardPage />} />

          {/* Phase 2 – Question Bank */}
          <Route path="questions"  element={
            <ProtectedRoute>
              <QuestionBankProvider>
                <QuestionsPage />
              </QuestionBankProvider>
            </ProtectedRoute>
          }/>

          <Route path="exams" element={<AllExamsPage />} />
          <Route
            path="exams/create"
            element={
              <QuestionBankProvider>
                <CreateExamPage />
              </QuestionBankProvider>
            }
          />
          <Route
            path="exams/:examId/edit"
            element={
              <QuestionBankProvider>
                <CreateExamPage />
              </QuestionBankProvider>
            }
          />

          {/* Phase 4 – Live Monitoring */}
          <Route path="monitoring" element={<Navigate to="/live-exams" replace />} />
          <Route path="live-exams" element={<LiveExamManagerPage />} />

          {/* Phase 5 – Results */}
          <Route path="results" element={<ResultsPage />} />
          {/* Uncomment the following routes if the corresponding pages exist */}
          {/* <Route path="results/exams" element={<ExamListPage />} /> */}
          {/* <Route path="results/exams/:examId" element={<ExamResultsPage />} /> */}
          {/* <Route path="results/exams/:examId/students/:studentId" element={<StudentResultPage />} /> */}
          {/* <Route path="results/exams/:examId/students/:studentId/review" element={<AnswerReviewPage />} /> */}

          {/* Phase 6 – Student Roster */}
          <Route path="students" element={<StudentRosterPage />} />

          {/* Phase 6 – Settings */}
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Fallback – any unknown route goes to the dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
  );
};
