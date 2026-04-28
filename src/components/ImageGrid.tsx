import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { toPreviewUrl } from '../lib/imageProxy';
import { ImageCard } from './ImageCard';
import styles from './ImageGrid.module.css';

const STAGE_WIDTH = 1800;
const STAGE_HEIGHT = 960;
const CARD_SIZE = 240;
const STAGE_PADDING = 360;
const CARD_GAP = 28;

export function ImageGrid() {
  const { state, dispatch } = useWorkspace();
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const closePreview = () => setPreviewAssetId(null);
  const dragRef = useRef<{
    assetId: string | null;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    assetSize: number;
    moved: boolean;
  }>({
    assetId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    assetSize: CARD_SIZE,
    moved: false,
  });
  const suppressClickAssetIdRef = useRef<string | null>(null);

  const previewRun =
    state.previewing?.runId && state.previewing.runId.length > 0
      ? state.previewing.runId
      : null;
  const isSummaryPreview = Boolean(state.previewing) && !previewRun;

  const runId = previewRun ?? state.canvasRunFilter;
  const assets = runId
    ? state.assets.filter((a) => a.runId === runId)
    : state.assets;
  const previewAsset = useMemo(
    () => assets.find((a) => a.id === previewAssetId) ?? null,
    [assets, previewAssetId],
  );
  useEffect(() => {
    if (!previewAsset) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePreview();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewAsset]);
  const stageBounds = assets.reduce(
    (acc, item) => {
      const size = CARD_SIZE * (Number.isFinite(item.canvasScale) ? item.canvasScale : 1);
      return {
        maxRight: Math.max(acc.maxRight, item.canvasX + size),
        maxBottom: Math.max(acc.maxBottom, item.canvasY + size),
      };
    },
    { maxRight: STAGE_WIDTH, maxBottom: STAGE_HEIGHT },
  );
  const loadingSlots = (() => {
    if (!state.generating) return [] as Array<{ x: number; y: number }>;
    const count = Math.max(1, state.generateSettings.count || 1);
    if (assets.length === 0) {
      const rowWidth = count * CARD_SIZE + Math.max(0, count - 1) * CARD_GAP;
      const left = Math.max(56, Math.round((STAGE_WIDTH - rowWidth) / 2));
      const top = Math.max(56, Math.round((STAGE_HEIGHT - CARD_SIZE) / 2));
      return Array.from({ length: count }).map((_, i) => ({
        x: left + i * (CARD_SIZE + CARD_GAP),
        y: top,
      }));
    }
    const rightEdge = assets.reduce((max, item) => {
      const scale = Number.isFinite(item.canvasScale) ? item.canvasScale : 1;
      return Math.max(max, item.canvasX + CARD_SIZE * scale);
    }, 0);
    const topY = assets.reduce(
      (min, item) => Math.min(min, item.canvasY),
      Number.POSITIVE_INFINITY,
    );
    return Array.from({ length: count }).map((_, i) => ({
      x: rightEdge + CARD_GAP + i * (CARD_SIZE + CARD_GAP),
      y: Number.isFinite(topY) ? topY : 120,
    }));
  })();

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current.assetId) return;

      const dx = e.clientX - current.startX;
      const dy = e.clientY - current.startY;
      if (!current.moved && Math.hypot(dx, dy) > 4) {
        current.moved = true;
      }

      const nextX = current.originX + dx;
      const nextY = current.originY + dy;
      dispatch({
        type: 'UPDATE_ASSET_POSITION',
        assetId: current.assetId,
        x: nextX,
        y: nextY,
      });
    };

    const onPointerUp = () => {
      if (dragRef.current.assetId && dragRef.current.moved) {
        suppressClickAssetIdRef.current = dragRef.current.assetId;
      }
      dragRef.current = {
        assetId: null,
        startX: 0,
        startY: 0,
        originX: 0,
        originY: 0,
        assetSize: CARD_SIZE,
        moved: false,
      };
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dispatch]);

  const onAssetPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    assetId: string,
    canvasX: number,
    canvasY: number,
    canvasScale: number,
  ) => {
    e.stopPropagation();
    dispatch({ type: 'BRING_ASSET_TO_FRONT', assetId });
    dragRef.current = {
      assetId,
      startX: e.clientX,
      startY: e.clientY,
      originX: canvasX,
      originY: canvasY,
      assetSize: CARD_SIZE * canvasScale,
      moved: false,
    };
  };

  const onAssetWheel = (e: React.WheelEvent<HTMLDivElement>, assetId: string) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;

    const nextScale = Math.min(
      2.4,
      Math.max(0.45, asset.canvasScale * Math.exp(-e.deltaY * 0.0012)),
    );
    dispatch({ type: 'SET_ASSET_SCALE', assetId, scale: nextScale });

    const nextSize = CARD_SIZE * nextScale;
    const nextX = Number.isFinite(nextSize) ? asset.canvasX : asset.canvasX;
    const nextY = Number.isFinite(nextSize) ? asset.canvasY : asset.canvasY;
    if (nextX !== asset.canvasX || nextY !== asset.canvasY) {
      dispatch({ type: 'UPDATE_ASSET_POSITION', assetId, x: nextX, y: nextY });
    }
  };

  const onAssetSelect = (assetId: string) => {
    if (suppressClickAssetIdRef.current === assetId) {
      suppressClickAssetIdRef.current = null;
      return;
    }
    dispatch({ type: 'TOGGLE_ASSET_SELECT', assetId });
  };

  const onAssetDragStart = (
    e: React.DragEvent<HTMLButtonElement>,
    assetId: string,
  ) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', assetId);
    e.dataTransfer.setData('application/x-refine-asset-id', assetId);
  };

  if (isSummaryPreview) {
    return (
      <div className={styles.empty}>
        <p>正在查看：{state.previewing?.label}</p>
        <span className={styles.hint}>
          这里不显示生成画布，可在上方点击“返回当前画布”
        </span>
      </div>
    );
  }

  if (assets.length === 0 && !state.generating) {
    return (
      <div className={styles.empty}>
        {!state.summaryConfirmed && state.summaryMode === 'required' ? (
          <>
            <p>先在左侧输入需求，再确认摘要</p>
            <span className={styles.hint}>确认后系统会自动开始出图</span>
          </>
        ) : state.canvasRunFilter || previewRun ? (
          <>
            <p>这个筛选条件下还没有图片</p>
            <span className={styles.hint}>切换轮次或结束预览后，再看全部图片</span>
          </>
        ) : (
          <>
            <p>{state.generationError ? '这次出图没有成功' : '还没有生成结果'}</p>
            <span className={styles.hint}>
              {state.generationError
                ? state.generationError
                : '发送需求后，系统会根据输入直接生成或按需补充摘要'}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className={styles.stage}
        style={{
          width: Math.max(STAGE_WIDTH, stageBounds.maxRight + STAGE_PADDING),
          height: Math.max(STAGE_HEIGHT, stageBounds.maxBottom + STAGE_PADDING),
        }}
      >
        {assets.map((a) => (
          <div
            key={a.id}
            className={styles.item}
            style={{
              transform: `translate(${a.canvasX}px, ${a.canvasY}px)`,
              width: CARD_SIZE * a.canvasScale,
              zIndex: a.canvasZ,
            }}
          >
            <ImageCard
              asset={a}
              selected={state.selectedAssetIds.includes(a.id)}
              multiSelectMode={state.multiSelectMode}
              onPointerDown={(e) =>
                onAssetPointerDown(
                  e,
                  a.id,
                  a.canvasX,
                  a.canvasY,
                  a.canvasScale,
                )
              }
              onWheel={(e) => onAssetWheel(e, a.id)}
              onToggleSelect={() => onAssetSelect(a.id)}
              onDragStart={(e) => onAssetDragStart(e, a.id)}
              onOpenPreview={() => setPreviewAssetId(a.id)}
            />
          </div>
        ))}
        {loadingSlots.map((slot, i) => (
          <div
            key={`loading-${i}`}
            className={styles.skeletonItem}
            style={{
              transform: `translate(${slot.x}px, ${slot.y}px)`,
              width: CARD_SIZE,
              zIndex: 1000 + i,
            }}
          >
            <div className={styles.skeleton} />
          </div>
        ))}
      </div>
      {previewAsset
        ? createPortal(
            <div
              className={styles.previewMask}
              role="dialog"
              aria-modal="true"
              aria-label="图片放大预览"
              onClick={closePreview}
            >
              <div className={styles.previewFrame} onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={styles.previewClose}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    closePreview();
                  }}
                  aria-label="关闭预览"
                  title="关闭预览（Esc）"
                >
                  关闭 ×
                </button>
                <img
                  className={styles.previewImage}
                  src={toPreviewUrl(previewAsset.imageUrl)}
                  alt={previewAsset.finalPrompt}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
