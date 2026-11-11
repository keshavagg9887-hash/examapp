import { Router } from 'express';
import { getResultsOverview, getStudentAnswerReview } from '../controllers/resultsController.js';

const router = Router();

router.get('/', getResultsOverview);
router.get('/exams/:examId/students/:participantId', getStudentAnswerReview);

export default router;
