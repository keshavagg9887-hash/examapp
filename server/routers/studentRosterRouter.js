import { Router } from 'express';
import { listStudents } from '../controllers/studentRosterController.js';

const router = Router();

router.get('/', listStudents);

export default router;
