import { useEffect, useState, useCallback } from "react";
import {
  CalendarClock,
  Plus,
  RefreshCw,
  Loader2,
  Play,
  Pause,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  intervalMinutes: number;
  enabled: boolean;
  lastRun: string | null;
  lastResult: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TaskExecution {
  id: number;
  taskId: string;
  startedAt: string;
  completedAt: string | null;
  result: string | null;
  error: string | null;
  durationMs: number | null;
}

export default function TasksPanel() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [executions, setExecutions] = useState<Record<string, TaskExecution[]>>({});

  // Create form state
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newSchedule, setNewSchedule] = useState("daily");

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const createTask = async () => {
    if (!newName.trim() || !newPrompt.trim()) return;
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          prompt: newPrompt.trim(),
          schedule: newSchedule,
        }),
      });
      setNewName("");
      setNewPrompt("");
      setShowCreate(false);
      fetchTasks();
    } catch (err) {
      console.error("Failed to create task:", err);
    }
  };

  const toggleTask = async (id: string, enabled: boolean) => {
    try {
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      fetchTasks();
    } catch (err) {
      console.error("Failed to toggle task:", err);
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      fetchTasks();
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  };

  const fetchExecutions = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/executions?limit=5`);
      const data = await res.json();
      setExecutions((prev) => ({ ...prev, [taskId]: data.executions || [] }));
    } catch (err) {
      console.error("Failed to fetch executions:", err);
    }
  };

  const handleExpand = (taskId: string) => {
    if (expandedTask === taskId) {
      setExpandedTask(null);
    } else {
      setExpandedTask(taskId);
      fetchExecutions(taskId);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-300">
            Scheduled Tasks
          </h2>
          <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-brand-400 hover:text-brand-300 hover:bg-gray-700 rounded transition-colors"
          >
            <Plus size={12} />
            New Task
          </button>
          <button
            onClick={fetchTasks}
            disabled={isLoading}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          >
            {isLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/30 space-y-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Task name (e.g., Weekly Compliance Check)"
            className="w-full bg-gray-800 text-gray-200 text-xs rounded px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none placeholder-gray-500"
          />
          <textarea
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="Agent prompt (e.g., Show me all non-compliant devices and generate a summary report)"
            rows={3}
            className="w-full bg-gray-800 text-gray-200 text-xs rounded px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none placeholder-gray-500 resize-none"
          />
          <div className="flex items-center gap-2">
            <select
              value={newSchedule}
              onChange={(e) => setNewSchedule(e.target.value)}
              className="bg-gray-800 text-gray-300 text-xs border border-gray-700 rounded px-2 py-1.5 focus:outline-none"
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <div className="flex-1" />
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={createTask}
              disabled={!newName.trim() || !newPrompt.trim()}
              className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && tasks.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-gray-500" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 px-4">
            <CalendarClock size={48} className="mb-4 text-gray-600" />
            <h3 className="text-lg font-medium text-gray-400 mb-1">
              No Scheduled Tasks
            </h3>
            <p className="text-sm text-center max-w-xs mb-4">
              Create recurring tasks to automatically run agent queries on a
              schedule — like daily compliance checks or weekly reports.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors"
            >
              <Plus size={14} />
              Create Your First Task
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {tasks.map((task) => (
              <div key={task.id} className="px-4">
                <div className="flex items-center gap-3 py-3">
                  <button
                    onClick={() => handleExpand(task.id)}
                    className="text-gray-500 hover:text-gray-300"
                  >
                    {expandedTask === task.id ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-gray-200 truncate">
                        {task.name}
                      </p>
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          task.enabled
                            ? "bg-green-500/20 text-green-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {task.enabled ? "Active" : "Paused"}
                      </span>
                      <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                        {task.schedule}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">
                      {task.prompt}
                    </p>
                    {task.lastRun && (
                      <p className="text-[10px] text-gray-600 mt-0.5 flex items-center gap-1">
                        <Clock size={9} />
                        Last run: {new Date(task.lastRun).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleTask(task.id, !task.enabled)}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                      title={task.enabled ? "Pause" : "Enable"}
                    >
                      {task.enabled ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Execution history */}
                {expandedTask === task.id && (
                  <div className="pb-3 pl-8">
                    <p className="text-[11px] text-gray-400 font-medium mb-2">
                      Recent Executions
                    </p>
                    {(executions[task.id] || []).length === 0 ? (
                      <p className="text-[11px] text-gray-600">
                        No executions yet
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {(executions[task.id] || []).map((exec) => (
                          <div
                            key={exec.id}
                            className="flex items-start gap-2 bg-gray-800/50 rounded px-2.5 py-2"
                          >
                            {exec.error ? (
                              <XCircle
                                size={12}
                                className="text-red-400 mt-0.5 shrink-0"
                              />
                            ) : (
                              <CheckCircle2
                                size={12}
                                className="text-green-400 mt-0.5 shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-gray-300 line-clamp-2">
                                {exec.error || exec.result || "Completed"}
                              </p>
                              <p className="text-[10px] text-gray-600 mt-0.5">
                                {new Date(exec.startedAt).toLocaleString()}
                                {exec.durationMs != null && ` — ${(exec.durationMs / 1000).toFixed(1)}s`}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
