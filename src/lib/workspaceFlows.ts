import type { Dispatch } from 'react';
import { appendFinalized } from './finalizedStorage';
import { loadTasks, parseChipsMeta, patchTask } from './taskStorage';
import type {
  FinalizedRecord,
  GeneratedAsset,
  GenerationRun,
  IntentBrief,
  TrendReferenceRange,
} from '../types';
import type { WorkspaceAction, WorkspaceState } from '../context/WorkspaceContext';

const CANVAS_STAGE_WIDTH = 1800;
const CANVAS_STAGE_HEIGHT = 960;
const CANVAS_IMAGE_SIZE = 240;
const CANVAS_IMAGE_GAP = 28;
const REQUEST_TIMEOUT_MS = 180_000;
const GENERATE_BATCH_SIZE = 2;
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  'http://localhost:8787';

function normalizeAspectRatio(value?: string) {
  const v = String(value || '').trim();
  if (!v || v === '智能') return '1:1';
  return v;
}

interface GenerateApiRecord {
  candidate_id: string;
  task_id: string;
  run_id: string;
  image_url: string;
  final_prompt?: string;
  visual_dna?: string;
  seed?: string;
  generation_mode: 'create' | 'refine';
  parent_candidate_id?: string | null;
  market?: string;
  topic?: string;
  style?: string;
  scene?: string;
  product_subject?: string;
  platform?: string;
  constraints?: string[];
  negative_constraints?: string[];
  output_goal?: string;
  intent_source?: string;
  trend_used?: boolean;
  trend_source?: 'live' | 'cache' | 'none' | 'circuit_open' | string;
  trend_conflict?: boolean;
  trend_conflict_reason?: string;
  trend_range?: string;
  trend_keywords?: string[];
  knowledge_used?: string;
  platform_fit_notes?: string;
  platform_preset?: string;
  explore_mode?: string;
  reference_summary?: string;
  reference_hit_count?: number;
  reference_used?: boolean;
  reference_count?: number;
  reference_mode?: 'style' | 'structure' | string;
  reference_weight?: number;
  debug_received_fields?: Record<string, unknown>;
  debug_trend_used?: boolean;
  debug_rag_hit_count?: number;
  debug_final_prompt_excerpt?: string;
  model_name?: string;
}

interface FinalizeApiRecord {
  material_id: string;
  source_candidate_id: string;
  task_id: string;
  image_url: string;
  final_prompt?: string;
  visual_dna?: string;
  review_status?: string;
  created_at: string;
  market?: string;
  topic?: string;
  style?: string;
  scene?: string;
  product_subject?: string;
  platform?: string;
  constraints?: string[];
  negative_constraints?: string[];
  output_goal?: string;
  trend_used?: boolean;
  trend_source?: 'live' | 'cache' | 'none' | 'circuit_open' | string;
  trend_conflict?: boolean;
  trend_conflict_reason?: string;
  trend_range?: string;
  trend_keywords?: string[];
  knowledge_used?: string;
  platform_fit_notes?: string;
  platform_preset?: string;
  reference_summary?: string;
  reference_hit_count?: number;
  reference_used?: boolean;
  reference_count?: number;
  reference_mode?: 'style' | 'structure' | string;
  reference_weight?: number;
  debug_received_fields?: Record<string, unknown>;
  debug_trend_used?: boolean;
  debug_rag_hit_count?: number;
  debug_final_prompt_excerpt?: string;
  intent_source?: string;
  model_name?: string;
  parent_material_id?: string | null;
  source?: string;
}

function createInitialCanvasLayout(count: number) {
  const positions: Array<{ x: number; y: number }> = [];
  const rowWidth =
    count * CANVAS_IMAGE_SIZE + Math.max(0, count - 1) * CANVAS_IMAGE_GAP;
  const left = Math.max(56, Math.round((CANVAS_STAGE_WIDTH - rowWidth) / 2));
  const top = Math.max(56, Math.round((CANVAS_STAGE_HEIGHT - CANVAS_IMAGE_SIZE) / 2));

  for (let index = 0; index < count; index += 1) {
    positions.push({
      x: left + index * (CANVAS_IMAGE_SIZE + CANVAS_IMAGE_GAP),
      y: top,
    });
  }

  return positions;
}

function createLayoutToRightOfExisting(
  existingAssets: GeneratedAsset[],
  count: number,
) {
  if (existingAssets.length === 0) return createInitialCanvasLayout(count);
  const topY = existingAssets.reduce(
    (min, item) => Math.min(min, item.canvasY),
    Number.POSITIVE_INFINITY,
  );
  const rightEdge = existingAssets.reduce((max, item) => {
    const scale = Number.isFinite(item.canvasScale) ? item.canvasScale : 1;
    return Math.max(max, item.canvasX + CANVAS_IMAGE_SIZE * scale);
  }, 0);
  const startX = rightEdge + CANVAS_IMAGE_GAP;
  const alignedY = Number.isFinite(topY) ? topY : 120;
  return Array.from({ length: count }).map((_, index) => ({
    x: startX + index * (CANVAS_IMAGE_SIZE + CANVAS_IMAGE_GAP),
    y: alignedY,
  }));
}

function pushInfoToast(
  dispatch: Dispatch<WorkspaceAction>,
  type: 'success' | 'error' | 'info',
  text: string,
) {
  dispatch({
    type: 'TOAST',
    toast: {
      id: crypto.randomUUID(),
      type,
      text,
    },
  });
}

async function postJson<T>(path: string, payload?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: controller.signal,
  }).finally(() => {
    window.clearTimeout(timeout);
  });
  const json = (await resp.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    data?: T;
  };
  if (!resp.ok || json.ok === false || !json.data) {
    throw new Error(json.message || `请求失败（${resp.status}）`);
  }
  return json.data;
}

function cozeUrlToImage(url: string) {
  if (!url) return url;
  // Coze 返回可能包含 \u0026 形式的转义参数，展示前先解码。
  return url.replace(/\\u0026/g, '&');
}

function normalizeTrendRange(value?: string | null): TrendReferenceRange | undefined {
  if (value === '3d' || value === '7d' || value === '15d' || value === '30d') {
    return value;
  }
  return undefined;
}

function getReferenceImageUrls(state: WorkspaceState) {
  // 发送后输入框会清空附件，生成时回退到最近一条用户消息携带的附件快照
  const fromPanel = state.referenceImages.map((img) => img.transportUrl || img.url).filter(Boolean);
  if (fromPanel.length) return fromPanel;
  const latestUserMsg = [...state.messages].reverse().find((m) => m.role === 'user');
  const fromMessage =
    latestUserMsg?.referenceImages?.map((img) => img.transportUrl || img.url).filter(Boolean) || [];
  return fromMessage;
}

function getCurrentBrief(state: WorkspaceState, overrideBrief?: IntentBrief | null) {
  if (overrideBrief) return overrideBrief;
  if (state.latestIntentBrief) return state.latestIntentBrief;
  const snapshot = state.summarySnapshots.find((item) => item.version === state.summaryVersion);
  if (!snapshot?.brief) return null;
  return snapshot.brief;
}

export async function generateFromConfirmedSummary(
  state: WorkspaceState,
  dispatch: Dispatch<WorkspaceAction>,
  options?: {
    skipSummaryGuard?: boolean;
    briefOverride?: IntentBrief | null;
  },
) {
  if (!options?.skipSummaryGuard && !state.summaryConfirmed) {
    pushInfoToast(dispatch, 'info', '请先确认摘要，再开始生成');
    return false;
  }
  if (state.generating) return false;

  dispatch({ type: 'SET_GENERATING', value: true, error: null });
  try {
    const snapshot = state.summarySnapshots.find(
      (item) => item.version === state.summaryVersion,
    );
    const parsedMeta = parseChipsMeta(snapshot?.chips ?? []);
    const brief = getCurrentBrief(state, options?.briefOverride);
    // 首次生图：6 点摘要 + explore_mode 为主，不把聊天 user_intent 喂给主工作流
    const summaryPlatform = (
      parsedMeta.platform ||
      brief?.platform ||
      ''
    ).trim() || '通用';
    const count = Math.max(1, Math.min(8, state.generateSettings.count));

    const results: GenerateApiRecord[] = [];
    let failedCount = 0;
    for (let index = 0; index < count; index += GENERATE_BATCH_SIZE) {
      const batchSize = Math.min(GENERATE_BATCH_SIZE, count - index);
      const requests = Array.from({ length: batchSize }).map(() =>
        postJson<GenerateApiRecord>('/api/workflow/generate', {
          task_id: state.taskId,
          // 摘要卡编辑结果优先于最新 brief，确保“改卡片”能真实影响生成
          market: parsedMeta.market || brief?.market || '',
          topic: parsedMeta.topic || brief?.topic || '',
          style: parsedMeta.style || brief?.style || '',
          scene: parsedMeta.scene || brief?.scene || '',
          product_subject: parsedMeta.productSubject || brief?.productSubject || '',
          platform: summaryPlatform,
          constraints: parsedMeta.constraints || brief?.constraints || [],
          negative_constraints:
            parsedMeta.negativeConstraints || brief?.negativeConstraints || [],
          output_goal: parsedMeta.outputGoal || brief?.outputGoal || '',
          aspect_ratio: normalizeAspectRatio(state.generateSettings.ratio),
          user_intent: '',
          intent_source: brief?.source || '',
          trend_reference_enabled: state.generateSettings.trendReferenceEnabled ?? false,
          trend_reference_range: state.generateSettings.trendReferenceRange ?? '30d',
          explore_mode: state.generateSettings.exploreMode ?? 'single',
          // 与 BFF/Coze 兼容：与摘要平台一致，不再使用单独「生成平台预设」
          platform_preset: summaryPlatform,
          reference_images: getReferenceImageUrls(state),
          reference_mode: state.referenceMode,
          reference_weight: state.referenceWeight,
          reference_required: false,
          model_name:
            state.generateSettings.modelName ||
            state.generateSettings.engineVersion ||
            '图片 4.0',
          is_refine: false,
          history_prompt: '',
          history_seed: '',
          history_image_url: '',
          history_material_id: '',
        }),
      );
      const settled = await Promise.allSettled(requests);
      const successItems = settled
        .filter(
          (item): item is PromiseFulfilledResult<GenerateApiRecord> =>
            item.status === 'fulfilled',
        )
        .map((item) => item.value);
      results.push(...successItems);
      failedCount += settled.length - successItems.length;
    }
    if (results.length === 0) {
      throw new Error('生成超时或失败，请稍后重试');
    }
    if (failedCount > 0) {
      pushInfoToast(dispatch, 'info', `有 ${failedCount} 张生成失败，已返回可用结果`);
    }

    const runId = results[0]?.run_id || crypto.randomUUID();
    const runIndex = state.runs.length + 1;
    const positions = createLayoutToRightOfExisting(state.assets, results.length);
    const assets: GeneratedAsset[] = results.map((item, i) => ({
      id: crypto.randomUUID(),
      candidateId: item.candidate_id,
      runId,
      imageUrl: cozeUrlToImage(item.image_url),
      canvasX: positions[i]?.x ?? 0,
      canvasY: positions[i]?.y ?? 0,
      canvasScale: 1,
      canvasZ: i + 1,
      starred: false,
      rejected: false,
      note: '',
      finalPrompt: item.final_prompt || '',
      visualDna: item.visual_dna || '',
      seed: item.seed || '',
      parentCandidateId: item.parent_candidate_id || undefined,
      market: item.market || brief?.market || parsedMeta.market || '',
      topic: item.topic || brief?.topic || parsedMeta.topic || '',
      style: item.style || brief?.style || parsedMeta.style || '',
      scene: item.scene || brief?.scene || parsedMeta.scene || '',
      productSubject:
        item.product_subject || brief?.productSubject || parsedMeta.productSubject || '',
      constraints: item.constraints || brief?.constraints || parsedMeta.constraints || [],
      negativeConstraints:
        item.negative_constraints ||
        brief?.negativeConstraints ||
        parsedMeta.negativeConstraints ||
        [],
      outputGoal: item.output_goal || brief?.outputGoal || parsedMeta.outputGoal || '',
      platform: item.platform || brief?.platform || summaryPlatform,
      platformPreset: item.platform || item.platform_preset || brief?.platform || summaryPlatform,
      intentSource: item.intent_source || brief?.source || '',
      trendUsed: item.trend_used || (state.generateSettings.trendReferenceEnabled ?? false),
      trendSource: (item.trend_source as GeneratedAsset['trendSource']) || 'none',
      trendConflict: Boolean(item.trend_conflict),
      trendConflictReason: item.trend_conflict_reason || '',
      trendRange:
        normalizeTrendRange(item.trend_range) || state.generateSettings.trendReferenceRange,
      trendKeywords: item.trend_keywords || [],
      knowledgeUsed: item.platform_fit_notes || item.knowledge_used || '',
      referenceSummary: item.reference_summary || '',
      referenceUsed: item.reference_used,
      referenceCount: item.reference_count,
      referenceMode: (item.reference_mode as GeneratedAsset['referenceMode']) || state.referenceMode,
      referenceWeight: item.reference_weight ?? state.referenceWeight,
      debugReceivedFields: item.debug_received_fields || {},
      debugTrendUsed: item.debug_trend_used,
      debugRagHitCount: item.debug_rag_hit_count,
      debugFinalPromptExcerpt: item.debug_final_prompt_excerpt || '',
      modelName:
        item.model_name ||
        state.generateSettings.modelName ||
        state.generateSettings.engineVersion ||
        '',
    }));
    const run: GenerationRun = {
      id: runId,
      index: runIndex,
      createdAt: new Date().toISOString(),
      assetIds: assets.map((asset) => asset.id),
    };
    dispatch({ type: 'APPEND_RUN_ASSETS', run, assets });
    pushInfoToast(dispatch, 'success', `已生成 ${assets.length} 张图片`);
    return true;
  } catch (error) {
    pushInfoToast(
      dispatch,
      'error',
      error instanceof Error ? error.message : '生成失败，请检查后端或网络状态',
    );
    dispatch({
      type: 'SET_GENERATING',
      value: false,
      error: error instanceof Error ? error.message : '生成失败',
    });
    return false;
  }
}

export async function generateRefinedAsset(
  state: WorkspaceState,
  dispatch: Dispatch<WorkspaceAction>,
  refineIntent: string,
  options?: {
    briefOverride?: IntentBrief | null;
  },
) {
  const intent = refineIntent.trim();
  if (!intent) {
    pushInfoToast(dispatch, 'info', '请输入微调要求');
    return false;
  }
  if (state.generating) return false;
  if (!state.refineTargetAssetId) {
    pushInfoToast(dispatch, 'info', '请先将要微调的图片拖拽到输入框');
    return false;
  }

  const source = state.assets.find((item) => item.id === state.refineTargetAssetId);
  if (!source) {
    pushInfoToast(dispatch, 'error', '未找到被微调的源图片，请重新拖拽选择');
    return false;
  }

  dispatch({ type: 'SET_GENERATING', value: true, error: null });
  try {
    const parsedBrief = options?.briefOverride;
    const result = await postJson<GenerateApiRecord>('/api/workflow/generate', {
      task_id: state.taskId,
      market: parsedBrief?.market || source.market || '',
      topic: parsedBrief?.topic || source.topic || '',
      style: parsedBrief?.style || source.style || '',
      scene: parsedBrief?.scene || source.scene || '',
      product_subject: parsedBrief?.productSubject || source.productSubject || '',
      platform: parsedBrief?.platform || source.platform || source.platformPreset || '通用',
      constraints: source.constraints || [],
      negative_constraints: source.negativeConstraints || [],
      output_goal: source.outputGoal || '',
      aspect_ratio: normalizeAspectRatio(state.generateSettings.ratio),
      user_intent: intent,
      intent_source: parsedBrief?.source || source.intentSource || '',
      trend_reference_enabled: state.generateSettings.trendReferenceEnabled ?? false,
      trend_reference_range: state.generateSettings.trendReferenceRange ?? '30d',
      // 微调以 user_intent 为主，探索策略固定单一稳定
      explore_mode: 'single',
      platform_preset: source.platform || source.platformPreset || '通用',
      reference_images: getReferenceImageUrls(state),
      reference_mode: state.referenceMode,
      reference_weight: state.referenceWeight,
      reference_required: false,
      model_name:
        state.generateSettings.modelName ||
        state.generateSettings.engineVersion ||
        '图片 4.0',
      is_refine: true,
      history_prompt: source.finalPrompt || '',
      history_seed: source.seed || '',
      history_image_url: source.imageUrl || '',
      history_material_id: '',
      parent_candidate_id: source.candidateId || '',
    });
    const runId = result.run_id || crypto.randomUUID();
    const runIndex = state.runs.length + 1;
    const refined: GeneratedAsset = {
      id: crypto.randomUUID(),
      candidateId: result.candidate_id,
      runId,
      imageUrl: cozeUrlToImage(result.image_url),
      refinedFromAssetId: source.id,
      canvasX: source.canvasX + 42,
      canvasY: source.canvasY + 42,
      canvasScale: source.canvasScale,
      canvasZ: state.assets.reduce((max, asset) => Math.max(max, asset.canvasZ ?? 0), 0) + 1,
      starred: false,
      rejected: false,
      note: `微调要求：${intent}`,
      finalPrompt: result.final_prompt || source.finalPrompt || '',
      visualDna: result.visual_dna || '',
      seed: result.seed || '',
      parentCandidateId: result.parent_candidate_id || source.candidateId || undefined,
      market: result.market || source.market || '',
      topic: result.topic || source.topic || '',
      style: result.style || source.style || '',
      scene: result.scene || source.scene || '',
      productSubject: result.product_subject || source.productSubject || '',
      constraints: result.constraints || source.constraints || [],
      negativeConstraints:
        result.negative_constraints || source.negativeConstraints || [],
      outputGoal: result.output_goal || source.outputGoal || '',
      platform: result.platform || source.platform || source.platformPreset || '通用',
      platformPreset: result.platform || result.platform_preset || source.platformPreset || '通用',
      intentSource: result.intent_source || source.intentSource || '',
      trendUsed: result.trend_used ?? source.trendUsed,
      trendSource: (result.trend_source as GeneratedAsset['trendSource']) || source.trendSource || 'none',
      trendConflict: result.trend_conflict ?? source.trendConflict,
      trendConflictReason: result.trend_conflict_reason || source.trendConflictReason || '',
      trendRange: normalizeTrendRange(result.trend_range) || source.trendRange,
      trendKeywords: result.trend_keywords || source.trendKeywords || [],
      knowledgeUsed: result.platform_fit_notes || result.knowledge_used || source.knowledgeUsed || '',
      referenceSummary: result.reference_summary || source.referenceSummary || '',
      referenceUsed: result.reference_used ?? source.referenceUsed,
      referenceCount: result.reference_count ?? source.referenceCount,
      referenceMode: (result.reference_mode as GeneratedAsset['referenceMode']) || source.referenceMode || state.referenceMode,
      referenceWeight: result.reference_weight ?? source.referenceWeight ?? state.referenceWeight,
      debugReceivedFields: result.debug_received_fields || source.debugReceivedFields || {},
      debugTrendUsed: result.debug_trend_used ?? source.debugTrendUsed,
      debugRagHitCount: result.debug_rag_hit_count ?? source.debugRagHitCount,
      debugFinalPromptExcerpt: result.debug_final_prompt_excerpt || source.debugFinalPromptExcerpt || '',
      modelName:
        result.model_name ||
        state.generateSettings.modelName ||
        state.generateSettings.engineVersion ||
        '',
    };
    const run: GenerationRun = {
      id: runId,
      index: runIndex,
      createdAt: new Date().toISOString(),
      assetIds: [refined.id],
    };
    dispatch({ type: 'APPEND_RUN_ASSETS', run, assets: [refined] });
    dispatch({ type: 'SET_CANVAS_RUN_FILTER', runId });
    dispatch({ type: 'CLEAR_REFINE_TARGET' });
    pushInfoToast(dispatch, 'success', '已完成微调并生成新图片');
    return true;
  } catch (error) {
    pushInfoToast(
      dispatch,
      'error',
      error instanceof Error ? error.message : '微调失败，请检查后端或网络状态',
    );
    dispatch({
      type: 'SET_GENERATING',
      value: false,
      error: error instanceof Error ? error.message : '微调失败',
    });
    return false;
  }
}

export async function finalizeAssetToLibrary(
  state: WorkspaceState,
  dispatch: Dispatch<WorkspaceAction>,
  assetId: string,
  options?: {
    silent?: boolean;
    suppressAlreadyToast?: boolean;
  },
) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return false;
  if (state.finalizing) return false;
  if (state.finalized.some((item) => item.assetId === assetId)) {
    if (!options?.suppressAlreadyToast) {
      pushInfoToast(dispatch, 'info', '这张图片已经入库');
    }
    return true;
  }

  dispatch({ type: 'CLEAR_FINALIZE_ERROR' });
  dispatch({ type: 'SET_FINALIZING', value: true, error: null });
  try {
    if (!asset.candidateId) {
      throw new Error('当前图片缺少候选记录 ID，请重新生成后再入库');
    }
    const item = await postJson<FinalizeApiRecord>(
      `/api/candidates/${asset.candidateId}/finalize`,
    );
    const record: FinalizedRecord = {
      materialId: item.material_id,
      assetId: asset.id,
      imageUrl: cozeUrlToImage(item.image_url),
      taskId: item.task_id || state.taskId,
      taskName: state.taskName,
      createdAt: item.created_at,
      market: item.market || asset.market || '',
      topic: item.topic || asset.topic || '',
      style: item.style || asset.style || '',
      scene: item.scene || asset.scene || '',
      productSubject: item.product_subject || asset.productSubject || '',
      finalPrompt: item.final_prompt || asset.finalPrompt || '',
      visualDna: item.visual_dna || asset.visualDna || '',
      deliveryStatus: '未投放',
      constraints: item.constraints || asset.constraints || [],
      negativeConstraints:
        item.negative_constraints || asset.negativeConstraints || [],
      outputGoal: item.output_goal || asset.outputGoal || '',
      platformPreset: item.platform || item.platform_preset || asset.platform || asset.platformPreset || '通用',
      trendUsed: item.trend_used ?? asset.trendUsed,
      trendSource: (item.trend_source as FinalizedRecord['trendSource']) || asset.trendSource || 'none',
      trendConflict: item.trend_conflict ?? asset.trendConflict,
      trendConflictReason: item.trend_conflict_reason || asset.trendConflictReason || '',
      trendRange: normalizeTrendRange(item.trend_range) || asset.trendRange,
      trendKeywords: item.trend_keywords || asset.trendKeywords || [],
      knowledgeUsed: item.platform_fit_notes || item.knowledge_used || asset.knowledgeUsed || '',
      referenceSummary: item.reference_summary || asset.referenceSummary || '',
      referenceHitCount: item.reference_hit_count || 0,
      referenceUsed: item.reference_used ?? asset.referenceUsed,
      referenceCount: item.reference_count ?? asset.referenceCount,
      referenceMode: (item.reference_mode as FinalizedRecord['referenceMode']) || asset.referenceMode,
      referenceWeight: item.reference_weight ?? asset.referenceWeight,
      debugReceivedFields: item.debug_received_fields || asset.debugReceivedFields || {},
      debugTrendUsed: item.debug_trend_used ?? asset.debugTrendUsed,
      debugRagHitCount: item.debug_rag_hit_count ?? asset.debugRagHitCount,
      debugFinalPromptExcerpt: item.debug_final_prompt_excerpt || asset.debugFinalPromptExcerpt || '',
      intentSource: item.intent_source || asset.intentSource || '',
      modelName: item.model_name || asset.modelName || '',
      parentMaterialId: item.parent_material_id || null,
      source: item.source || undefined,
      ingest: {
        at: item.created_at,
        workflowRunId: asset.runId,
        requestId: item.source_candidate_id,
        operator: '前端审核通过',
      },
    };
    appendFinalized(record);
    dispatch({ type: 'FINALIZE_SELECTED', record, silent: options?.silent });

    const task = loadTasks().find((item) => item.id === state.taskId);
    patchTask(state.taskId, {
      status: 'finalized',
      assetCount: (task?.assetCount ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    dispatch({
      type: 'SET_FINALIZING',
      value: false,
      error: error instanceof Error ? error.message : '入库失败',
    });
    return false;
  }
}
