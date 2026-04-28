import { useRef, useState, useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import styles from './GenerateSettingsDropdown.module.css';

export function GenerateSettingsDropdown() {
  const { state, dispatch } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const s = state.generateSettings;

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        生图设置 ▼
      </button>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="生图设置">
          <label className={styles.row}>
            <span>张数</span>
            <select
              value={s.count}
              onChange={(e) =>
                dispatch({
                  type: 'SET_SETTINGS',
                  partial: { count: Number(e.target.value) },
                })
              }
            >
              {[2, 4, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.row}>
            <span>比例</span>
            <select
              value={s.ratio}
              onChange={(e) =>
                dispatch({ type: 'SET_SETTINGS', partial: { ratio: e.target.value } })
              }
            >
              {[
              '智能',
              '21:9',
              '16:9',
              '3:2',
              '4:3',
              '1:1',
              '3:4',
              '2:3',
              '9:16',
            ].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.row}>
            <span>风格强度 {s.strength.toFixed(2)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.strength}
              onChange={(e) =>
                dispatch({
                  type: 'SET_SETTINGS',
                  partial: { strength: Number(e.target.value) },
                })
              }
            />
          </label>
          <label className={styles.row}>
            <span>参考权重 {s.refWeight.toFixed(2)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.refWeight}
              onChange={(e) =>
                dispatch({
                  type: 'SET_SETTINGS',
                  partial: { refWeight: Number(e.target.value) },
                })
              }
            />
          </label>
          <p className={styles.hint}>设置将保存为当前任务默认值（前端 Mock）</p>
        </div>
      )}
    </div>
  );
}
