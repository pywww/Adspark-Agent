const MARKET_PATTERNS = [
  { key: "韩国", tests: [/韩国|kr|korea/i] },
  { key: "日本", tests: [/日本|jp|japan/i] },
  { key: "北美", tests: [/北美|美国|加拿大|na|us|usa|canada/i] },
  { key: "东南亚", tests: [/东南亚|sea|新加坡|马来西亚|泰国|越南|印尼/i] },
  { key: "欧洲", tests: [/欧洲|eu|德国|法国|英国|意大利|西班牙/i] },
];

const TOPIC_PATTERNS = [
  { key: "冥想垫", tests: [/冥想垫|坐垫|meditation|cushion/i] },
  { key: "助眠", tests: [/助眠|睡眠|失眠|sleep/i] },
  { key: "香薰", tests: [/香薰|aroma/i] },
];

const RATIO_PATTERNS = [
  { key: "1:1", tests: [/1[:：]1|方图|正方形/i] },
  { key: "4:5", tests: [/4[:：]5|竖图|竖版/i] },
  { key: "16:9", tests: [/16[:：]9|横图|横版/i] },
];

const STYLE_PATTERNS = [
  { key: "治愈自然风", tests: [/治愈|自然风|温柔|柔和/i] },
  { key: "极简科技风", tests: [/极简|科技风|现代感|高级感/i] },
];

function inferOverseasMarket(text) {
  const matched = text.match(/出海(?:到|去)?([\u4e00-\u9fa5]{2,6})/);
  if (!matched?.[1]) return "";
  const region = matched[1];
  const common = ["韩国", "日本", "美国", "英国", "德国", "法国", "东南亚", "欧洲", "北美"];
  return common.includes(region) ? region : "";
}

function pickFirst(text, patterns, fallback = "") {
  for (const item of patterns) {
    if (item.tests.some((rule) => rule.test(text))) return item.key;
  }
  return fallback;
}

function extractConstraints(text) {
  const rules = [
    { label: "去除 logo", tests: [/去掉?.{0,4}logo|移除.{0,4}logo|去logo/i] },
    { label: "背景更简洁", tests: [/背景更简洁|背景干净|简化背景/i] },
    { label: "主体居中", tests: [/主体居中|居中显示|更居中/i] },
  ];
  const hit = rules.filter((item) => item.tests.some((r) => r.test(text))).map((i) => i.label);
  return [...new Set(hit)];
}

function inferScene(text) {
  if (/室内|客厅|卧室|房间|室内的场景/i.test(text)) return "室内场景";
  if (/室外|户外|草地|庭院|露台|海边/i.test(text)) return "室外场景";
  return "";
}

function inferProductSubject(text) {
  if (/瑜伽垫/i.test(text)) return "瑜伽垫";
  if (/冥想垫|坐垫/i.test(text)) return "冥想垫";
  return "";
}

function extractNegativeConstraints(text) {
  const rules = [
    { label: "避免人物", tests: [/不要人物|无人|避免人物|不要出现人/i] },
    { label: "避免文字", tests: [/不要文字|无文字|不要文案|避免文字/i] },
    { label: "避免杂乱背景", tests: [/背景不要复杂|避免杂乱|不要杂乱背景/i] },
  ];
  return rules
    .filter((item) => item.tests.some((r) => r.test(text)))
    .map((item) => item.label);
}

function inferOutputGoal(text) {
  if (/tiktok|短视频封面|封面图/i.test(text)) return "短视频封面";
  if (/海报|广告图|主图/i.test(text)) return "广告海报";
  return "";
}

function inferPlatform(text) {
  if (/抖音|douyin|tiktok/i.test(text)) return "抖音";
  if (/facebook|fb|meta/i.test(text)) return "Facebook";
  if (/小红书|xhs|rednote/i.test(text)) return "小红书";
  return "通用";
}

export function parseIntent(userText = "") {
  const text = String(userText || "").trim();
  const market = pickFirst(text, MARKET_PATTERNS, inferOverseasMarket(text) || "未填");
  const topic = pickFirst(text, TOPIC_PATTERNS, "未填");
  const ratio = pickFirst(text, RATIO_PATTERNS, "智能");
  const style = pickFirst(text, STYLE_PATTERNS, "通用商业风");
  const constraints = extractConstraints(text);
  const negativeConstraints = extractNegativeConstraints(text);
  const intentType = /微调|修改|优化|去掉|调整|remove|refine/i.test(text) ? "refine" : "create";

  return {
    intent_type: intentType,
    market,
    topic,
    ratio,
    style,
    scene: inferScene(text),
    product_subject: inferProductSubject(text),
    platform: inferPlatform(text),
    constraints,
    negative_constraints: negativeConstraints,
    output_goal: inferOutputGoal(text),
    normalized_user_intent: text || "生成符合品牌风格的电商广告图",
  };
}
