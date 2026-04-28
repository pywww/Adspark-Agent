import { useState } from 'react';
import { loadTasks, upsertTask } from '../lib/taskStorage';
import { useWorkspace } from '../context/WorkspaceContext';
import { ExportButton } from './ExportButton';
import styles from './CanvasToolbar.module.css';

/** 画布顶栏：集中放高频操作 */
export function CanvasToolbar() {
  const { state, dispatch } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(state.taskName);

  const commitName = () => {
    setEditing(false);
    const next = nameDraft.trim() || state.taskName;
    dispatch({ type: 'SET_TASK', taskId: state.taskId, taskName: next });
    const prev = loadTasks().find((t) => t.id === state.taskId);
    upsertTask({
      id: state.taskId,
      name: next,
      updatedAt: new Date().toISOString(),
      status: prev?.status ?? 'draft',
      assetCount: prev?.assetCount ?? 0,
    });
  };

  return (
    <div className={styles.bar} role="toolbar" aria-label="画布操作">
      <div className={styles.sideLeft}>
        <button
          type="button"
          className={state.multiSelectMode ? styles.multiBtnOn : styles.multiBtn}
          aria-pressed={state.multiSelectMode}
          onClick={() => dispatch({ type: 'TOGGLE_MULTI_SELECT' })}
        >
          批量选择
        </button>
      </div>
      <div className={styles.center}>
        <div className={styles.titleCluster}>
          {editing ? (
            <input
              className={styles.nameInput}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === 'Enter' && commitName()}
              autoFocus
              aria-label="任务名"
            />
          ) : (
            <button
              type="button"
              className={styles.taskName}
              onClick={() => {
                setNameDraft(state.taskName);
                setEditing(true);
              }}
            >
              {state.taskName}
            </button>
          )}
        </div>
      </div>
      <div className={styles.sideRight}>
        <ExportButton />
      </div>
    </div>
  );
}
