import type { IntentBrief } from '../types';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  'http://localhost:8787';

export interface IntentParseResponse {
  ok?: boolean;
  source?: string;
  message?: string;
  data?: {
    intent_type?: 'create' | 'refine' | string;
    market?: string;
    topic?: string;
    style?: string;
    scene?: string;
    product_subject?: string;
    constraints?: string[] | string;
    negative_constraints?: string[] | string;
    output_goal?: string;
    platform?: string;
    normalized_user_intent?: string;
    market_trend?: string;
    uploaded_context?: string;
    output?: string;
  };
}

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function normalizeIntentPayload(json: IntentParseResponse): IntentBrief {
  const raw: NonNullable<IntentParseResponse['data']> = json.data ?? {};
  const base = {
    intentType: raw.intent_type === 'refine' ? 'refine' : 'create',
    market: raw.market?.trim() || '未填',
    topic: raw.topic?.trim() || '未填',
    style: raw.style?.trim() || '未填',
    scene: raw.scene?.trim() || '',
    productSubject: raw.product_subject?.trim() || '',
    platform: raw.platform?.trim() || '',
    constraints: normalizeList(raw.constraints),
    negativeConstraints: normalizeList(raw.negative_constraints),
    outputGoal: raw.output_goal?.trim() || '',
    normalizedUserIntent: raw.normalized_user_intent?.trim() || '',
    marketTrend: normalizeText(raw.market_trend),
    uploadedContext: normalizeText(raw.uploaded_context),
    source: json.source,
  } satisfies IntentBrief;
  if (raw.output && typeof raw.output === 'string') {
    try {
      const parsed = JSON.parse(raw.output) as {
        market?: string;
        topic?: string;
        style?: string;
        scene?: string;
        product_subject?: string;
        constraints?: string[] | string;
        negative_constraints?: string[] | string;
        output_goal?: string;
        platform?: string;
        normalized_user_intent?: string;
        market_trend?: string;
        uploaded_context?: string;
        intent_type?: string;
      };
      return {
        intentType: parsed.intent_type === 'refine' ? 'refine' : base.intentType,
        market: parsed.market?.trim() || base.market,
        topic: parsed.topic?.trim() || base.topic,
        style: parsed.style?.trim() || base.style,
        scene: parsed.scene?.trim() || base.scene,
        productSubject: parsed.product_subject?.trim() || base.productSubject,
        platform: parsed.platform?.trim() || base.platform,
        constraints: normalizeList(parsed.constraints).length
          ? normalizeList(parsed.constraints)
          : base.constraints,
        negativeConstraints: normalizeList(parsed.negative_constraints).length
          ? normalizeList(parsed.negative_constraints)
          : base.negativeConstraints,
        outputGoal: parsed.output_goal?.trim() || base.outputGoal,
        normalizedUserIntent:
          parsed.normalized_user_intent?.trim() || base.normalizedUserIntent,
        marketTrend: normalizeText(parsed.market_trend) || base.marketTrend,
        uploadedContext: normalizeText(parsed.uploaded_context) || base.uploadedContext,
        source: json.source,
      };
    } catch {
      // 忽略 output 的 JSON 解析失败，继续走扁平字段兜底
    }
  }
  return base;
}

export function buildBriefChips(brief: IntentBrief) {
  const rows = [
    `市场:${brief.market || '未填'}`,
    `主题:${brief.topic || '未填'}`,
    `风格:${brief.style || '未填'}`,
    `场景:${brief.scene || '未填'}`,
    `主体:${brief.productSubject || '未填'}`,
    `平台:${brief.platform || '通用'}`,
  ];
  return rows;
}

export function shouldRequireSummary(text: string, brief: IntentBrief) {
  const essentialMissing =
    !brief.market ||
    brief.market === '未填' ||
    !brief.topic ||
    brief.topic === '未填';
  const detailScore =
    Number(Boolean(brief.style && brief.style !== '未填')) +
    Number(Boolean(brief.scene)) +
    Number(Boolean(brief.productSubject)) +
    Number(Boolean(brief.platform));
  const normalizedText = text.trim();
  if (brief.intentType === 'refine') return false;
  if (essentialMissing) return true;
  if (detailScore >= 3) return false;
  return normalizedText.length < 20;
}

export async function requestIntentParse(text: string) {
  const resp = await fetch(`${API_BASE}/api/intent/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const json = (await resp.json().catch(() => ({}))) as IntentParseResponse;
  if (!resp.ok || !json.ok || !json.data) {
    throw new Error(json.message || '意图解析失败，请检查 Coze 配置');
  }
  const brief = normalizeIntentPayload(json);
  return {
    brief: {
      ...brief,
      normalizedUserIntent: brief.normalizedUserIntent || text.trim(),
      summaryRequired: shouldRequireSummary(text, brief),
      marketTrend: normalizeText(brief.marketTrend || ""),
      uploadedContext: normalizeText(brief.uploadedContext || ""),
    } satisfies IntentBrief,
    chips: buildBriefChips({
      ...brief,
      normalizedUserIntent: brief.normalizedUserIntent || text.trim(),
      summaryRequired: shouldRequireSummary(text, brief),
      marketTrend: normalizeText(brief.marketTrend || ""),
      uploadedContext: normalizeText(brief.uploadedContext || ""),
    }),
    source: json.source || '',
  };
}

export async function requestIntentSummaryChips(text: string) {
  const parsed = await requestIntentParse(text);
  return parsed.chips;
}
