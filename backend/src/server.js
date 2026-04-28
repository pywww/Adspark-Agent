import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import { sanitizeHistoryPrompt } from "./services/promptSanitizer.js";
import { runGenerationWithFallback } from "./services/cozeClient.js";
import { parseIntent } from "./services/intentParser.js";
import { parseIntentPreferCoze } from "./services/intentCozeClient.js";
import {
  findCandidateById,
  findMaterialById,
  insertCandidate,
  insertMaterial,
  listCandidates,
  listMaterials,
  updateCandidate,
  updateMaterial,
} from "./store/fileStore.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, "../uploads/reference-images");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/uploads/reference-images", express.static(uploadDir));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") {
      cb(null, true);
      return;
    }
    cb(new Error("仅支持 jpg/png/webp 图片"));
  },
  limits: {
    fileSize: 12 * 1024 * 1024,
    files: 6,
  },
});

app.get("/api/health", (_, res) => {
  res.json({ ok: true, service: "agent-ad-backend" });
});

app.post("/api/upload/reference-images", (req, res) => {
  upload.array("images", 6)(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : "上传失败",
      });
    }
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ ok: false, message: "请至少上传 1 张图片" });
    }
    const localHost = `${req.protocol}://${req.get("host")}`;
    const configuredBase = normalizeText(process.env.PUBLIC_ASSET_BASE_URL).replace(/\/$/, "");
    const host = configuredBase || localHost;
    const publicReachable = !/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(host);
    const data = files.map((file) => ({
      name: normalizeUploadFilename(file.originalname),
      url: `${host}/uploads/reference-images/${file.filename}`,
      preview_url: `${localHost}/uploads/reference-images/${file.filename}`,
    }));
    return res.json({ ok: true, data, public_reachable: publicReachable });
  });
});

app.post("/api/intent/parse", (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  if (!text.trim()) {
    return res.status(400).json({ ok: false, message: "text 不能为空" });
  }
  return parseIntentPreferCoze(text)
    .then((result) => {
      return res.json({ ok: true, source: result.source, data: result.data });
    })
    .catch((error) => {
      return res.status(502).json({
        ok: false,
        source: "coze_error",
        message: error instanceof Error ? error.message : "意图解析失败",
      });
    });
});

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function sortByCreatedAt(rows, order = "desc") {
  const sign = order === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const at = Date.parse(a?.created_at || "");
    const bt = Date.parse(b?.created_at || "");
    return (at - bt) * sign;
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeUploadFilename(name) {
  const raw = String(name || "").trim();
  if (!raw) return "reference-image";
  try {
    return Buffer.from(raw, "latin1").toString("utf8");
  } catch {
    return raw;
  }
}

function isHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isReferenceUploadUrl(value) {
  const url = String(value || "");
  return /\/uploads\/reference-images\//i.test(url);
}

function guessImageExt(contentType = "", fallbackUrl = "") {
  const ct = String(contentType).toLowerCase();
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/webp")) return "webp";
  if (ct.includes("image/jpeg") || ct.includes("image/jpg")) return "jpg";
  if (ct.includes("image/gif")) return "gif";
  const match = String(fallbackUrl).match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match?.[1]?.toLowerCase() || "jpg";
}

function pickSourceTag(generated) {
  const source = String(generated?.raw?.source || "").trim();
  if (source === "agent") return "coze_agent";
  if (source === "coze_workflow") return "coze_workflow";
  if (source === "mock") return "mock";
  return "unknown";
}

function pickImageMessage(generated) {
  return String(
    generated?.raw?.msg ||
      generated?.raw?.message ||
      generated?.visual_dna ||
      "success",
  );
}

function normalizeExploreMode(value) {
  const v = String(value || "").trim();
  if (v === "multi_style" || v === "multi_scene" || v === "single") return v;
  return "single";
}

function normalizePlatformPreset(value) {
  const v = String(value || "").trim();
  if (!v) return "通用";
  return v;
}

function normalizeAspectRatio(value) {
  const v = String(value || "").trim();
  if (!v || v === "智能") return "1:1";
  const allowed = new Set(["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "21:9"]);
  return allowed.has(v) ? v : "1:1";
}

function normalizeEnvValue(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
}

function parseBooleanFlag(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(v)) return true;
    if (["false", "0", "no", "off"].includes(v)) return false;
  }
  return fallback;
}

function getCozeWritebackConfig() {
  return {
    token: normalizeEnvValue(process.env.COZE_API_TOKEN),
    baseUrl: normalizeEnvValue(process.env.COZE_API_BASE_URL) || "https://api.coze.cn",
    workflowId: normalizeEnvValue(process.env.COZE_WRITEBACK_WORKFLOW_ID),
  };
}

async function callCozeWorkflow(workflowId, parameters, config) {
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

async function writeBackToCoze(material) {
  const config = getCozeWritebackConfig();
  if (!config.token || !config.workflowId) {
    return { skipped: true, reason: "COZE_WRITEBACK_WORKFLOW_ID 或 COZE_API_TOKEN 未配置" };
  }
  const payload = {
    material_id: String(material.material_id || ""),
    market: String(material.market || ""),
    topic: String(material.topic || ""),
    style: String(material.style || ""),
    scene: String(material.scene || ""),
    product_subject: String(material.product_subject || ""),
    platform: String(material.platform || "通用"),
    final_prompt: String(material.final_prompt || ""),
    visual_dna: String(material.visual_dna || ""),
    image_url: String(material.image_url || ""),
    ctr: Number(material.ctr || 0),
    review_status: String(material.review_status || "approved").toLowerCase(),
    generation_mode: String(material.generation_mode || "create"),
    update_time: String(material.update_time || material.created_at || new Date().toISOString()),
    refine_logs: String(material.refine_logs || ""),
    trend_used: Boolean(material.trend_used),
    trend_source: String(material.trend_source || "none"),
    trend_conflict: Boolean(material.trend_conflict),
    trend_conflict_reason: String(material.trend_conflict_reason || ""),
    trend_range: String(material.trend_range || "30d"),
    trend_keywords: Array.isArray(material.trend_keywords) ? material.trend_keywords : [],
    knowledge_used: String(material.knowledge_used || ""),
    platform_fit_notes: String(material.platform_fit_notes || ""),
    platform_preset: String(material.platform_preset || "通用"),
    explore_mode: String(material.explore_mode || "single"),
    reference_summary: String(material.reference_summary || ""),
    reference_hit_count: Number(material.reference_hit_count || 0),
    reference_used: Boolean(material.reference_used),
    reference_count: Number(material.reference_count || 0),
    reference_mode: String(material.reference_mode || "structure"),
    reference_weight: Number(material.reference_weight || 0.6),
    trend_latency_ms: Number(material.trend_latency_ms || 0),
    trend_degraded_reason: String(material.trend_degraded_reason || ""),
    debug_received_fields: material.debug_received_fields || {},
    debug_trend_used: Boolean(material.debug_trend_used),
    debug_rag_hit_count: Number(material.debug_rag_hit_count || 0),
    debug_final_prompt_excerpt: String(material.debug_final_prompt_excerpt || ""),
    intent_source: String(material.intent_source || ""),
    model_name: String(material.model_name || ""),
  };
  const raw = await callCozeWorkflow(config.workflowId, payload, config);
  return {
    skipped: false,
    workflow_id: config.workflowId,
    raw,
  };
}

app.get("/api/candidates", async (req, res) => {
  const taskId = req.query.task_id ? String(req.query.task_id) : "";
  const page = parsePositiveInt(req.query.page, 1);
  const pageSize = Math.min(parsePositiveInt(req.query.page_size, 20), 100);
  const order = String(req.query.order || "desc").toLowerCase() === "asc" ? "asc" : "desc";

  const rows = await listCandidates(taskId);
  const sorted = sortByCreatedAt(rows, order);
  const total = sorted.length;
  const offset = (page - 1) * pageSize;
  const paged = sorted.slice(offset, offset + pageSize);
  res.json({
    ok: true,
    data: paged,
    meta: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize)),
      order,
    },
  });
});

app.get("/api/materials", async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1);
  const pageSize = Math.min(parsePositiveInt(req.query.page_size, 20), 100);
  const order = String(req.query.order || "desc").toLowerCase() === "asc" ? "asc" : "desc";

  const rows = await listMaterials();
  const sorted = sortByCreatedAt(rows, order);
  const total = sorted.length;
  const offset = (page - 1) * pageSize;
  const paged = sorted.slice(offset, offset + pageSize);
  res.json({
    ok: true,
    data: paged,
    meta: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize)),
      order,
    },
  });
});

app.get("/api/materials/:id/download", async (req, res) => {
  try {
    const materialId = String(req.params.id || "");
    const material = await findMaterialById(materialId);
    if (!material) {
      return res.status(404).json({ ok: false, message: "素材不存在" });
    }
    const imageUrl = String(material.image_url || "").trim();
    if (!isHttpUrl(imageUrl)) {
      return res.status(400).json({ ok: false, message: "素材图片地址无效" });
    }
    const upstream = await fetch(imageUrl);
    if (!upstream.ok) {
      return res
        .status(502)
        .json({ ok: false, message: `拉取素材图片失败（${upstream.status}）` });
    }
    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const ext = guessImageExt(contentType, imageUrl);
    const filename = `${materialId}.${ext}`;
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(bytes);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "导出失败",
    });
  }
});

app.get("/api/image-proxy", async (req, res) => {
  try {
    const target = String(req.query.url || "").trim();
    if (!isHttpUrl(target)) {
      return res.status(400).json({ ok: false, message: "url 参数无效" });
    }
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 agent-ad-web-image-proxy",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!upstream.ok) {
      return res
        .status(502)
        .json({ ok: false, message: `预览代理拉取失败（${upstream.status}）` });
    }
    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.send(bytes);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "预览代理失败",
    });
  }
});

app.post("/api/workflow/generate", async (req, res) => {
  try {
    const {
      task_id,
      market,
      topic,
      style,
      scene,
      product_subject,
      platform,
      constraints,
      negative_constraints,
      output_goal,
      aspect_ratio,
      market_trend,
      uploaded_context,
      user_intent,
      intent_source,
      trend_reference_enabled,
      trend_reference_range,
      explore_mode,
      platform_preset,
      model_name,
      is_refine,
      history_prompt,
      history_seed,
      history_image_url,
      history_material_id,
      parent_candidate_id,
      reference_images,
      reference_mode,
      reference_weight,
      reference_required,
    } = req.body ?? {};

    if (typeof user_intent !== "string") {
      return res.status(400).json({ ok: false, message: "user_intent 必须是 String" });
    }
    if (typeof is_refine !== "boolean") {
      return res.status(400).json({ ok: false, message: "is_refine 必须是 Boolean" });
    }
    // 微调工作流强依赖 user_intent；首次生图以摘要 6 点 + explore_mode 为主，允许空 user_intent
    const rawIntent = String(user_intent || "");
    if (is_refine && !rawIntent.trim()) {
      return res.status(400).json({ ok: false, message: "微调生成时 user_intent（微调要求）不能为空" });
    }

    const normalizedMarket = normalizeText(market);
    const normalizedTopic = normalizeText(topic);
    const normalizedStyle = normalizeText(style);
    const normalizedScene = normalizeText(scene);
    const normalizedProductSubject = normalizeText(product_subject);
    // 平台以摘要的 platform 为主；无单独「平台预设」时与 platform 对齐
    const normalizedPlatform =
      normalizeText(platform) || normalizeText(platform_preset) || "通用";
    const normalizedOutputGoal = normalizeText(output_goal);
    const normalizedAspectRatio = normalizeAspectRatio(aspect_ratio);
    const normalizedMarketTrend = normalizeText(market_trend);
    const normalizedUploadedContext = normalizeText(uploaded_context);
    const normalizedHistoryPrompt = normalizeText(history_prompt);
    const normalizedHistoryImageUrl = normalizeText(history_image_url);
    const normalizedParentCandidateId = normalizeText(parent_candidate_id);
    const normalizedConstraints = Array.isArray(constraints)
      ? constraints.map((item) => normalizeText(item)).filter(Boolean)
      : [];
    const normalizedNegativeConstraints = Array.isArray(negative_constraints)
      ? negative_constraints.map((item) => normalizeText(item)).filter(Boolean)
      : [];
    const normalizedIntentSource = normalizeText(intent_source);
    const normalizedModelName = normalizeText(model_name);
    const trendUsed = parseBooleanFlag(trend_reference_enabled, false);
    const normalizedTrendRange = normalizeText(trend_reference_range) || "30d";
    const normalizedExploreMode = normalizeExploreMode(explore_mode);
    const normalizedPlatformPreset =
      normalizeText(platform_preset) || normalizedPlatform || normalizePlatformPreset(platform_preset);
    const normalizedReferenceImages = Array.isArray(reference_images)
      ? reference_images.map((item) => normalizeText(item)).filter(Boolean)
      : typeof reference_images === "string" && normalizeText(reference_images)
        ? [normalizeText(reference_images)]
        : [];
    const invalidReferenceUrl = normalizedReferenceImages.find((item) => !isHttpUrl(item));
    if (invalidReferenceUrl) {
      return res.status(400).json({
        ok: false,
        message: `reference_images 包含无效 URL: ${invalidReferenceUrl}`,
      });
    }
    if (normalizedReferenceImages.length > 6) {
      return res.status(400).json({
        ok: false,
        message: "reference_images 最多支持 6 张",
      });
    }
    const normalizedReferenceMode = ["style", "structure"].includes(normalizeText(reference_mode))
      ? normalizeText(reference_mode)
      : "structure";
    const referenceWeightRaw = Number(reference_weight);
    const normalizedReferenceWeight =
      Number.isFinite(referenceWeightRaw) && referenceWeightRaw >= 0 && referenceWeightRaw <= 1
        ? referenceWeightRaw
        : 0.6;
    const normalizedReferenceRequired = parseBooleanFlag(reference_required, false);
    if (normalizedReferenceRequired && normalizedReferenceImages.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "reference_required=true 时必须提供 reference_images",
      });
    }
    // Coze 生图节点常见“参考图”参数类型是 Image（单图），这里取首图做类型兼容。
    const normalizedReferenceImage = normalizedReferenceImages[0] || "";

    if (is_refine) {
      const hasRefineContext =
        Boolean(normalizedHistoryPrompt) ||
        Boolean(normalizedHistoryImageUrl) ||
        Boolean(normalizedParentCandidateId);
      if (!hasRefineContext) {
        return res.status(400).json({
          ok: false,
          message: "微调生成必须提供历史上下文（history_prompt 或 history_image_url 或 parent_candidate_id）",
        });
      }
    }

    const cleanedHistoryPrompt = sanitizeHistoryPrompt(String(history_prompt || ""));
    const cozeInput = {
      task_id: String(task_id || ""),
      market: normalizedMarket,
      topic: normalizedTopic,
      style: normalizedStyle,
      scene: normalizedScene,
      product_subject: normalizedProductSubject,
      platform: normalizedPlatform,
      constraints: normalizedConstraints,
      negative_constraints: normalizedNegativeConstraints,
      output_goal: normalizedOutputGoal,
      aspect_ratio: normalizedAspectRatio,
      market_trend: normalizedMarketTrend,
      uploaded_context: normalizedUploadedContext,
      user_intent: rawIntent,
      intent_source: normalizedIntentSource,
      trend_reference_enabled: trendUsed,
      trend_reference_range: normalizedTrendRange,
      explore_mode: normalizedExploreMode,
      platform_preset: normalizedPlatformPreset,
      model_name: normalizedModelName,
      is_refine,
      history_prompt: cleanedHistoryPrompt,
      history_seed: String(history_seed || ""),
      history_image_url: normalizedHistoryImageUrl,
      history_material_id: String(history_material_id || ""),
      // 兼容 Image 类型（单图）入参：推荐在 Coze Start 用 reference_images(Image) 绑定此字段
      reference_images: normalizedReferenceImage,
      // 兼容旧版 Array<String> 工作流：可在 Coze 侧绑定 reference_images_list
      reference_images_list: normalizedReferenceImages,
      reference_mode: normalizedReferenceMode,
      reference_weight: normalizedReferenceWeight,
      reference_required: normalizedReferenceRequired,
    };

    const generated = await runGenerationWithFallback(cozeInput);
    if (!isHttpUrl(generated?.image_url)) {
      return res.status(502).json({
        ok: false,
        message: "生图工作流未返回可用图片 URL，请检查 Coze 生图节点输出映射",
      });
    }
    const generatedImageUrl = String(generated.image_url || "").trim();
    const returnedReferenceUrl =
      isReferenceUploadUrl(generatedImageUrl) ||
      normalizedReferenceImages.includes(generatedImageUrl);
    if (returnedReferenceUrl) {
      return res.status(502).json({
        ok: false,
        message:
          "工作流返回的是参考图地址而不是生成结果，请将结束节点 image_url 映射到生图节点输出（如 data.url）",
      });
    }
    const now = new Date().toISOString();
    const candidate = {
      candidate_id: crypto.randomUUID(),
      task_id: cozeInput.task_id || "task-mock",
      market: cozeInput.market,
      topic: cozeInput.topic,
      style: cozeInput.style,
      scene: cozeInput.scene,
      product_subject: cozeInput.product_subject,
      platform: cozeInput.platform,
      constraints: cozeInput.constraints,
      negative_constraints: cozeInput.negative_constraints,
      output_goal: cozeInput.output_goal,
      run_id: crypto.randomUUID(),
      image_url: generated.image_url,
      image_msg: pickImageMessage(generated),
      final_prompt: generated.final_prompt,
      visual_dna: generated.visual_dna,
      seed: generated.seed,
      generation_mode: generated.generation_mode,
      source: pickSourceTag(generated),
      intent_source: cozeInput.intent_source || "unknown",
      trend_used: trendUsed,
      trend_source: String(generated?.trend_source || (trendUsed ? "live" : "none")),
      trend_conflict: Boolean(generated?.trend_conflict),
      trend_conflict_reason: String(generated?.trend_conflict_reason || ""),
      trend_range: normalizedTrendRange,
      trend_keywords: Array.isArray(generated?.trend_keywords)
        ? generated.trend_keywords.map((item) => String(item))
        : [],
      knowledge_used: String(generated?.knowledge_used || ""),
      platform_fit_notes: String(generated?.platform_fit_notes || ""),
      platform_preset: normalizedPlatformPreset,
      explore_mode: normalizedExploreMode,
      reference_summary: String(generated?.reference_summary || ""),
      reference_hit_count: Number(generated?.reference_hit_count || 0),
      reference_used: normalizedReferenceImages.length > 0,
      reference_count: normalizedReferenceImages.length,
      reference_mode: normalizedReferenceMode,
      reference_weight: normalizedReferenceWeight,
      reference_required: normalizedReferenceRequired,
      trend_latency_ms: Number(generated?.trend_latency_ms || 0),
      trend_degraded_reason: String(generated?.trend_degraded_reason || ""),
      debug_received_fields: {
        market: cozeInput.market,
        topic: cozeInput.topic,
        style: cozeInput.style,
        scene: cozeInput.scene,
        product_subject: cozeInput.product_subject,
        platform: cozeInput.platform,
        aspect_ratio: cozeInput.aspect_ratio,
        explore_mode: cozeInput.explore_mode,
        platform_preset: cozeInput.platform_preset,
        trend_reference_enabled: cozeInput.trend_reference_enabled,
        trend_reference_range: cozeInput.trend_reference_range,
        reference_count: normalizedReferenceImages.length,
        reference_mode: normalizedReferenceMode,
        reference_required: normalizedReferenceRequired,
        reference_images_type_sent: normalizedReferenceImage ? "image-single" : "empty",
      },
      debug_trend_used: trendUsed,
      debug_rag_hit_count: Number(generated?.reference_hit_count || 0),
      debug_final_prompt_excerpt: String(generated?.final_prompt || "").slice(0, 180),
      model_name: String(generated?.model_name || normalizedModelName || ""),
      parent_candidate_id: parent_candidate_id || null,
      parent_material_id: generated.parent_material_id,
      refine_intent: cozeInput.is_refine ? cozeInput.user_intent : null,
      status: "pending_review",
      created_at: now,
      prompt_meta: {
        history_prompt_raw_len: String(history_prompt || "").length,
        history_prompt_clean_len: cleanedHistoryPrompt.length,
      },
    };
    await insertCandidate(candidate);
    return res.json({
      ok: true,
      source: candidate.source,
      data: candidate,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "生成失败",
    });
  }
});

app.post("/api/candidates/:id/finalize", async (req, res) => {
  try {
    const candidateId = req.params.id;
    const candidate = await findCandidateById(candidateId);
    if (!candidate) {
      return res.status(404).json({ ok: false, message: "候选图片不存在" });
    }
    if (candidate.status === "approved" && candidate.material_id) {
      return res.json({
        ok: true,
        data: { material_id: candidate.material_id, already_finalized: true },
      });
    }
    if (candidate.status !== "pending_review") {
      return res
        .status(409)
        .json({ ok: false, message: `当前状态不可入库：${candidate.status}` });
    }

    const materialId = `M-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const material = {
      material_id: materialId,
      source_candidate_id: candidate.candidate_id,
      task_id: candidate.task_id,
      market: candidate.market || "",
      topic: candidate.topic || "",
      style: candidate.style || "",
      scene: candidate.scene || "",
      product_subject: candidate.product_subject || "",
      platform: candidate.platform || "",
      constraints: candidate.constraints || [],
      negative_constraints: candidate.negative_constraints || [],
      output_goal: candidate.output_goal || "",
      image_url: candidate.image_url,
      image_msg: candidate.image_msg || "success",
      final_prompt: candidate.final_prompt,
      visual_dna: candidate.visual_dna,
      seed: candidate.seed,
      generation_mode: candidate.generation_mode,
      source: candidate.source || "unknown",
      intent_source: candidate.intent_source || "unknown",
      trend_used: Boolean(candidate.trend_used),
      trend_source: candidate.trend_source || "none",
      trend_conflict: Boolean(candidate.trend_conflict),
      trend_conflict_reason: candidate.trend_conflict_reason || "",
      trend_range: candidate.trend_range || "30d",
      trend_keywords: candidate.trend_keywords || [],
      knowledge_used: candidate.knowledge_used || "",
      platform_fit_notes: candidate.platform_fit_notes || "",
      platform_preset: candidate.platform_preset || "通用",
      explore_mode: candidate.explore_mode || "single",
      reference_summary: candidate.reference_summary || "",
      reference_hit_count: Number(candidate.reference_hit_count || 0),
      reference_used: Boolean(candidate.reference_used),
      reference_count: Number(candidate.reference_count || 0),
      reference_mode: candidate.reference_mode || "structure",
      reference_weight: Number(candidate.reference_weight || 0.6),
      trend_latency_ms: Number(candidate.trend_latency_ms || 0),
      trend_degraded_reason: candidate.trend_degraded_reason || "",
      debug_received_fields: candidate.debug_received_fields || {},
      debug_trend_used: Boolean(candidate.debug_trend_used),
      debug_rag_hit_count: Number(candidate.debug_rag_hit_count || 0),
      debug_final_prompt_excerpt: candidate.debug_final_prompt_excerpt || "",
      model_name: candidate.model_name || "",
      parent_material_id: candidate.parent_material_id || null,
      review_status: "待投放",
      ctr: 0,
      update_time: new Date().toISOString(),
      created_at: new Date().toISOString(),
      refine_logs: candidate.refine_intent || "",
    };
    await insertMaterial(material);
    await updateCandidate(candidateId, { status: "approved", material_id: materialId });
    let writeback = null;
    try {
      writeback = await writeBackToCoze(material);
    } catch (error) {
      writeback = {
        skipped: false,
        ok: false,
        message: error instanceof Error ? error.message : "写回 Coze 动态库失败",
      };
    }
    return res.json({ ok: true, data: material, writeback });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "入库失败",
    });
  }
});

app.post("/api/candidates/:id/reject", async (req, res) => {
  const candidateId = req.params.id;
  const candidate = await findCandidateById(candidateId);
  if (!candidate) {
    return res.status(404).json({ ok: false, message: "候选图片不存在" });
  }
  const next = await updateCandidate(candidateId, { status: "rejected" });
  return res.json({ ok: true, data: next });
});

app.post("/api/materials/:id/ctr", async (req, res) => {
  const materialId = req.params.id;
  const material = await findMaterialById(materialId);
  if (!material) {
    return res.status(404).json({ ok: false, message: "素材不存在" });
  }
  const ctr = Number(req.body?.ctr);
  if (!Number.isFinite(ctr) || ctr < 0 || ctr > 1) {
    return res.status(400).json({ ok: false, message: "ctr 必须是 0~1 之间的小数" });
  }
  const next = await updateMaterial(materialId, {
    ctr,
    update_time: new Date().toISOString(),
  });
  return res.json({ ok: true, data: next });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[agent-ad-backend] listening on http://localhost:${port}`);
});
