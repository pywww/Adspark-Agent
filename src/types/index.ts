/** 与设计文档《待确认》对齐的领域类型 */

export type ChatRole = 'user' | 'assistant';

export type TaskStatus = 'draft' | 'in_progress' | 'finalized';

export type IntentType = 'create' | 'refine';

export interface IntentBrief {
  intentType: IntentType;
  market: string;
  topic: string;
  style: string;
  scene: string;
  productSubject: string;
  platform: string;
  constraints: string[];
  negativeConstraints: string[];
  outputGoal: string;
  normalizedUserIntent: string;
  marketTrend?: string;
  uploadedContext?: string;
  source?: string;
  summaryRequired?: boolean;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  kind?: 'summary' | 'thinking';
  snapshotId?: string;
  referenceImages?: ReferenceImage[];
}

export interface ReferenceImage {
  id: string;
  name: string;
  url: string;
  /** 发送到后端/Coze 的公网 URL；为空则回退 url */
  transportUrl?: string;
}

export interface SummarySnapshot {
  id: string;
  version: number;
  title: string;
  chips: string[];
  createdAt: string;
  brief?: IntentBrief;
  required?: boolean;
}

export interface GeneratedAsset {
  id: string;
  /** 后端候选记录 ID（用于 finalize 入库） */
  candidateId?: string;
  runId: string;
  imageUrl: string;
  /** 微调生成时，记录来源图片 */
  refinedFromAssetId?: string;
  /** 记录后端返回的业务字段，便于后续继续微调 */
  finalPrompt?: string;
  visualDna?: string;
  seed?: string;
  parentCandidateId?: string;
  /** 画布内位置（用于自由拖拽） */
  canvasX: number;
  canvasY: number;
  /** 单张图片缩放比例 */
  canvasScale: number;
  /** 拖拽层级，后拖动的图应浮到最上层 */
  canvasZ: number;
  starred: boolean;
  rejected: boolean;
  note: string;
  /** 单卡生成失败时可重试（文档 §3.2） */
  failed?: boolean;
  market?: string;
  topic?: string;
  style?: string;
  scene?: string;
  productSubject?: string;
  /** 摘要卡确认的平台（与后端 platform 一致） */
  platform?: string;
  constraints?: string[];
  negativeConstraints?: string[];
  outputGoal?: string;
  intentSource?: string;
  trendUsed?: boolean;
  trendRange?: TrendReferenceRange;
  trendKeywords?: string[];
  knowledgeUsed?: string;
  modelName?: string;
  trendSource?: 'live' | 'cache' | 'none' | 'circuit_open';
  trendConflict?: boolean;
  trendConflictReason?: string;
  /** 展示用，与 platform 同源（历史字段名） */
  platformPreset?: string;
  referenceSummary?: string;
  referenceUsed?: boolean;
  referenceCount?: number;
  referenceMode?: 'style' | 'structure';
  referenceWeight?: number;
  debugReceivedFields?: Record<string, unknown>;
  debugTrendUsed?: boolean;
  debugRagHitCount?: number;
  debugFinalPromptExcerpt?: string;
}

export interface GenerationRun {
  id: string;
  index: number;
  createdAt: string;
  assetIds: string[];
}

/** 入库流水（只读展示，BFF 对齐后填真实值） */
export interface FinalizedIngestMeta {
  at: string;
  workflowRunId?: string;
  requestId?: string;
  operator?: string;
}

/** 资产库可编辑业务字段 */
export interface FinalizedBusinessMeta {
  tags?: string[];
  campaignId?: string;
  notes?: string;
  starred?: boolean;
  /** 人工标为高表现，与 CTR 达标任一满足即高亮 */
  markAsHigh?: boolean;
  /** 人工投放链路状态（支持未投放素材沉淀） */
  deliveryStatus?:
    | '未投放'
    | '待投放'
    | '投放中'
    | '已投放'
    | '已下线'
    | '投放失败';
  /** 实际投放平台（可多选时先用逗号存储） */
  deliveryPlatform?: string;
  /** 投放日期（YYYY-MM-DD） */
  deliveryDate?: string;
  /** 曝光率（0~1） */
  exposureRate?: number;
  /** 转化率（0~1） */
  conversionRate?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
}

export interface FinalizedRecord {
  materialId: string;
  assetId: string;
  imageUrl: string;
  taskId: string;
  taskName?: string;
  createdAt: string;
  market?: string;
  topic?: string;
  finalPrompt?: string;
  visualDna?: string;
  deliveryStatus?: string;
  /** P2：CTR 0~1 */
  ctr?: number;
  style?: string;
  scene?: string;
  productSubject?: string;
  constraints?: string[];
  negativeConstraints?: string[];
  outputGoal?: string;
  trendUsed?: boolean;
  trendRange?: TrendReferenceRange;
  trendKeywords?: string[];
  knowledgeUsed?: string;
  intentSource?: string;
  modelName?: string;
  trendSource?: 'live' | 'cache' | 'none' | 'circuit_open';
  trendConflict?: boolean;
  trendConflictReason?: string;
  platformPreset?: string;
  referenceSummary?: string;
  referenceHitCount?: number;
  referenceUsed?: boolean;
  referenceCount?: number;
  referenceMode?: 'style' | 'structure';
  referenceWeight?: number;
  debugReceivedFields?: Record<string, unknown>;
  debugTrendUsed?: boolean;
  debugRagHitCount?: number;
  debugFinalPromptExcerpt?: string;
  lastReferencedAt?: string;
  parentMaterialId?: string | null;
  source?: string;
  ingest?: FinalizedIngestMeta;
  business?: FinalizedBusinessMeta;
}

/** 爆款案例参考时间范围（数据参考） */
export type TrendReferenceRange = '3d' | '7d' | '15d' | '30d';

export interface GenerateSettings {
  count: number;
  ratio: string;
  strength: number;
  refWeight: number;
  modelName?: string;
  /** Mock：生图引擎版本（偏好卡片 / L2 展示） */
  engineVersion?: string;
  /** Mock：画质档位（偏好卡片） */
  qualityPreset?: string;
  /** 是否参考历史高点击、高转化爆款案例图（Mock） */
  trendReferenceEnabled?: boolean;
  /** 是否参考历史爆款样本（Mock） */
  hotSampleReferenceEnabled?: boolean;
  /** 爆款案例回溯范围 */
  trendReferenceRange?: TrendReferenceRange;
  /** 生成探索策略：稳定单一 / 多风格 / 多场景（与摘要 6 点共同进入首次生图） */
  exploreMode?: 'single' | 'multi_style' | 'multi_scene';
}

export interface TaskMeta {
  id: string;
  name: string;
  updatedAt: string;
  status: TaskStatus;
  /** 已定稿入库条数（展示用） */
  assetCount: number;
}
