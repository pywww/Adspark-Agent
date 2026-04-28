import { getFallbackHistoryPrompt } from "./promptSanitizer.js";

function isLikelyIllegalContentError(message = "") {
  const text = String(message);
  return (
    text.includes("不合法") ||
    text.includes("非法") ||
    text.includes("invalid") ||
    text.includes("illegal")
  );
}

function buildMockResponse(input) {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const generationMode = input.is_refine ? "refine" : "create";
  return {
    image_url: `https://picsum.photos/seed/${seed}/768/768`,
    final_prompt: input.is_refine
      ? `refined prompt based on: ${input.user_intent || "no intent"}`
      : `base prompt for ${input.market || "market"} / ${input.topic || "topic"}`,
    visual_dna: input.is_refine ? "微调后保持主体风格，强化用户修改点" : "初次生成的视觉摘要",
    seed: String(seed),
    generation_mode: generationMode,
    model_name: String(input.model_name || "mock-image-model"),
    knowledge_used: input.trend_reference_enabled
      ? `参考品牌规则、历史样本和${input.trend_reference_range || "30d"}趋势`
      : "参考品牌规则和历史样本",
    trend_keywords: input.trend_reference_enabled ? ["市场趋势", "高点击素材"] : [],
    trend_source: input.trend_reference_enabled ? "live" : "none",
    trend_conflict: false,
    trend_conflict_reason: "",
    platform_fit_notes: input.platform_preset
      ? `已按${input.platform_preset}平台预设收敛画面与文案语气`
      : "",
    reference_summary: input.trend_reference_enabled ? "参考了品牌规则、历史样本与趋势线索" : "参考了品牌规则与历史样本",
    reference_hit_count: input.trend_reference_enabled ? 2 : 1,
    reference_used: Array.isArray(input.reference_images) && input.reference_images.length > 0,
    reference_count: Array.isArray(input.reference_images) ? input.reference_images.length : 0,
    reference_mode: input.reference_mode || "structure",
    reference_weight: Number(input.reference_weight || 0.6),
    trend_latency_ms: input.trend_reference_enabled ? 420 : 0,
    trend_degraded_reason: "",
    parent_material_id: input.history_material_id || null,
    raw: { mock: true },
  };
}

async function callCozeAPI(input, config) {
  const url = `${config.baseUrl.replace(/\/$/, "")}/v1/workflow/run`;
  const body = {
    workflow_id: config.workflowId,
    parameters: input,
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = json?.msg || json?.message || `Coze API failed: ${resp.status}`;
    const err = new Error(message);
    err.payload = json;
    throw err;
  }
  // Coze 可能返回 HTTP 200 但业务 code 非 0（例如 4000 参数错误）
  if (typeof json?.code === "number" && json.code !== 0) {
    const message =
      json?.msg ||
      json?.message ||
      `Coze workflow returned business error code=${json.code}`;
    const err = new Error(message);
    err.payload = json;
    throw err;
  }
  return json;
}

function tryParseJson(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function pickImageUrl(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.image_url === "string" && payload.image_url) return payload.image_url;
  if (typeof payload.imageUrl === "string" && payload.imageUrl) return payload.imageUrl;
  if (typeof payload.url === "string" && payload.url) return payload.url;
  if (typeof payload.data === "string" && /^https?:\/\//.test(payload.data)) return payload.data;
  if (payload?.data?.image_url && typeof payload.data.image_url === "string") return payload.data.image_url;
  if (payload?.data?.url && typeof payload.data.url === "string") return payload.data.url;
  if (payload?.output?.image_url && typeof payload.output.image_url === "string") return payload.output.image_url;
  if (payload?.output?.url && typeof payload.output.url === "string") return payload.output.url;
  if (Array.isArray(payload.images) && payload.images.length) {
    const first = payload.images.find((item) => typeof item === "string" && /^https?:\/\//.test(item));
    if (first) return first;
    const obj = payload.images.find(
      (item) =>
        item &&
        typeof item === "object" &&
        (typeof item.url === "string" || typeof item.image_url === "string"),
    );
    if (obj?.url) return obj.url;
    if (obj?.image_url) return obj.image_url;
  }
  if (Array.isArray(payload.output) && payload.output.length) {
    const first = payload.output.find((item) => typeof item === "string" && /^https?:\/\//.test(item));
    if (first) return first;
    const obj = payload.output.find(
      (item) =>
        item &&
        typeof item === "object" &&
        (typeof item.url === "string" || typeof item.image_url === "string"),
    );
    if (obj?.url) return obj.url;
    if (obj?.image_url) return obj.image_url;
  }
  // 兜底：在对象里做一次浅层扫描，捕获常见字段（避免因工作流包装层级变化漏掉图片地址）
  for (const key of Object.keys(payload)) {
    const value = payload[key];
    if (!value) continue;
    if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
    if (Array.isArray(value)) {
      const inArray = value.find((item) => typeof item === "string" && /^https?:\/\//.test(item));
      if (inArray) return inArray;
      const inArrayObj = value.find(
        (item) =>
          item &&
          typeof item === "object" &&
          (typeof item.url === "string" || typeof item.image_url === "string"),
      );
      if (inArrayObj?.url) return inArrayObj.url;
      if (inArrayObj?.image_url) return inArrayObj.image_url;
    }
    if (typeof value === "object") {
      if (typeof value.url === "string" && /^https?:\/\//.test(value.url)) return value.url;
      if (typeof value.image_url === "string" && /^https?:\/\//.test(value.image_url)) return value.image_url;
    }
  }
  return "";
}

function extractImageUrlFromText(text) {
  if (!text || typeof text !== "string") return "";
  const markdownMatch = text.match(/\!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch?.[1]) return markdownMatch[1];
  const directMatch = text.match(/https?:\/\/[^\s"'<>]+?\.(png|jpe?g|webp|gif)(\?[^\s"'<>]*)?/i);
  if (directMatch?.[0]) return directMatch[0];
  const cdnMatch = text.match(/https?:\/\/[^\s"'<>]*coze[^\s"'<>]*/i);
  if (cdnMatch?.[0]) return cdnMatch[0];
  return "";
}

function normalizeCozeResult(raw, input) {
  // Coze 常见返回：raw.data 可能是对象，也可能是被 JSON 字符串包裹的对象。
  const rootData = raw?.data ?? raw?.output ?? raw?.result ?? {};
  const parsedRootData =
    typeof rootData === "string" ? tryParseJson(rootData) ?? { data: rootData } : rootData;
  const nestedData =
    typeof parsedRootData?.data === "string"
      ? tryParseJson(parsedRootData.data) ?? { data: parsedRootData.data }
      : parsedRootData?.data ?? null;

  const imageUrl = pickImageUrl(parsedRootData) || pickImageUrl(nestedData);
  const fallbackImageUrl =
    extractImageUrlFromText(String(parsedRootData?.data || "")) ||
    extractImageUrlFromText(String(parsedRootData?.msg || "")) ||
    extractImageUrlFromText(String(parsedRootData?.message || "")) ||
    extractImageUrlFromText(String(parsedRootData?.output_text || "")) ||
    extractImageUrlFromText(String(parsedRootData?.output || "")) ||
    extractImageUrlFromText(String(nestedData?.msg || "")) ||
    extractImageUrlFromText(String(nestedData?.message || "")) ||
    extractImageUrlFromText(String(nestedData?.output_text || "")) ||
    extractImageUrlFromText(String(raw?.data?.output || "")) ||
    extractImageUrlFromText(String(raw?.data?.messages?.[0]?.content || ""));
  const finalPrompt =
    parsedRootData?.final_prompt ||
    parsedRootData?.finalPrompt ||
    parsedRootData?.prompt ||
    input.history_prompt ||
    "";
  const visualDna =
    parsedRootData?.visual_dna ||
    parsedRootData?.visualDna ||
    parsedRootData?.msg ||
    nestedData?.msg ||
    "";
  const seed = parsedRootData?.seed || parsedRootData?.random_seed || nestedData?.seed || "";
  return {
    image_url: imageUrl || fallbackImageUrl,
    final_prompt: String(finalPrompt || ""),
    visual_dna: String(visualDna || ""),
    seed: String(seed || ""),
    generation_mode: input.is_refine ? "refine" : "create",
    model_name: String(parsedRootData?.model_name || nestedData?.model_name || input.model_name || ""),
    knowledge_used: String(
      parsedRootData?.knowledge_used || nestedData?.knowledge_used || "",
    ),
    trend_keywords: Array.isArray(parsedRootData?.trend_keywords)
      ? parsedRootData.trend_keywords.map((item) => String(item))
      : Array.isArray(nestedData?.trend_keywords)
        ? nestedData.trend_keywords.map((item) => String(item))
        : [],
    trend_source: String(parsedRootData?.trend_source || nestedData?.trend_source || (input.trend_reference_enabled ? "live" : "none")),
    trend_conflict: Boolean(parsedRootData?.trend_conflict || nestedData?.trend_conflict),
    trend_conflict_reason: String(parsedRootData?.trend_conflict_reason || nestedData?.trend_conflict_reason || ""),
    platform_fit_notes: String(parsedRootData?.platform_fit_notes || nestedData?.platform_fit_notes || ""),
    reference_summary: String(parsedRootData?.reference_summary || nestedData?.reference_summary || ""),
    reference_hit_count: Number(parsedRootData?.reference_hit_count || nestedData?.reference_hit_count || 0),
    reference_used: Boolean(parsedRootData?.reference_used || nestedData?.reference_used),
    reference_count: Number(parsedRootData?.reference_count || nestedData?.reference_count || 0),
    reference_mode: String(parsedRootData?.reference_mode || nestedData?.reference_mode || input.reference_mode || "structure"),
    reference_weight: Number(parsedRootData?.reference_weight || nestedData?.reference_weight || input.reference_weight || 0.6),
    trend_latency_ms: Number(parsedRootData?.trend_latency_ms || nestedData?.trend_latency_ms || 0),
    trend_degraded_reason: String(parsedRootData?.trend_degraded_reason || nestedData?.trend_degraded_reason || ""),
    parent_material_id: input.history_material_id || null,
    raw,
  };
}

export async function runGenerationWithFallback(input) {
  const normalizeEnvValue = (value) =>
    String(value || "")
      .trim()
      .replace(/^['"]+|['"]+$/g, "");

  const config = {
    token: normalizeEnvValue(process.env.COZE_API_TOKEN),
    workflowId: normalizeEnvValue(process.env.COZE_WORKFLOW_ID),
    baseUrl: normalizeEnvValue(process.env.COZE_API_BASE_URL) || "https://api.coze.cn",
  };

  // 未配置 Coze 时返回 Mock，便于先联调前后端流程。
  if (!config.token || !config.workflowId) {
    return buildMockResponse(input);
  }

  try {
    const raw = await callCozeAPI(input, config);
    return normalizeCozeResult(raw, input);
  } catch (error) {
    if (!isLikelyIllegalContentError(error?.message || "")) {
      throw error;
    }
    // 兜底重试：把历史提示词替换为最短安全文案，避免卡死工作流。
    const retriedInput = {
      ...input,
      history_prompt: getFallbackHistoryPrompt(),
    };
    const raw = await callCozeAPI(retriedInput, config);
    return normalizeCozeResult(raw, retriedInput);
  }
}
