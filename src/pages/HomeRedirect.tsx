import { Navigate } from 'react-router-dom';
import { getLastTaskId, loadTasks } from '../lib/taskStorage';

/** 文档 §2：无 lastTaskId 且无任务 → /workspace/new */
export function HomeRedirect() {
  const last = getLastTaskId();
  if (last) return <Navigate to={`/workspace/${last}`} replace />;
  const tasks = loadTasks();
  if (tasks[0]) return <Navigate to={`/workspace/${tasks[0].id}`} replace />;
  return <Navigate to="/workspace/new" replace />;
}
