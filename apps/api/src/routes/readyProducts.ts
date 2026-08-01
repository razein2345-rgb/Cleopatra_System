import { Router } from 'express';
import {
  createReadyProduct,
  deleteReadyProduct,
  listReadyProducts,
  updateReadyProduct,
} from '../controllers/readyProducts.js';

export const readyProductsRouter = Router();

readyProductsRouter.get('/', listReadyProducts);
readyProductsRouter.post('/', createReadyProduct);
readyProductsRouter.put('/:id', updateReadyProduct);
readyProductsRouter.delete('/:id', deleteReadyProduct);
