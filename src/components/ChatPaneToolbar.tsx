import { useEffect, useRef, useState } from 'react';
import { SummaryHistoryCard } from './SummaryHistoryDropdown';
import styles from './ChatPaneToolbar.module.css';

interface Props {
  onOpenHistory: () => void;
  historyOpen: boolean;
}

/** 对话区顶栏：左侧任务历史；右侧打开摘要版本 */
export function ChatPaneToolbar({ onOpenHistory, historyOpen }: Props) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const rightClusterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (
        rightClusterRef.current &&
        !rightClusterRef.current.contains(e.target as Node)
      ) {
        setSummaryOpen(false);
      }
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  useEffect(() => {
    if (!summaryOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSummaryOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [summaryOpen]);

  return (
    <header className={styles.bar} aria-label="对话工具栏">
      <div className={styles.leftCluster}>
        <button
          type="button"
          className={`${styles.iconBtn} ${historyOpen ? styles.iconBtnOn : ''}`}
          title="任务历史"
          aria-label="任务历史"
          aria-expanded={historyOpen}
          onClick={onOpenHistory}
        >
          <svg
            className={styles.ico}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path
              d="M4 6h16M4 12h10M4 18h14"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className={styles.rightCluster} ref={rightClusterRef}>
        <button
          type="button"
          className={`${styles.iconBtn} ${summaryOpen ? styles.iconBtnOn : ''}`}
          title="摘要版本"
          aria-label="摘要版本"
          aria-expanded={summaryOpen}
          aria-haspopup="dialog"
          onClick={() => setSummaryOpen((v) => !v)}
        >
          <svg
            className={styles.ico}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <SummaryHistoryCard
          open={summaryOpen}
          onClose={() => setSummaryOpen(false)}
          align="right"
        />
      </div>
    </header>
  );
}
