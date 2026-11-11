import express from 'express';
import { createServer } from 'node:http';
import dotenv from 'dotenv';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pool from './conn.js';
import authRouter from './routers/authRouter.js';
import examRouter from './routers/examRouter.js';
import questionBankRouter from './routers/questionBankRouter.js';
import studentExamRouter from './routers/studentExamRouter.js';
import dashboardRouter from './routers/dashboardRouter.js';
import studentRosterRouter from './routers/studentRosterRouter.js';
import resultsRouter from './routers/resultsRouter.js';
import { isAuthenticated } from './middlewares/authMiddleware.js';
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';
import { createSocketServer } from './realtime/socketServer.js';
dotenv.config();
const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;
const PgSession = connectPgSimple(session);

// CORS for local lab frontend communication with credentials/cookies
app.use((req, res, next) => {
  const origin = req.headers.origin || 'http://localhost:5173';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Express Session configuration backed by PostgreSQL
const sessionMiddleware = session({
    store: new PgSession({
      pool: pool,
      tableName: 'session',
      createTableIfMissing: true, // Automatically creates the "session" table in PostgreSQL
    }),
    secret: process.env.SESSION_SECRET || 'examlan_master_lab_session_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days session lifetime
      httpOnly: true, // Prevent client-side script access
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  });
app.use(sessionMiddleware);
createSocketServer(httpServer, sessionMiddleware);

// Mount Authentication Router
app.use('/api/auth', authRouter);
// Exam links are public so students can open them without a teacher account.
app.use('/api/student/exams', studentExamRouter);
// Protect every other API endpoint. Public login and registration are handled
// by authRouter before this middleware; new APIs should be mounted after it.
app.use('/api', isAuthenticated);

// Folder and question APIs use the signed-in teacher's automatically provisioned bank.
app.use('/api/question-bank', questionBankRouter);
app.use('/api/exams', examRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/students', studentRosterRouter);
app.use('/api/results', resultsRouter);







// Server Health Check is protected along with the rest of the API.
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    server: 'ExamLAN Master Server Node',
    version: '2.4.0',
    timestamp: new Date().toISOString(),
  });
});

// Error Handling Middlewares
app.use(notFound);
app.use(errorHandler);

// Start Server
httpServer.listen(PORT, () => {
  console.log(`[ExamLAN Server] Master Node running on port ${PORT}`);
  console.log(`[ExamLAN Server] Auth endpoints mounted at http://localhost:${PORT}/api/auth`);
});

export default app;
