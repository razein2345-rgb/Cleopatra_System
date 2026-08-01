import { Router } from 'express';
import {
  addSizeFamilyEntry,
  createSizeFamily,
  deleteSizeFamily,
  deleteSizeFamilyEntry,
  listSizeFamilies,
  updateSizeFamily,
  updateSizeFamilyEntry,
} from '../controllers/sizeFamilies.js';

export const sizeFamiliesRouter = Router();

sizeFamiliesRouter.get('/', listSizeFamilies);
sizeFamiliesRouter.post('/', createSizeFamily);
sizeFamiliesRouter.put('/:id', updateSizeFamily);
sizeFamiliesRouter.delete('/:id', deleteSizeFamily);
sizeFamiliesRouter.post('/:id/entries', addSizeFamilyEntry);
sizeFamiliesRouter.put('/:id/entries/:entryId', updateSizeFamilyEntry);
sizeFamiliesRouter.delete('/:id/entries/:entryId', deleteSizeFamilyEntry);
