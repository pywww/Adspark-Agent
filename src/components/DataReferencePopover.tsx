import { useEffect, useRef, useState } from 'react';
import type { TrendReferenceRange } from '../types';
import { useWorkspace } from '../context/WorkspaceContext';
import styles from './DataReferencePopover.module.css';

const TREND_RANGES: { value: TrendReferenceRange; label: string }[] = [
  { value: '3d', label: '3 天' },
  { value: '7d', label: '近一周' },
  { value: '15d', label: '15 天' },
  { value: '30d', label: '近 30 天' },
];

/** 与「生成偏好」并列：本次生成依据（趋势参考开关 + 范围） */
export function DataReferencePopover() {
  const { state, dispatch } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const s = state.generateSettings;
  const trendOn = s.trendReferenceEnabled ?? false;
  const hotSampleOn = s.hotSampleReferenceEnabled ?? true;
  const trendRange = s.trendReferenceRange ?? '30d';

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const setTrendOn = (enabled: boolean) => {
    dispatch({ type: 'SET_SETTINGS', partial: { trendReferenceEnabled: enabled } });
  };

  const setTrendRange = (range: TrendReferenceRange) => {
    dispatch({ type: 'SET_SETTINGS', partial: { trendReferenceRange: range } });
  };

  const setHotSampleOn = (enabled: boolean) => {
    dispatch({ type: 'SET_SETTINGS', partial: { hotSampleReferenceEnabled: enabled } });
  };

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOn : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="参考依据"
        aria-label="参考依据"
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          className={styles.ico}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M3 3v18h18" />
          <path d="M7 16l4-4 4 4 6-7" />
        </svg>
      </button>
      {open && (
        <div
          className={styles.card}
          role="dialog"
          aria-label="参考依据"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className={styles.head}>
            <span className={styles.title}>参考依据</span>
            <button
              type="button"
              className={styles.closeBtn}
              aria-label="关闭参考依据"
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
          <p className={styles.desc}>
            开启后，系统会参考历史爆款与市场趋势视觉特征，辅助本次生成更贴近真实投放偏好。
          </p>
          <div className={styles.row}>
            <span className={styles.label}>市场趋势参考</span>
            <button
              type="button"
              className={`${styles.switch} ${trendOn ? styles.switchOn : ''}`}
              role="switch"
              aria-checked={trendOn}
              aria-label="市场趋势参考"
              title="市场趋势参考"
              onClick={() => setTrendOn(!trendOn)}
            >
              <span className={styles.knob} />
            </button>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>爆款样本参考</span>
            <button
              type="button"
              className={`${styles.switch} ${hotSampleOn ? styles.switchOn : ''}`}
              role="switch"
              aria-checked={hotSampleOn}
              aria-label="爆款样本参考"
              title="爆款样本参考"
              onClick={() => setHotSampleOn(!hotSampleOn)}
            >
              <span className={styles.knob} />
            </button>
          </div>
          <div className={styles.sectionLabel}>样本时间范围</div>
          <div className={styles.rangeGrid}>
            {TREND_RANGES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                disabled={!hotSampleOn}
                className={
                  trendRange === value ? styles.rangeOn : styles.rangeBtn
                }
                onClick={() => setTrendRange(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
