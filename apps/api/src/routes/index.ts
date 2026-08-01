import { Router } from 'express';
import { healthRouter } from './health.js';
import { settingsRouter } from './settings.js';
import { sheetTypesRouter } from './sheetTypes.js';
import { sizeFamiliesRouter } from './sizeFamilies.js';
import { readyProductsRouter } from './readyProducts.js';
import { servicesRouter } from './services.js';

export const apiRouter = Router();

// Unprefixed: infra/health-check convention (load balancers, Docker healthchecks).
apiRouter.use('/health', healthRouter);

const api = Router();
api.use('/settings', settingsRouter);
api.use('/sheet-types', sheetTypesRouter);
api.use('/size-families', sizeFamiliesRouter);
api.use('/ready-products', readyProductsRouter);
api.use('/services', servicesRouter);
apiRouter.use('/api', api);
