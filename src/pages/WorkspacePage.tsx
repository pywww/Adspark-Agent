import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BriefComposer } from '../components/BriefComposer';
import { CanvasToolbar } from '../components/CanvasToolbar';
import { ChatPaneToolbar } from '../components/ChatPaneToolbar';
import { ChatThread } from '../components/ChatThread';
import { CompareView } from '../components/CompareView';
import { ImageGrid } from '../components/ImageGrid';
import { TaskSidebar } from '../components/TaskSidebar';
import { ToastHost } from '../components/ToastHost';
import { WorkspaceProvider, useWorkspace } from '../context/WorkspaceContext';
import {
  createTaskId,
  loadTasks,
  setLastTaskId,
  upsertTask,
} from '../lib/taskStorage';
import styles from './WorkspacePage.module.css';

function PreviewBanner() {
  const { state, dispatch } = useWorkspace();
  if (!state.previewing) return null;
  return (
    <div className={styles.preview}>
      <span>正在查看：{state.previewing.label}</span>
      <button
        type="button"
        className={styles.previewBtn}
        onClick={() => dispatch({ type: 'RESET_PREVIEW' })}
      >
        返回当前画布
      </button>
    </div>
  );
}

function WorkspaceInner() {
  const { state } = useWorkspace();
  const [leftW, setLeftW] = useState(400);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [canvasDragging, setCanvasDragging] = useState(false);
  const dragging = useRef(false);
  const canvasMainRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);
  const lastRunIdRef = useRef<string | null>(null);
  const panGestureRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const suppressClickRef = useRef(false);
  const CANVAS_OVERSCROLL = 3600;

  const clampCanvasView = useCallback(
    (scale: number, x: number, y: number) => {
      const viewport = canvasMainRef.current;
      const content = canvasContentRef.current;
      if (!viewport || !content) {
        return { x, y };
      }

      const baseWidth = content.offsetWidth;
      const baseHeight = content.offsetHeight;
      const scaledWidth = baseWidth * scale;
      const scaledHeight = baseHeight * scale;

      const minX =
        scaledWidth <= viewport.clientWidth
          ? (viewport.clientWidth - scaledWidth) / 2 - CANVAS_OVERSCROLL
          : viewport.clientWidth - scaledWidth - CANVAS_OVERSCROLL;
      const maxX = scaledWidth <= viewport.clientWidth ? minX + CANVAS_OVERSCROLL * 2 : CANVAS_OVERSCROLL;

      const minY =
        scaledHeight <= viewport.clientHeight
          ? (viewport.clientHeight - scaledHeight) / 2 - CANVAS_OVERSCROLL
          : viewport.clientHeight - scaledHeight - CANVAS_OVERSCROLL;
      const maxY = scaledHeight <= viewport.clientHeight ? minY + CANVAS_OVERSCROLL * 2 : CANVAS_OVERSCROLL;

      return {
        x: Math.min(maxX, Math.max(minX, x)),
        y: Math.min(maxY, Math.max(minY, y)),
      };
    },
    [],
  );

  const centerCanvasView = useCallback(
    (scale: number) => {
      const viewport = canvasMainRef.current;
      const content = canvasContentRef.current;
      if (!viewport || !content) return { x: 0, y: 0 };

      const scaledWidth = content.offsetWidth * scale;
      const scaledHeight = content.offsetHeight * scale;
      return clampCanvasView(
        scale,
        (viewport.clientWidth - scaledWidth) / 2,
        (viewport.clientHeight - scaledHeight) / 2,
      );
    },
    [clampCanvasView],
  );

  const focusAssetsInViewport = useCallback(
    (assetIds: string[], scale: number) => {
      const viewport = canvasMainRef.current;
      if (!viewport || assetIds.length === 0) return centerCanvasView(scale);
      const picked = state.assets.filter((a) => assetIds.includes(a.id));
      if (picked.length === 0) return centerCanvasView(scale);
      const left = Math.min(...picked.map((a) => a.canvasX));
      const top = Math.min(...picked.map((a) => a.canvasY));
      const right = Math.max(...picked.map((a) => a.canvasX + 240 * (a.canvasScale || 1)));
      const bottom = Math.max(...picked.map((a) => a.canvasY + 240 * (a.canvasScale || 1)));
      const targetX = (left + right) / 2;
      const targetY = (top + bottom) / 2;
      return clampCanvasView(
        scale,
        viewport.clientWidth / 2 - targetX * scale,
        viewport.clientHeight / 2 - targetY * scale,
      );
    },
    [centerCanvasView, clampCanvasView, state.assets],
  );

  useEffect(() => {
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const w = Math.min(480, Math.max(360, e.clientX));
      setLeftW(w);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    const update = () => {
      setCanvasPan((prev) => clampCanvasView(canvasScale, prev.x, prev.y));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [
    canvasScale,
    clampCanvasView,
    state.assets.length,
    state.canvasView,
    state.generating,
  ]);

  useEffect(() => {
    const latestRun = state.runs[0] ?? null;
    if (state.generating) return;
    if (!latestRun?.id) return;
    if (lastRunIdRef.current === latestRun.id) return;

    lastRunIdRef.current = latestRun.id;
    setCanvasScale(1);
    requestAnimationFrame(() => {
      setCanvasPan(focusAssetsInViewport(latestRun.assetIds, 1));
    });
  }, [focusAssetsInViewport, state.generating, state.runs]);

  useEffect(() => {
    if (state.assets.length === 0) {
      setCanvasScale(1);
      requestAnimationFrame(() => {
        setCanvasPan(centerCanvasView(1));
      });
    }
  }, [centerCanvasView, state.assets.length]);

  useEffect(() => {
    requestAnimationFrame(() => {
      setCanvasPan((prev) => clampCanvasView(canvasScale, prev.x, prev.y));
    });
  }, [canvasScale, clampCanvasView, state.canvasView]);

  const onCanvasWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const viewport = canvasMainRef.current;
    if (!viewport) return;
    e.preventDefault();

    const rect = viewport.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const speed = e.ctrlKey ? 0.0014 : 0.0009;
    const factor = Math.exp(-e.deltaY * speed);
    const nextScale = Math.min(3, Math.max(0.72, canvasScale * factor));
    if (Math.abs(nextScale - canvasScale) < 0.001) return;

    const worldX = (cursorX - canvasPan.x) / canvasScale;
    const worldY = (cursorY - canvasPan.y) / canvasScale;
    const nextPan = clampCanvasView(
      nextScale,
      cursorX - worldX * nextScale,
      cursorY - worldY * nextScale,
    );

    setCanvasScale(nextScale);
    setCanvasPan(nextPan);
  };

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    panGestureRef.current = {
      active: true,
      moved: false,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: canvasPan.x,
      originY: canvasPan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const current = panGestureRef.current;
    if (!current.active) return;

    const dx = e.clientX - current.startX;
    const dy = e.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) > 5) {
      current.moved = true;
      setCanvasDragging(true);
    }
    if (!current.moved) return;

    setCanvasPan(
      clampCanvasView(canvasScale, current.originX + dx, current.originY + dy),
    );
  };

  const finishCanvasDrag = (pointerId: number, currentTarget: HTMLDivElement) => {
    if (panGestureRef.current.active && panGestureRef.current.pointerId === pointerId) {
      if (panGestureRef.current.moved) {
        suppressClickRef.current = true;
      }
      panGestureRef.current.active = false;
      panGestureRef.current.moved = false;
      setCanvasDragging(false);
      if (currentTarget.hasPointerCapture(pointerId)) {
        currentTarget.releasePointerCapture(pointerId);
      }
    }
  };

  const onCanvasClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const onCanvasResetView = () => {
    setCanvasScale(1);
    requestAnimationFrame(() => {
      setCanvasPan(centerCanvasView(1));
    });
  };

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <div
          className={styles.leftPane}
          style={{ width: leftW, minWidth: leftW, maxWidth: leftW }}
        >
          <div className={styles.chatPane}>
            <ChatPaneToolbar
              onOpenHistory={() => setHistoryOpen((v) => !v)}
              historyOpen={historyOpen}
            />
            <ChatThread />
            <BriefComposer />
          </div>
          <TaskSidebar
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
          />
        </div>
        <div
          className={styles.splitter}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整左栏宽度"
          onMouseDown={() => {
            dragging.current = true;
            document.body.style.cursor = 'col-resize';
          }}
        />
        <div className={styles.canvasPane}>
          <CanvasToolbar />
          <PreviewBanner />
          <div
            ref={canvasMainRef}
            className={`${styles.canvasMain} ${canvasDragging ? styles.canvasMainDragging : styles.canvasMainIdle}`}
            onWheel={onCanvasWheel}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={(e) => finishCanvasDrag(e.pointerId, e.currentTarget)}
            onPointerCancel={(e) => finishCanvasDrag(e.pointerId, e.currentTarget)}
            onClickCapture={onCanvasClickCapture}
            onDoubleClick={onCanvasResetView}
          >
            <div
              ref={canvasContentRef}
              className={styles.canvasInner}
              style={{
                transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasScale})`,
              }}
            >
              <div className={styles.canvasContent}>
                {state.canvasView === 'grid' ? <ImageGrid /> : <CompareView />}
              </div>
            </div>
            {state.generating && (
              <div className={styles.generatingOverlay} role="status" aria-live="polite">
                <div className={styles.generatingCardRow}>
                  {Array.from({ length: Math.max(1, state.generateSettings.count || 1) })
                    .slice(0, 4)
                    .map((_, i) => (
                      <div key={i} className={styles.generatingCard} />
                    ))}
                </div>
                <span className={styles.generatingText}>正在生成图片，请稍候…</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <ToastHost />
    </div>
  );
}

export function WorkspacePage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (taskId !== 'new') return;
    const id = createTaskId();
    upsertTask({
      id,
      name: '新任务',
      updatedAt: new Date().toISOString(),
      status: 'draft',
      assetCount: 0,
    });
    setLastTaskId(id);
    navigate(`/workspace/${id}`, { replace: true });
  }, [taskId, navigate]);

  const taskName = useMemo(() => {
    if (!taskId || taskId === 'new') return '新任务';
    const t = loadTasks().find((x) => x.id === taskId);
    return t?.name ?? '未命名任务';
  }, [taskId]);

  useEffect(() => {
    if (!taskId || taskId === 'new') return;
    const exists = loadTasks().some((t) => t.id === taskId);
    if (!exists) {
      upsertTask({
        id: taskId,
        name: '新任务',
        updatedAt: new Date().toISOString(),
        status: 'draft',
        assetCount: 0,
      });
    }
  }, [taskId]);

  if (!taskId || taskId === 'new') {
    return (
      <div className={styles.boot} role="status">
        正在创建任务…
      </div>
    );
  }

  return (
    <WorkspaceProvider key={taskId} taskId={taskId} taskName={taskName}>
      <WorkspaceInner />
    </WorkspaceProvider>
  );
}
