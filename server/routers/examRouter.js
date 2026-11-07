import { Router } from 'express';
import { createExam, deleteExam, getExam, listExams, updateExam } from '../controllers/examController.js';
import { listExamParticipants, streamExamParticipants } from '../controllers/monitoringController.js';
import {
  getExamResults,
  getStudentResultDetail,
  toggleResultsRelease,
  getExamRoster,
  addExpectedStudents,
  removeExpectedStudent,
} from '../controllers/resultsRosterController.js';

const router = Router();

router.get('/', listExams);
router.post('/', createExam);
router.get('/:examId/participants', listExamParticipants);
router.get('/:examId/participants/events', streamExamParticipants);

// Results & Roster endpoints
router.get('/:examId/results', getExamResults);
router.get('/:examId/results/students/:participantId', getStudentResultDetail);
router.post('/:examId/results/toggle-release', toggleResultsRelease);
router.get('/:examId/roster', getExamRoster);
router.post('/:examId/roster', addExpectedStudents);
router.delete('/:examId/roster/:rollNumber', removeExpectedStudent);

router.get('/:examId', getExam);
router.patch('/:examId', updateExam);
router.delete('/:examId', deleteExam);

export default router;
