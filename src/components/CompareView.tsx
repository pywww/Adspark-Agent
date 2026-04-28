import { useWorkspace } from '../context/WorkspaceContext';
import styles from './CompareView.module.css';

export function CompareView() {
  const { state, dispatch } = useWorkspace();

  const previewRun =
    state.previewing?.runId && state.previewing.runId.length > 0
      ? state.previewing.runId
      : null;
  const isSummaryPreview = Boolean(state.previewing) && !previewRun;

  const runId = previewRun ?? state.canvasRunFilter;
  const pool = runId
    ? state.assets.filter((a) => a.runId === runId)
    : state.assets;

  const picked =
    state.selectedAssetIds.length > 0
      ? pool.filter((a) => state.selectedAssetIds.includes(a.id)).slice(0, 4)
      : pool.filter((a) => !a.failed).slice(0, 4);

  if (isSummaryPreview) {
    return (
      <div className={styles.empty}>
        <p>正在预览：{state.previewing?.label}</p>
        <span className={styles.hint}>摘要快照无可对比图片，请恢复工作版本或选择 Run</span>
      </div>
    );
  }

  if (picked.length === 0) {
    return (
      <div className={styles.empty}>
        <p>对比模式需要至少一张图</p>
        <span className={styles.hint}>请先生成、结束筛选或选中图片</span>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        {picked.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`${styles.cell} ${state.selectedAssetIds.includes(a.id) ? styles.cellOn : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_ASSET_SELECT', assetId: a.id })}
          >
            <img src={a.imageUrl} alt="" />
            {a.failed && <span className={styles.failedBadge}>失败</span>}
          </button>
        ))}
      </div>
      <p className={styles.tip}>点击格子切换选中（最多对比 4 张）</p>
    </div>
  );
}
