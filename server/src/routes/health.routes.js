import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';

const router = Router();

// Full system health diagnostic
router.get('/', healthController.getHealth);

// Lightweight liveness probe for orchestrators
router.get('/live', healthController.getLiveness);

// Readiness probe for load balancers
router.get('/ready', healthController.getReadiness);

export default router;
