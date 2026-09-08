import type { Request, Response } from 'express';
import { updateItemSupplierTaskSchema } from '@cleopatra/shared';
import {
  deleteItemSupplierTask,
  ItemSupplierTaskNotFoundError,
  listOpenItemSupplierTasks,
  updateItemSupplierTask,
} from '../services/itemSupplierTaskService.js';

export async function listOpenItemSupplierTasksHandler(_req: Request, res: Response) {
  const tasks = await listOpenItemSupplierTasks();
  res.json({ success: true, data: tasks });
}

export async function updateItemSupplierTaskHandler(req: Request<{ id: string }>, res: Response) {
  const input = updateItemSupplierTaskSchema.parse(req.body);
  try {
    const updated = await updateItemSupplierTask(req.params.id, input);
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof ItemSupplierTaskNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }
}

export async function deleteItemSupplierTaskHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  try {
    await deleteItemSupplierTask(req.params.id, auth.staffId);
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) {
    if (err instanceof ItemSupplierTaskNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }
}
