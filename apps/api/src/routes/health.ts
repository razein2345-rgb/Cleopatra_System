import { Router } from 'express';
import { healthCheckSchema, type ApiResponse, type HealthCheck } from '@cleopatra/shared';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const payload: HealthCheck = healthCheckSchema.parse({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });

  const body: ApiResponse<HealthCheck> = { success: true, data: payload };
  res.json(body);
});
