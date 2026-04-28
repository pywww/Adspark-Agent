const FALLBACK_HISTORY_PROMPT =
  "single product ad image, clean background, balanced lighting, product as focal point";

/**
 * 清洗历史提示词，避免 Coze 判定“节点包含不合法内容”。
 * 规则：
 * 1) 去掉代码块和控制字符
 * 2) 全角标点转半角
 * 3) 仅保留常用英文文本字符
 * 4) 压缩空白并截断到上限
 * 5) 清洗后为空则回退默认文案
 */
export function sanitizeHistoryPrompt(input, maxLength = 1000) {
  if (!input || typeof input !== "string") {
    return FALLBACK_HISTORY_PROMPT;
  }

  let text = input;

  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/```/g, " ");
  text = text.replace(/[\u0000-\u001F\u007F]/g, " ");

  const fullToHalfMap = {
    "，": ",",
    "。": ".",
    "：": ":",
    "；": ";",
    "！": "!",
    "？": "?",
    "（": "(",
    "）": ")",
    "【": "[",
    "】": "]",
    "“": '"',
    "”": '"',
    "‘": "'",
    "’": "'",
  };
  text = text.replace(/[，。：；！？（）【】“”‘’]/g, (ch) => fullToHalfMap[ch] || " ");

  text = text.replace(/[^a-zA-Z0-9\s,.;:!?'"()\-[\]/]/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  if (text.length > maxLength) {
    text = text.slice(0, maxLength).trim();
  }

  if (!text) {
    return FALLBACK_HISTORY_PROMPT;
  }
  return text;
}

export function getFallbackHistoryPrompt() {
  return FALLBACK_HISTORY_PROMPT;
}
