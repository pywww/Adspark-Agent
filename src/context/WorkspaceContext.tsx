import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type {
  ChatMessage,
  FinalizedRecord,
  GeneratedAsset,
  GenerateSettings,
  GenerationRun,
  IntentBrief,
  ReferenceImage,
  SummarySnapshot,
} from '../types';

/** 工作台状态机（对齐《待确认》+ 开发指令） */
export interface WorkspaceState {
  taskId: string;
  taskName: string;
  summaryConfirmed: boolean;
  summaryVersion: number;
  summaryMode: 'required' | 'optional' | null;
  generating: boolean;
  generationError: string | null;
  finalizing: boolean;
  finalizeError: string | null;
  messages: ChatMessage[];
  generateSettings: GenerateSettings;
  assets: GeneratedAsset[];
  runs: GenerationRun[];
  selectedAssetIds: string[];
  multiSelectMode: boolean;
  canvasView: 'grid' | 'compare';
  /** 画布工具条「轮次」筛选；null=全部 */
  canvasRunFilter: string | null;
  previewing: { label: string; runId: string } | null;
  summarySnapshots: SummarySnapshot[];
  latestIntentBrief: IntentBrief | null;
  finalized: FinalizedRecord[];
  toasts: { id: string; type: 'success' | 'error' | 'info'; text: string }[];
  /** 左侧输入框当前微调目标图（由拖拽选中） */
  refineTargetAssetId: string | null;
  referenceImages: ReferenceImage[];
  referenceUploading: boolean;
  referenceMode: 'style' | 'structure';
  referenceWeight: number;
}

type Action =
  | { type: 'SET_TASK'; taskId: string; taskName: string }
  | { type: 'ADD_USER_MESSAGE'; content: string; referenceImages?: ReferenceImage[] }
  | { type: 'ADD_ASSISTANT_MESSAGE'; content: string; kind?: 'summary' | 'thinking' }
  | { type: 'CLEAR_THINKING_MESSAGES' }
  | { type: 'ADD_SUMMARY_DRAFT' }
  | {
      type: 'ADD_SUMMARY_DRAFT_WITH_CHIPS';
      chips: string[];
      brief?: IntentBrief;
      required?: boolean;
    }
  | { type: 'CONFIRM_SUMMARY' }
  | { type: 'SET_LATEST_INTENT_BRIEF'; brief: IntentBrief | null }
  | { type: 'SET_GENERATING'; value: boolean; error?: string | null }
  | { type: 'SET_FINALIZING'; value: boolean; error?: string | null }
  | { type: 'CLEAR_FINALIZE_ERROR' }
  | { type: 'SET_SETTINGS'; partial: Partial<GenerateSettings> }
  | { type: 'TOGGLE_MULTI_SELECT'; value?: boolean }
  | { type: 'SET_CANVAS_VIEW'; view: 'grid' | 'compare' }
  | { type: 'SET_CANVAS_RUN_FILTER'; runId: string | null }
  | { type: 'TOGGLE_ASSET_SELECT'; assetId: string }
  | { type: 'UPDATE_ASSET_POSITION'; assetId: string; x: number; y: number }
  | { type: 'SET_ASSET_SCALE'; assetId: string; scale: number }
  | { type: 'BRING_ASSET_TO_FRONT'; assetId: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'TOGGLE_STAR'; assetId: string }
  | { type: 'TOGGLE_REJECT'; assetId: string }
  | { type: 'SET_NOTE'; assetId: string; note: string }
  | { type: 'RETRY_ASSET'; assetId: string }
  | { type: 'APPEND_RUN_ASSETS'; run: GenerationRun; assets: GeneratedAsset[] }
  | { type: 'SET_PREVIEW'; preview: WorkspaceState['previewing'] }
  | { type: 'RESET_PREVIEW' }
  | { type: 'UPDATE_SNAPSHOT_CHIPS'; snapshotId: string; chips: string[] }
  | { type: 'LOAD_SNAPSHOT_DRAFT'; snapshotId: string }
  | { type: 'FINALIZE_SELECTED'; record: FinalizedRecord; silent?: boolean }
  | { type: 'SET_REFINE_TARGET'; assetId: string }
  | { type: 'CLEAR_REFINE_TARGET' }
  | { type: 'ADD_REFERENCE_IMAGES'; images: ReferenceImage[] }
  | { type: 'REMOVE_REFERENCE_IMAGE'; imageId: string }
  | { type: 'CLEAR_REFERENCE_IMAGES' }
  | { type: 'SET_REFERENCE_UPLOADING'; value: boolean }
  | { type: 'SET_REFERENCE_MODE'; mode: 'style' | 'structure' }
  | { type: 'SET_REFERENCE_WEIGHT'; weight: number }
  | { type: 'TOAST'; toast: WorkspaceState['toasts'][number] }
  | { type: 'DISMISS_TOAST'; id: string };

function uid() {
  return crypto.randomUUID();
}

const defaultSettings: GenerateSettings = {
  count: 1,
  ratio: '智能',
  strength: 0.7,
  refWeight: 0.5,
  modelName: 'Seedream 5.0',
  engineVersion: '图片 4.0',
  qualityPreset: '高清 2K',
  trendReferenceEnabled: false,
  hotSampleReferenceEnabled: true,
  trendReferenceRange: '30d',
  exploreMode: 'single',
};

function buildDefaultChips(): string[] {
  return ['市场:未填', '主题:未填', '风格:未填', '场景:未填', '主体:未填', '平台:通用'];
}

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'SET_TASK':
      return {
        ...state,
        taskId: action.taskId,
        taskName: action.taskName,
      };
    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: uid(),
            role: 'user',
            content: action.content,
            referenceImages: action.referenceImages?.map((img) => ({ ...img })) || [],
          },
        ],
      };
    case 'ADD_ASSISTANT_MESSAGE':
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: uid(), role: 'assistant', content: action.content, kind: action.kind },
        ],
      };
    case 'CLEAR_THINKING_MESSAGES':
      return {
        ...state,
        messages: state.messages.filter((msg) => msg.kind !== 'thinking'),
      };
    case 'ADD_SUMMARY_DRAFT': {
      const nextV = state.summaryVersion + 1;
      const snap: SummarySnapshot = {
        id: uid(),
        version: nextV,
        title: `摘要草稿 v${nextV}`,
        chips: buildDefaultChips(),
        createdAt: new Date().toISOString(),
      };
      return {
        ...state,
        summaryVersion: nextV,
        summaryConfirmed: false,
        summaryMode: 'required',
        summarySnapshots: [snap, ...state.summarySnapshots],
        messages: [
          ...state.messages,
          {
            id: uid(),
            role: 'assistant',
            kind: 'summary',
            snapshotId: snap.id,
            content: `已生成摘要 v${nextV}，请在卡片中修改关键项后确认并生成。`,
          },
        ],
      };
    }
    case 'ADD_SUMMARY_DRAFT_WITH_CHIPS': {
      const nextV = state.summaryVersion + 1;
      const snap: SummarySnapshot = {
        id: uid(),
        version: nextV,
        title: `摘要草稿 v${nextV}`,
        chips: action.chips.length
          ? action.chips
          : buildDefaultChips(),
        createdAt: new Date().toISOString(),
        brief: action.brief,
        required: action.required ?? true,
      };
      return {
        ...state,
        summaryVersion: nextV,
        summaryConfirmed: false,
        summaryMode: action.required === false ? 'optional' : 'required',
        latestIntentBrief: action.brief ?? state.latestIntentBrief,
        summarySnapshots: [snap, ...state.summarySnapshots],
        messages: [
          ...state.messages,
          {
            id: uid(),
            role: 'assistant',
            kind: 'summary',
            snapshotId: snap.id,
            content:
              action.required === false
                ? `已解析结构化 brief v${nextV}，可按需补充后生成。`
                : `已生成摘要 v${nextV}，请在卡片中修改关键项后确认并生成。`,
          },
        ],
      };
    }
    case 'SET_LATEST_INTENT_BRIEF':
      return {
        ...state,
        latestIntentBrief: action.brief,
      };
    case 'CONFIRM_SUMMARY':
      return {
        ...state,
        summaryConfirmed: true,
        summaryMode: 'required',
        finalizeError: null,
        toasts: [
          ...state.toasts,
          {
            id: uid(),
            type: 'success',
            text: `摘要 v${state.summaryVersion} 已确认，开始生成`,
          },
        ],
      };
    case 'SET_LATEST_INTENT_BRIEF':
      return {
        ...state,
        latestIntentBrief: action.brief,
      };
    case 'SET_GENERATING':
      return {
        ...state,
        generating: action.value,
        generationError: action.error ?? null,
      };
    case 'SET_FINALIZING':
      return {
        ...state,
        finalizing: action.value,
        finalizeError:
          action.error === undefined ? state.finalizeError : action.error,
      };
    case 'CLEAR_FINALIZE_ERROR':
      return { ...state, finalizeError: null };
    case 'SET_SETTINGS':
      return {
        ...state,
        generateSettings: { ...state.generateSettings, ...action.partial },
      };
    case 'TOGGLE_MULTI_SELECT': {
      const nextMulti = action.value ?? !state.multiSelectMode;
      return {
        ...state,
        multiSelectMode: nextMulti,
        /* 关闭多选时清空选中，避免与单选逻辑混淆 */
        selectedAssetIds: nextMulti ? state.selectedAssetIds : [],
      };
    }
    case 'SET_CANVAS_VIEW':
      return { ...state, canvasView: action.view };
    case 'SET_CANVAS_RUN_FILTER':
      return { ...state, canvasRunFilter: action.runId };
    case 'TOGGLE_ASSET_SELECT': {
      if (!state.multiSelectMode) {
        return { ...state, selectedAssetIds: [action.assetId] };
      }
      const set = new Set(state.selectedAssetIds);
      if (set.has(action.assetId)) set.delete(action.assetId);
      else set.add(action.assetId);
      return { ...state, selectedAssetIds: [...set] };
    }
    case 'UPDATE_ASSET_POSITION':
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.assetId ? { ...a, canvasX: action.x, canvasY: action.y } : a,
        ),
      };
    case 'SET_ASSET_SCALE':
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.assetId ? { ...a, canvasScale: action.scale } : a,
        ),
      };
    case 'BRING_ASSET_TO_FRONT': {
      const top = state.assets.reduce(
        (max, asset) => Math.max(max, asset.canvasZ ?? 0),
        0,
      );
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.assetId ? { ...a, canvasZ: top + 1 } : a,
        ),
      };
    }
    case 'CLEAR_SELECTION':
      return { ...state, selectedAssetIds: [] };
    case 'TOGGLE_STAR':
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.assetId ? { ...a, starred: !a.starred } : a,
        ),
      };
    case 'TOGGLE_REJECT':
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.assetId ? { ...a, rejected: !a.rejected } : a,
        ),
      };
    case 'SET_NOTE':
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.assetId ? { ...a, note: action.note } : a,
        ),
      };
    case 'RETRY_ASSET':
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.assetId
            ? { ...a, failed: false, imageUrl: `${a.imageUrl.split('?')[0]}?retry=${Date.now()}` }
            : a,
        ),
      };
    case 'APPEND_RUN_ASSETS':
      return {
        ...state,
        runs: [action.run, ...state.runs],
        assets: [...action.assets, ...state.assets],
        generating: false,
        generationError: null,
      };
    case 'SET_PREVIEW':
      return {
        ...state,
        previewing: action.preview,
        canvasRunFilter:
          action.preview?.runId && action.preview.runId.length > 0
            ? action.preview.runId
            : state.canvasRunFilter,
      };
    case 'RESET_PREVIEW':
      return { ...state, previewing: null, canvasRunFilter: null };
    case 'UPDATE_SNAPSHOT_CHIPS':
      return {
        ...state,
        summarySnapshots: state.summarySnapshots.map((s) =>
          s.id === action.snapshotId ? { ...s, chips: action.chips } : s,
        ),
      };
    case 'LOAD_SNAPSHOT_DRAFT': {
      const src = state.summarySnapshots.find((s) => s.id === action.snapshotId);
      if (!src) return state;
      const nextV = state.summaryVersion + 1;
      const snap: SummarySnapshot = {
        id: uid(),
        version: nextV,
        title: `从 v${src.version} 载入`,
        chips: [...src.chips],
        createdAt: new Date().toISOString(),
      };
      return {
        ...state,
        summaryVersion: nextV,
        summaryConfirmed: false,
        summaryMode: 'required',
        summarySnapshots: [snap, ...state.summarySnapshots],
        messages: [
          ...state.messages,
          {
            id: uid(),
            role: 'assistant',
            kind: 'summary',
            snapshotId: snap.id,
            content: `已载入摘要 v${src.version} 为可编辑草稿 v${nextV}。`,
          },
        ],
      };
    }
    case 'FINALIZE_SELECTED':
      return {
        ...state,
        finalized: [action.record, ...state.finalized],
        finalizing: false,
        finalizeError: null,
        selectedAssetIds: [],
        toasts: action.silent
          ? state.toasts
          : [...state.toasts, { id: uid(), type: 'success', text: '图片已入库' }],
      };
    case 'SET_REFINE_TARGET':
      return { ...state, refineTargetAssetId: action.assetId };
    case 'CLEAR_REFINE_TARGET':
      return { ...state, refineTargetAssetId: null };
    case 'ADD_REFERENCE_IMAGES': {
      const next = [...state.referenceImages, ...action.images];
      return { ...state, referenceImages: next.slice(-6) };
    }
    case 'REMOVE_REFERENCE_IMAGE':
      return {
        ...state,
        referenceImages: state.referenceImages.filter((img) => img.id !== action.imageId),
      };
    case 'CLEAR_REFERENCE_IMAGES':
      return { ...state, referenceImages: [] };
    case 'SET_REFERENCE_UPLOADING':
      return { ...state, referenceUploading: action.value };
    case 'SET_REFERENCE_MODE':
      return { ...state, referenceMode: action.mode };
    case 'SET_REFERENCE_WEIGHT':
      return {
        ...state,
        referenceWeight: Math.max(0, Math.min(1, action.weight)),
      };
    case 'TOAST':
      return { ...state, toasts: [...state.toasts, action.toast] };
    case 'DISMISS_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.id),
      };
    default:
      return state;
  }
}

function createInitialState(taskId: string, taskName: string): WorkspaceState {
  return {
    taskId,
    taskName,
    summaryConfirmed: false,
    summaryVersion: 0,
    summaryMode: null,
    generating: false,
    generationError: null,
    finalizing: false,
    finalizeError: null,
    messages: [
      {
        id: uid(),
        role: 'assistant',
        content:
          '你好，我是电商广告创作助手。请在下方输入自然语言 brief；信息不足时我会补充结构化摘要，信息充分时会直接开始生成。',
      },
    ],
    generateSettings: { ...defaultSettings },
    assets: [],
    runs: [],
    selectedAssetIds: [],
    multiSelectMode: false,
    canvasView: 'grid',
    canvasRunFilter: null,
    previewing: null,
    summarySnapshots: [],
    latestIntentBrief: null,
    finalized: [],
    toasts: [],
    refineTargetAssetId: null,
    referenceImages: [],
    referenceUploading: false,
    referenceMode: 'structure',
    referenceWeight: 0.6,
  };
}

type Ctx = {
  state: WorkspaceState;
  dispatch: React.Dispatch<Action>;
  pushToast: (t: Omit<WorkspaceState['toasts'][number], 'id'>) => void;
};

const WorkspaceContext = createContext<Ctx | null>(null);

export function WorkspaceProvider({
  taskId,
  taskName,
  children,
}: {
  taskId: string;
  taskName: string;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    reducer,
    { taskId, taskName },
    ({ taskId: tid, taskName: tn }) => createInitialState(tid, tn),
  );

  const pushToast = useCallback(
    (t: Omit<WorkspaceState['toasts'][number], 'id'>) => {
      dispatch({ type: 'TOAST', toast: { ...t, id: uid() } });
    },
    [],
  );

  const value = useMemo(
    () => ({ state, dispatch, pushToast }),
    [state, dispatch, pushToast],
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace 必须在 WorkspaceProvider 内使用');
  return ctx;
}

export type { Action as WorkspaceAction };
