import { Router } from 'express';
import { createExam, deleteExam, getExam, listExams, updateExam } from '../controllers/examController.js';
import { listExamParticipants, streamExamParticipants } from '../controllers/monitoringController.js';

const router = Router();

router.get('/', listExams);
router.post('/', createExam);
router.get('/:examId/participants', listExamParticipants);
router.get('/:examId/participants/events', streamExamParticipants);
router.get('/:examId', getExam);
router.patch('/:examId', updateExam);
router.delete('/:examId', deleteExam);

export default router;
