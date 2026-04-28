import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import styles from './GenerationPreferencesPopover.module.css';

const RATIOS = [
  '智能',
  '21:9',
  '16:9',
  '3:2',
  '4:3',
  '1:1',
  '3:4',
  '2:3',
  '9:16',
] as const;
const COUNTS = [1, 2, 4, 8] as const;
const EXPLORE_OPTIONS = [
  { value: 'single', label: '单一稳定' },
  { value: 'multi_style', label: '多风格探索' },
  { value: 'multi_scene', label: '多场景探索' },
] as const;
/** 生成偏好卡片（数据参考已拆至 DataReferencePopover；平台仅由摘要卡「平台」字段提供） */
export function GenerationPreferencesPopover() {
  const { state, dispatch } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const s = state.generateSettings;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const setRatio = (ratio: string) => {
    dispatch({ type: 'SET_SETTINGS', partial: { ratio } });
  };

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="生图偏好"
        aria-label="生图偏好"
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          className={styles.sliders}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
          <circle cx="4" cy="14" r="2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="20" cy="16" r="2" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open && (
        <div className={styles.card} role="dialog" aria-label="生成偏好">
          <div className={styles.head}>
            <span className={styles.title}>生成偏好</span>
            <button
              type="button"
              className={styles.closeBtn}
              aria-label="关闭生成偏好"
              title="关闭"
              onClick={() => setOpen(false)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M6 6l12 12" />
                <path d="M18 6l-12 12" />
              </svg>
            </button>
          </div>

          <div className={styles.sectionLabel}>生成张数</div>
          <div className={styles.rangeGrid}>
            {COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                className={s.count === count ? styles.rangeOn : styles.rangeBtn}
                onClick={() =>
                  dispatch({
                    type: 'SET_SETTINGS',
                    partial: { count },
                  })
                }
              >
                {count} 张
              </button>
            ))}
          </div>

          <div className={styles.sectionLabel}>生成策略</div>
          <div className={styles.row2}>
            <label className={`${styles.pillSelect} ${styles.pillSelectFull}`}>
              <select
                value={s.exploreMode ?? 'single'}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SETTINGS',
                    partial: { exploreMode: e.target.value as 'single' | 'multi_style' | 'multi_scene' },
                  })
                }
              >
                {EXPLORE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.sectionLabel}>选择比例</div>
          <div className={styles.ratioGrid}>
            {RATIOS.map((r) => (
              <button
                key={r}
                type="button"
                className={s.ratio === r ? styles.ratioOn : styles.ratioBtn}
                onClick={() => setRatio(r)}
              >
                <span className={styles.ratioIcon} aria-hidden>
                  {r === '智能' ? '◇' : '▭'}
                </span>
                <span className={styles.ratioText}>{r}</span>
              </button>
            ))}
          </div>

          <div className={styles.sectionLabel}>其他设置</div>
          <div className={styles.row2}>
            <label className={`${styles.pillSelect} ${styles.pillSelectFull}`}>
              <span className={styles.pillIco} aria-hidden>
                画
              </span>
              <select
                value={s.qualityPreset ?? '高清 2K'}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SETTINGS',
                    partial: { qualityPreset: e.target.value },
                  })
                }
              >
                <option value="高清 2K">高清 2K</option>
                <option value="高清 1K">高清 1K</option>
                <option value="标清">标清</option>
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
