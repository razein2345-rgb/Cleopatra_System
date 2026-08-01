import { Router } from 'express';
import {
  createSheetType,
  deleteSheetType,
  listSheetTypes,
  updateSheetType,
} from '../controllers/sheetTypes.js';

export const sheetTypesRouter = Router();

sheetTypesRouter.get('/', listSheetTypes);
sheetTypesRouter.post('/', createSheetType);
sheetTypesRouter.put('/:id', updateSheetType);
sheetTypesRouter.delete('/:id', deleteSheetType);
