/**
 * Routes for scheduled tasks CRUD operations.
 */

import { Router, type Request, type Response } from "express";
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  getTaskExecutions,
} from "../scheduler/taskStore.js";

const router = Router();

/** GET /api/tasks — List all scheduled tasks. */
router.get("/", (_req: Request, res: Response) => {
  res.json({ tasks: listTasks() });
});

/** POST /api/tasks — Create a new scheduled task. */
router.post("/", (req: Request, res: Response) => {
  const { name, prompt, schedule, intervalMinutes } = req.body;
  if (!name || !prompt) {
    res.status(400).json({ error: "name and prompt are required" });
    return;
  }
  const task = createTask({ name, prompt, schedule, intervalMinutes });
  res.status(201).json(task);
});

/** PATCH /api/tasks/:id — Update a task. */
router.patch("/:id", (req: Request, res: Response) => {
  const updated = updateTask(String(req.params.id), req.body);
  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(updated);
});

/** DELETE /api/tasks/:id — Delete a task. */
router.delete("/:id", (req: Request, res: Response) => {
  const deleted = deleteTask(String(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json({ success: true });
});

/** GET /api/tasks/:id/executions — Get execution history. */
router.get("/:id/executions", (req: Request, res: Response) => {
  const limit = parseInt(String(req.query.limit || "20"));
  res.json({ executions: getTaskExecutions(String(req.params.id), limit) });
});

export default router;
