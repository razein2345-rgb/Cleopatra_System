import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createDocumentTemplateHandler,
  createTemplateVersionHandler,
  deleteDocumentTemplateHandler,
  duplicateDocumentTemplateHandler,
  getDocumentTemplateHandler,
  listDocumentTemplatesHandler,
  publishDocumentTemplateHandler,
  setDefaultDocumentTemplateHandler,
  updateDocumentTemplateHandler,
} from '../controllers/documentTemplates.js';

export const documentTemplatesRouter = Router();

documentTemplatesRouter.use(requireAuth);

// FEATURE-006 M5 — reuses `settings.*` (this is Settings configuration,
// per 01_ANALYSIS.md's reasoning), no new permission module.
documentTemplatesRouter.get('/', requirePermission('settings.view'), listDocumentTemplatesHandler);
documentTemplatesRouter.get('/:id', requirePermission('settings.view'), getDocumentTemplateHandler);
documentTemplatesRouter.post('/', requirePermission('settings.edit'), createDocumentTemplateHandler);
documentTemplatesRouter.put('/:id', requirePermission('settings.edit'), updateDocumentTemplateHandler);
documentTemplatesRouter.post('/:id/duplicate', requirePermission('settings.edit'), duplicateDocumentTemplateHandler);
documentTemplatesRouter.post('/:id/versions', requirePermission('settings.edit'), createTemplateVersionHandler);
documentTemplatesRouter.post('/:id/publish', requirePermission('settings.edit'), publishDocumentTemplateHandler);
documentTemplatesRouter.put('/:id/default', requirePermission('settings.edit'), setDefaultDocumentTemplateHandler);
documentTemplatesRouter.delete('/:id', requirePermission('settings.edit'), deleteDocumentTemplateHandler);
