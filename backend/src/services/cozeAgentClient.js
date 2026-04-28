function normalizeEnvValue(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
}

function tryParseJson(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getConfig() {
  return {
    token: normalizeEnvValue(process.env.COZE_API_TOKEN),
    baseUrl: normalizeEnvValue(process.env.COZE_API_BASE_URL) || "https://api.coze.cn",
    botId: normalizeEnvValue(process.env.COZE_BOT_ID),
    userId: normalizeEnvValue(process.env.COZE_USER_ID) || `local-${Date.now()}`,
    forceAgentOnly: normalizeEnvValue(process.env.COZE_FORCE_AGENT_ONLY) === "true",
  };
}

function extractTextFromMessages(raw) {
  const messages = raw?.data?.messages || raw?.messages || [];
  for (const msg of messages) {
    if (msg?.type === "answer" || msg?.role === "assistant") {
      const content = msg?.content || msg?.text || "";
      if (typeof content === "string" && content.trim()) return content.trim();
    }
  }
  return "";
}

async function callAgentChat(content, config) {
  const url = `${config.baseUrl.replace(/\/$/, "")}/v3/chat`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({
      bot_id: config.botId,
      user_id: config.userId,
      stream: false,
      additional_messages: [
        {
          role: "user",
          content,
          content_type: "text",
        },
      ],
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = json?.msg || json?.message || `Coze Agent failed: ${resp.status}`;
    throw new Error(message);
  }
  return json;
}

export function canUseCozeAgent() {
  const config = getConfig();
  return Boolean(config.token && config.botId);
}

export function isForceAgentOnly() {
  const config = getConfig();
  return Boolean(config.forceAgentOnly);
}

export async function runAgentTextCompletion(prompt) {
  const config = getConfig();
  if (!config.token || !config.botId) {
    throw new Error("COZE_BOT_ID 未配置，无法调用 Agent");
  }
  const raw = await callAgentChat(prompt, config);
  const directText =
    raw?.data?.output_text || raw?.data?.answer || raw?.output_text || raw?.answer || "";
  const messageText = extractTextFromMessages(raw);
  const text = String(directText || messageText || "").trim();
  if (!text) {
    throw new Error("Agent 返回为空");
  }
  return text;
}

export async function parseIntentByAgent(userText) {
  const prompt = [
    "你是电商广告 Agent 的意图解析器。只返回 JSON，不要解释。",
    "字段：intent_type(create|refine), market, topic, style, scene, product_subject, platform, constraints(数组), negative_constraints(数组), output_goal, normalized_user_intent。",
    "如果字段缺失，请用默认值：market=未填, topic=未填, style=通用商业风, scene='', product_subject='', platform='通用', constraints=[], negative_constraints=[], output_goal=''.",
    `用户输入：${userText}`,
  ].join("\n");
  const text = await runAgentTextCompletion(prompt);
  const parsed = tryParseJson(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Agent 意图解析未返回 JSON");
  }
  return {
    intent_type: parsed.intent_type === "refine" ? "refine" : "create",
    market: String(parsed.market || "未填"),
    topic: String(parsed.topic || "未填"),
    style: String(parsed.style || "通用商业风"),
    scene: String(parsed.scene || ""),
    product_subject: String(parsed.product_subject || ""),
    platform: String(parsed.platform || "通用"),
    constraints: Array.isArray(parsed.constraints)
      ? parsed.constraints.map((item) => String(item))
      : [],
    negative_constraints: Array.isArray(parsed.negative_constraints)
      ? parsed.negative_constraints.map((item) => String(item))
      : [],
    output_goal: String(parsed.output_goal || ""),
    normalized_user_intent: String(
      parsed.normalized_user_intent || userText || "生成符合品牌风格的电商广告图",
    ),
  };
}

export async function generateByAgent(input) {
  const mode = input?.is_refine ? "refine" : "create";
  const prompt = [
    "你是广告图生成 Agent。",
    "你必须遵守优先级：image_anchor_rules > brand_sop > user_intent > best_practice > market_trend。",
    "market_trend 是弱约束参考，冲突时不得覆盖品牌和产品硬约束。",
    "请根据输入返回 JSON：image_url, final_prompt, visual_dna, seed, generation_mode, model_name, knowledge_used, trend_keywords, trend_source, trend_conflict, trend_conflict_reason, platform_fit_notes, reference_summary, reference_hit_count, reference_used, reference_count, reference_mode, reference_weight。",
    "其中 generation_mode 只能是 create 或 refine。",
    "如果你无法真实返回 image_url，请返回空字符串。不得返回额外解释。",
    `输入JSON：${JSON.stringify(input)}`,
  ].join("\n");
  const text = await runAgentTextCompletion(prompt);
  const parsed = tryParseJson(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Agent 生成未返回 JSON");
  }
  return {
    image_url: String(parsed.image_url || ""),
    final_prompt: String(parsed.final_prompt || ""),
    visual_dna: String(parsed.visual_dna || ""),
    seed: String(parsed.seed || ""),
    generation_mode: mode,
    model_name: String(parsed.model_name || input?.model_name || ""),
    knowledge_used: String(parsed.knowledge_used || ""),
    trend_keywords: Array.isArray(parsed.trend_keywords)
      ? parsed.trend_keywords.map((item) => String(item))
      : [],
    trend_source: String(parsed.trend_source || (input?.trend_reference_enabled ? "live" : "none")),
    trend_conflict: Boolean(parsed.trend_conflict),
    trend_conflict_reason: String(parsed.trend_conflict_reason || ""),
    platform_fit_notes: String(parsed.platform_fit_notes || ""),
    reference_summary: String(parsed.reference_summary || ""),
    reference_hit_count: Number(parsed.reference_hit_count || 0),
    reference_used: Boolean(parsed.reference_used),
    reference_count: Number(parsed.reference_count || 0),
    reference_mode: String(parsed.reference_mode || input?.reference_mode || "structure"),
    reference_weight: Number(parsed.reference_weight || input?.reference_weight || 0.6),
    parent_material_id: input?.history_material_id || null,
    raw: { source: "agent" },
  };
}
