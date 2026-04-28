import { useWorkspace } from '../context/WorkspaceContext';
import { SummaryCardMessage } from './SummaryCardMessage';
import styles from './ChatThread.module.css';

/** 供顶栏箭头滚动定位 */
export const WORKSPACE_CHAT_THREAD_ID = 'workspace-chat-thread';

export function ChatThread() {
  const { state } = useWorkspace();

  return (
    <div
      id={WORKSPACE_CHAT_THREAD_ID}
      className={styles.thread}
      role="log"
      aria-live="polite"
    >
      {state.messages.map((m) => {
        const snap = m.snapshotId
          ? state.summarySnapshots.find((s) => s.id === m.snapshotId)
          : undefined;
        return (
          <div key={m.id} className={m.role === 'user' ? styles.userRow : styles.aiRow}>
            <div className={m.role === 'user' ? styles.userBubble : styles.aiBubble}>
              {m.content}
            </div>
            {m.role === 'user' && m.referenceImages && m.referenceImages.length > 0 && (
              <div className={styles.userRefs} aria-label="本次发送的参考图">
                {m.referenceImages.map((img) => (
                  <span key={img.id} className={styles.userRefItem}>
                    <img src={img.url} alt={img.name} className={styles.userRefThumb} />
                  </span>
                ))}
              </div>
            )}
            {m.kind === 'summary' && snap && <SummaryCardMessage snapshot={snap} />}
          </div>
        );
      })}
    </div>
  );
}
