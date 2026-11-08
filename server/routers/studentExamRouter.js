import { Router } from 'express';
import {
  getPublishedExamByJoinCode,
  getStudentQuestions,
  heartbeatForExam,
  joinPublishedExam,
  saveStudentAnswer,
  startStudentAttempt,
  submitStudentExam,
} from '../controllers/studentExamController.js';


const router = Router();
router.get('/:joinCode', getPublishedExamByJoinCode);
router.post('/:joinCode/join', joinPublishedExam);
router.post('/:joinCode/heartbeat', heartbeatForExam);
router.get('/:joinCode/questions', getStudentQuestions);
router.post('/:joinCode/start', startStudentAttempt);
router.put('/:joinCode/answers/:questionId', saveStudentAnswer);
router.post('/:joinCode/submit', submitStudentExam);

export default router;
