import { useMemo } from 'react';
import type { SummarySnapshot } from '../types';
import { useWorkspace } from '../context/WorkspaceContext';
import styles from './SummaryHistoryDropdown.module.css';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** 按天分组：今天 / 昨天 / 具体日期 */
function groupSnapshots(
  list: SummarySnapshot[],
): { label: string; items: SummarySnapshot[] }[] {
  const sorted = [...list].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const now = new Date();
  const t0 = startOfDay(now);
  const tY = t0 - 86400000;
  const buckets = new Map<string, SummarySnapshot[]>();
  const order: string[] = [];

  for (const s of sorted) {
    const ts = startOfDay(new Date(s.createdAt));
    let key: string;
    if (ts === t0) key = '__today__';
    else if (ts === tY) key = '__yesterday__';
    else key = `d:${ts}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(s);
  }

  const labelFor = (key: string) => {
    if (key === '__today__') return '今天 Today';
    if (key === '__yesterday__') return '昨天 Yesterday';
    const ts = Number(key.slice(2));
    const d = new Date(ts);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return order.map((key) => ({
    label: labelFor(key),
    items: buckets.get(key)!,
  }));
}

function thumbUrl(s: SummarySnapshot) {
  return `https://picsum.photos/seed/${encodeURIComponent(s.id)}/72/72`;
}

interface SummaryHistoryCardProps {
  open: boolean;
  onClose: () => void;
  /** 卡片相对触发器：右侧箭头用 right 对齐 */
  align?: 'left' | 'right';
}

/** 摘要历史下拉卡片（由顶栏右侧箭头触发） */
export function SummaryHistoryCard({
  open,
  onClose,
  align = 'right',
}: SummaryHistoryCardProps) {
  const { state, dispatch } = useWorkspace();

  const groups = useMemo(
    () => groupSnapshots(state.summarySnapshots),
    [state.summarySnapshots],
  );

  if (!open) return null;

  const onNewSummary = () => {
    dispatch({ type: 'ADD_SUMMARY_DRAFT' });
    onClose();
  };

  const onPick = (s: SummarySnapshot) => {
    if (s.version === state.summaryVersion) {
      onClose();
      return;
    }
    dispatch({ type: 'LOAD_SNAPSHOT_DRAFT', snapshotId: s.id });
    onClose();
  };

  const currentSnap = state.summarySnapshots.find(
    (x) => x.version === state.summaryVersion,
  );

  return (
    <div
      className={`${styles.card} ${align === 'right' ? styles.cardAlignRight : ''}`}
      role="dialog"
      aria-label="摘要历史"
    >
      <div className={styles.head}>
        <span className={styles.headTitle}>摘要历史</span>
        <button
          type="button"
          className={styles.close}
          title="关闭"
          aria-label="关闭"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <button type="button" className={styles.newRow} onClick={onNewSummary}>
        <span className={styles.newPlus}>+</span>
        <span>新建摘要</span>
      </button>
      <div className={styles.scroll}>
        {groups.length === 0 ? (
          <p className={styles.empty}>暂无摘要记录，点击上方新建摘要</p>
        ) : (
          groups.map((g) => (
            <div key={g.label} className={styles.group}>
              <div className={styles.groupLabel}>{g.label}</div>
              <ul className={styles.list}>
                {g.items.map((s) => {
                  const active =
                    currentSnap &&
                    s.id === currentSnap.id &&
                    s.version === state.summaryVersion;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={`${styles.row} ${active ? styles.rowActive : ''}`}
                        onClick={() => onPick(s)}
                      >
                        <img
                          className={styles.thumb}
                          src={thumbUrl(s)}
                          alt=""
                        />
                        <div className={styles.body}>
                          <div className={styles.titleRow}>
                            <span className={styles.title}>{s.title}</span>
                            <time
                              className={styles.time}
                              dateTime={s.createdAt}
                            >
                              {new Date(s.createdAt).toLocaleTimeString(
                                'zh-CN',
                                {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                },
                              )}
                            </time>
                          </div>
                          <div className={styles.sub}>summary_v{s.version}</div>
                          <div className={styles.tags}>
                            {s.chips.slice(0, 4).map((c) => (
                              <span key={c} className={styles.tag}>
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
