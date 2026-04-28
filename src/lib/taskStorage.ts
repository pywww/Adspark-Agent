import type { TaskMeta, TaskStatus } from '../types';

const TASKS_KEY = 'agent-ad.tasks';
const LAST_TASK_KEY = 'agent-ad.lastTaskId';

function normalizeTask(raw: Record<string, unknown>): TaskMeta {
  return {
    id: String(raw.id),
    name: String(raw.name ?? '未命名任务'),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    status: (raw.status as TaskStatus) ?? 'draft',
    assetCount: typeof raw.assetCount === 'number' ? raw.assetCount : 0,
  };
}

export function loadTasks(): TaskMeta[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t) => normalizeTask(t));
  } catch {
    return [];
  }
}

export function saveTasks(tasks: TaskMeta[]) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

export function upsertTask(task: TaskMeta) {
  const list = loadTasks().filter((t) => t.id !== task.id);
  list.unshift(task);
  saveTasks(list);
}

export function patchTask(taskId: string, partial: Partial<TaskMeta>) {
  const list = loadTasks();
  const idx = list.findIndex((t) => t.id === taskId);
  if (idx < 0) return;
  const next = { ...list[idx], ...partial, id: taskId };
  list.splice(idx, 1);
  list.unshift(next);
  saveTasks(list);
}

export function getLastTaskId(): string | null {
  return localStorage.getItem(LAST_TASK_KEY);
}

export function setLastTaskId(id: string) {
  localStorage.setItem(LAST_TASK_KEY, id);
}

export function createTaskId() {
  return crypto.randomUUID();
}

/** 从摘要 chips 解析市场/主题/风格（Mock） */
export function parseChipsMeta(chips: string[]) {
  let market = '';
  let topic = '';
  let style = '';
  let scene = '';
  let productSubject = '';
  let platform = '';
  let outputGoal = '';
  let constraints: string[] = [];
  let negativeConstraints: string[] = [];
  for (const c of chips) {
    if (c.startsWith('市场:')) market = c.slice(3).trim();
    if (c.startsWith('主题:')) topic = c.slice(3).trim();
    if (c.startsWith('风格:')) style = c.slice(3).trim();
    if (c.startsWith('场景:')) scene = c.slice(3).trim();
    if (c.startsWith('主体:')) productSubject = c.slice(3).trim();
    if (c.startsWith('平台:')) platform = c.slice(3).trim();
    if (c.startsWith('约束:')) {
      constraints = c
        .slice(3)
        .split('/')
        .map((item) => item.trim())
        .filter((item) => item && item !== '未填');
    }
    if (c.startsWith('禁用:')) {
      negativeConstraints = c
        .slice(3)
        .split('/')
        .map((item) => item.trim())
        .filter((item) => item && item !== '未填');
    }
    if (c.startsWith('用途:')) outputGoal = c.slice(3).trim();
  }
  return {
    market,
    topic,
    style,
    scene,
    productSubject,
    platform,
    constraints,
    negativeConstraints,
    outputGoal,
  };
}
