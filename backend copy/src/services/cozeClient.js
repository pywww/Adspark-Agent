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
  return json;
}

function normalizeCozeResult(raw, input) {
  const data = raw?.data || raw?.output || raw?.result || {};
  const imageUrl = data.image_url || data.imageUrl || data.url || "";
  const finalPrompt =
    data.final_prompt || data.finalPrompt || data.prompt || input.history_prompt || "";
  const visualDna = data.visual_dna || data.visualDna || data.msg || "";
  const seed = data.seed || data.random_seed || "";
  return {
    image_url: imageUrl,
    final_prompt: String(finalPrompt || ""),
    visual_dna: String(visualDna || ""),
    seed: String(seed || ""),
    generation_mode: input.is_refine ? "refine" : "create",
    parent_material_id: input.history_material_id || null,
    raw,
  };
}

export async function runGenerationWithFallback(input) {
  const config = {
    token: process.env.COZE_API_TOKEN || "",
    workflowId: process.env.COZE_WORKFLOW_ID || "",
    baseUrl: process.env.COZE_API_BASE_URL || "https://api.coze.cn",
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
