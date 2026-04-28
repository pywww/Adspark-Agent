import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { TaskMeta } from '../types';
import { loadTasks, setLastTaskId } from '../lib/taskStorage';
import styles from './TaskSidebar.module.css';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function statusLabel(status: TaskMeta['status']) {
  switch (status) {
    case 'draft':
      return '草稿';
    case 'in_progress':
      return '进行中';
    case 'finalized':
      return '已入库';
    default:
      return status;
  }
}

function formatUpdatedAt(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 文档 §3.1：30 天内 / 按年月分组 */
function groupTasks(tasks: TaskMeta[]): { label: string; items: TaskMeta[] }[] {
  const now = Date.now();
  const recent: TaskMeta[] = [];
  const byMonth = new Map<string, TaskMeta[]>();

  const sorted = [...tasks].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  for (const t of sorted) {
    const ts = new Date(t.updatedAt).getTime();
    if (now - ts <= THIRTY_DAYS_MS) recent.push(t);
    else {
      const key = new Date(t.updatedAt).toISOString().slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(t);
    }
  }

  const out: { label: string; items: TaskMeta[] }[] = [];
  if (recent.length) out.push({ label: '30 天内', items: recent });
  const months = [...byMonth.keys()].sort().reverse();
  for (const m of months) {
    out.push({ label: m, items: byMonth.get(m)! });
  }
  return out;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 点击左上按钮后从左侧展开的任务历史侧栏 */
export function TaskSidebar({ open, onClose }: Props) {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const tasks = useMemo(() => loadTasks(), [taskId, open]);

  const filtered = useMemo(
    () =>
      tasks.filter((t) =>
        t.name.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [tasks, q],
  );

  const groups = useMemo(() => groupTasks(filtered), [filtered]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const pickTask = (id: string) => {
    setLastTaskId(id);
    navigate(`/workspace/${id}`);
    onClose();
  };

  return (
    <>
      <div
        className={`${styles.backdrop} ${open ? styles.backdropOpen : ''}`}
        aria-hidden={!open}
        onClick={onClose}
      />
      <aside
        className={`${styles.panel} ${open ? styles.panelOpen : ''}`}
        aria-hidden={!open}
        aria-label="任务历史"
      >
        <div className={styles.drawerHead}>
          <span className={styles.drawerTitle}>任务历史</span>
          <button
            type="button"
            className={styles.closeBtn}
            title="关闭"
            aria-label="关闭任务历史"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className={styles.searchWrap}>
          <input
            className={styles.search}
            placeholder="搜索任务名称"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className={styles.scroll}>
          {groups.length === 0 && (
            <p className={styles.muted}>
              {q.trim() ? '没有找到匹配的任务' : '还没有任务，点击右上角“新建任务”开始'}
            </p>
          )}
          {groups.map((g) => (
            <div key={g.label} className={styles.groupBlock}>
              <div className={styles.group}>{g.label}</div>
              <ul className={styles.list}>
                {g.items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={t.id === taskId ? styles.itemOn : styles.item}
                      onClick={() => pickTask(t.id)}
                      title={t.name}
                    >
                      <span className={styles.itemTitle}>{t.name}</span>
                      <span className={styles.itemMeta}>
                        <span>{statusLabel(t.status)}</span>
                        <span>{formatUpdatedAt(t.updatedAt)}</span>
                        <span>{t.assetCount} 张</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
