import { parseIntent } from "./intentParser.js";
import { canUseCozeAgent, isForceAgentOnly, parseIntentByAgent } from "./cozeAgentClient.js";

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

function toIntentShape(payload, fallbackText) {
  const intentType = payload?.intent_type === "refine" ? "refine" : "create";
  return {
    intent_type: intentType,
    market: String(payload?.market || "未填"),
    topic: String(payload?.topic || "未填"),
    style: String(payload?.style || "通用商业风"),
    scene: String(payload?.scene || ""),
    product_subject: String(payload?.product_subject || ""),
    platform: String(payload?.platform || "通用"),
    constraints: Array.isArray(payload?.constraints)
      ? payload.constraints.map((item) => String(item))
      : [],
    negative_constraints: Array.isArray(payload?.negative_constraints)
      ? payload.negative_constraints.map((item) => String(item))
      : [],
    output_goal: String(payload?.output_goal || ""),
    normalized_user_intent: String(
      payload?.normalized_user_intent || fallbackText || "生成符合品牌风格的电商广告图",
    ),
  };
}

function pickIntentPayload(raw) {
  const root = raw?.data ?? raw?.output ?? raw?.result ?? raw;
  if (root && typeof root === "object" && !Array.isArray(root)) {
    if (
      root.intent_type ||
      root.market ||
      root.topic ||
      root.style ||
      root.scene ||
      root.product_subject ||
      root.platform
    ) {
      return root;
    }
    if (typeof root.data === "object" && root.data) return root.data;
    if (typeof root.output === "object" && root.output) return root.output;
  }
  if (typeof root === "string") {
    const parsed = tryParseJson(root);
    if (parsed && typeof parsed === "object") return parsed;
  }
  if (typeof raw?.data === "string") {
    const parsed = tryParseJson(raw.data);
    if (parsed && typeof parsed === "object") return parsed;
  }
  return null;
}

async function callCozeWorkflow(parameters, workflowId, config) {
  const url = `${config.baseUrl.replace(/\/$/, "")}/v1/workflow/run`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({
      workflow_id: workflowId,
      parameters,
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = json?.msg || json?.message || `Coze API failed: ${resp.status}`;
    throw new Error(message);
  }
  return json;
}

export async function parseIntentPreferCoze(text) {
  if (canUseCozeAgent()) {
    try {
      const data = await parseIntentByAgent(text);
      return { source: "coze_agent", data };
    } catch (error) {
      if (isForceAgentOnly()) {
        throw new Error(
          `Agent 意图解析失败（已启用 COZE_FORCE_AGENT_ONLY）：${error?.message || "unknown error"}`,
        );
      }
      // Agent 失败后继续按 workflow -> local 的老链路兜底
    }
  }

  const config = {
    token: normalizeEnvValue(process.env.COZE_API_TOKEN),
    baseUrl: normalizeEnvValue(process.env.COZE_API_BASE_URL) || "https://api.coze.cn",
    // 推荐单独配置意图工作流；未配置时才回落到主工作流
    intentWorkflowId:
      normalizeEnvValue(process.env.COZE_PARSE_WORKFLOW_ID) ||
      normalizeEnvValue(process.env.COZE_INTENT_WORKFLOW_ID) ||
      normalizeEnvValue(process.env.COZE_WORKFLOW_ID),
  };

  if (!config.token || !config.intentWorkflowId) {
    return { source: "local_fallback", data: parseIntent(text) };
  }

  try {
    const raw = await callCozeWorkflow(
      {
        user_intent: text,
        text,
      },
      config.intentWorkflowId,
      config,
    );
    const payload = pickIntentPayload(raw);
    if (!payload) {
      throw new Error("Coze 意图解析返回为空");
    }
    return { source: "coze", data: toIntentShape(payload, text) };
  } catch (error) {
    throw new Error(`Coze 意图工作流调用失败：${error?.message || "unknown error"}`);
  }
}
