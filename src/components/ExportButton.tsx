import { useWorkspace } from '../context/WorkspaceContext';
import { loadAllFinalized } from '../lib/finalizedStorage';
import { finalizeAssetToLibrary } from '../lib/workspaceFlows';
import styles from './ExportButton.module.css';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  'http://localhost:8787';

async function downloadMaterial(materialId: string) {
  const resp = await fetch(
    `${API_BASE}/api/materials/${encodeURIComponent(materialId)}/download`,
  );
  if (!resp.ok) {
    throw new Error(`导出下载失败（${resp.status}）`);
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${materialId}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 业务主操作：入库并导出（需先选中） */
export function ExportButton() {
  const { state, dispatch } = useWorkspace();

  const onExport = async () => {
    const targetIds = [...state.selectedAssetIds];
    if (targetIds.length === 0) {
      dispatch({
        type: 'TOAST',
        toast: {
          id: crypto.randomUUID(),
          type: 'info',
          text: '请先选中要入库并导出的图片',
        },
      });
      return;
    }

    const resetBatchMode = () => {
      dispatch({ type: 'TOGGLE_MULTI_SELECT', value: false });
    };

    let successCount = 0;
    let downloadCount = 0;
    for (const assetId of targetIds) {
      const ok = await finalizeAssetToLibrary(state, dispatch, assetId, {
        silent: true,
        suppressAlreadyToast: true,
      });
      if (!ok) continue;
      successCount += 1;
      const rec = loadAllFinalized().find((item) => item.assetId === assetId);
      if (!rec?.materialId) continue;
      try {
        await downloadMaterial(rec.materialId);
        downloadCount += 1;
      } catch {
        // 下载失败不影响入库结果，最终统一提示
      }
    }
    if (successCount === targetIds.length) {
      const text = `已入库 ${successCount} 张，成功下载 ${downloadCount} 张`;
      dispatch({
        type: 'TOAST',
        toast: { id: crypto.randomUUID(), type: 'success', text },
      });
      resetBatchMode();
      return;
    }

    if (successCount > 0) {
      dispatch({
        type: 'TOAST',
        toast: {
          id: crypto.randomUUID(),
          type: 'info',
          text: `部分成功：入库 ${successCount}/${targetIds.length}，下载 ${downloadCount} 张`,
        },
      });
      resetBatchMode();
      return;
    }

    dispatch({
      type: 'TOAST',
      toast: {
        id: crypto.randomUUID(),
        type: 'error',
        text: '入库并导出失败，请检查后端日志与网络连接',
      },
    });
    resetBatchMode();
  };

  return (
    <button
      type="button"
      className={styles.btn}
      title={
        state.selectedAssetIds.length === 0
          ? '请先选中图片'
          : '将所选图片入库并导出'
      }
      onClick={() => void onExport()}
    >
      {state.selectedAssetIds.length > 1 ? '批量入库并导出' : '入库并导出'}
    </button>
  );
}
