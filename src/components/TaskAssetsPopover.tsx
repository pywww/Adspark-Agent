import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import styles from './TaskAssetsPopover.module.css';

type TabKey = 'summary' | 'generate' | 'finalized';

export function TaskAssetsPopover() {
  const { state, dispatch } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('summary');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const pointer =
    state.previewing?.label ??
    (state.summaryConfirmed
      ? `摘要 v${state.summaryVersion} · Run ${state.runs.length || 0}`
      : '未确认摘要');

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        任务素材 ▼
      </button>
      {open && (
        <div className={styles.popover} role="dialog" aria-label="任务素材">
          <div className={styles.head}>
            <strong>{state.taskName}</strong>
            <span className={styles.pointer}>{pointer}</span>
          </div>
          <div className={styles.tabs} role="tablist">
            {(
              [
                ['summary', '摘要'],
                ['generate', '生成'],
                ['finalized', '定稿'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={tab === k ? styles.tabOn : styles.tab}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={styles.body}>
            {tab === 'summary' && (
              <ul className={styles.list}>
                {state.summarySnapshots.length === 0 && (
                  <li className={styles.muted}>暂无摘要快照</li>
                )}
                {state.summarySnapshots.map((s) => (
                  <li key={s.id} className={styles.item}>
                    <div className={styles.itemTitle}>
                      summary_v{s.version} · {s.title}
                    </div>
                    <div className={styles.chips}>
                      {s.chips.map((c) => (
                        <span key={c} className={styles.chip}>
                          {c}
                        </span>
                      ))}
                    </div>
                    <div className={styles.meta}>
                      {new Date(s.createdAt).toLocaleString()}
                    </div>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => {
                          dispatch({
                            type: 'SET_PREVIEW',
                            preview: {
                              label: `摘要 v${s.version}`,
                              runId: '',
                            },
                          });
                        }}
                      >
                        预览
                      </button>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => {
                          dispatch({
                            type: 'LOAD_SNAPSHOT_DRAFT',
                            snapshotId: s.id,
                          });
                          setOpen(false);
                        }}
                      >
                        载入为当前草稿
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {tab === 'generate' && (
              <div className={styles.runs}>
                {state.runs.length === 0 && (
                  <p className={styles.muted}>暂无生成记录</p>
                )}
                {state.runs.map((run) => (
                  <div key={run.id} className={styles.run}>
                    <div className={styles.runHead}>
                      Run {run.index} · {new Date(run.createdAt).toLocaleString()}{' '}
                      · {run.assetIds.length} 张
                    </div>
                    <div className={styles.thumbs}>
                      {run.assetIds.map((id) => {
                        const a = state.assets.find((x) => x.id === id);
                        if (!a) return null;
                        return (
                          <button
                            key={id}
                            type="button"
                            className={styles.thumb}
                            onClick={() => {
                              dispatch({
                                type: 'SET_PREVIEW',
                                preview: {
                                  label: `Run ${run.index}`,
                                  runId: run.id,
                                },
                              });
                              dispatch({ type: 'CLEAR_SELECTION' });
                              dispatch({ type: 'TOGGLE_ASSET_SELECT', assetId: id });
                            }}
                          >
                            <img src={a.imageUrl} alt="" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'finalized' && (
              <ul className={styles.list}>
                {state.finalized.length === 0 && (
                  <li className={styles.muted}>本任务暂无定稿</li>
                )}
                {state.finalized.map((f) => (
                  <li key={f.materialId} className={styles.item}>
                    <div className={styles.itemTitle}>{f.materialId}</div>
                    <img className={styles.finalImg} src={f.imageUrl} alt="" />
                    <div className={styles.meta}>
                      {f.deliveryStatus ?? '已入库'} ·{' '}
                      {new Date(f.createdAt).toLocaleString()}
                    </div>
                    <Link
                      className={styles.libLink}
                      to={`/library?highlight=${encodeURIComponent(f.materialId)}`}
                      onClick={() => setOpen(false)}
                    >
                      跳转资产库详情
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
