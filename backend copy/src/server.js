import "dotenv/config";
import express from "express";
import cors from "cors";
import { sanitizeHistoryPrompt } from "./services/promptSanitizer.js";
import { runGenerationWithFallback } from "./services/cozeClient.js";
import {
  findCandidateById,
  insertCandidate,
  insertMaterial,
  listCandidates,
  listMaterials,
  updateCandidate,
} from "./store/fileStore.js";

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_, res) => {
  res.json({ ok: true, service: "agent-ad-backend" });
});

app.get("/api/candidates", async (req, res) => {
  const taskId = req.query.task_id ? String(req.query.task_id) : "";
  const rows = await listCandidates(taskId);
  res.json({ ok: true, data: rows });
});

app.get("/api/materials", async (_, res) => {
  const rows = await listMaterials();
  res.json({ ok: true, data: rows });
});

app.post("/api/workflow/generate", async (req, res) => {
  try {
    const {
      task_id,
      market,
      topic,
      user_intent,
      is_refine,
      history_prompt,
      history_seed,
      history_image_url,
      history_material_id,
      parent_candidate_id,
    } = req.body ?? {};

    if (!user_intent || typeof user_intent !== "string") {
      return res.status(400).json({ ok: false, message: "user_intent 不能为空" });
    }
    if (typeof is_refine !== "boolean") {
      return res.status(400).json({ ok: false, message: "is_refine 必须是 Boolean" });
    }

    const cleanedHistoryPrompt = sanitizeHistoryPrompt(String(history_prompt || ""));
    const cozeInput = {
      task_id: String(task_id || ""),
      market: String(market || ""),
      topic: String(topic || ""),
      user_intent: String(user_intent || ""),
      is_refine,
      history_prompt: cleanedHistoryPrompt,
      history_seed: String(history_seed || ""),
      history_image_url: String(history_image_url || ""),
      history_material_id: String(history_material_id || ""),
    };

    const generated = await runGenerationWithFallback(cozeInput);
    const now = new Date().toISOString();
    const candidate = {
      candidate_id: crypto.randomUUID(),
      task_id: cozeInput.task_id || "task-mock",
      run_id: crypto.randomUUID(),
      image_url: generated.image_url,
      final_prompt: generated.final_prompt,
      visual_dna: generated.visual_dna,
      seed: generated.seed,
      generation_mode: generated.generation_mode,
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
    return res.json({ ok: true, data: candidate });
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
      image_url: candidate.image_url,
      final_prompt: candidate.final_prompt,
      visual_dna: candidate.visual_dna,
      seed: candidate.seed,
      generation_mode: candidate.generation_mode,
      parent_material_id: candidate.parent_material_id || null,
      review_status: "Approved",
      ctr: 0,
      created_at: new Date().toISOString(),
    };
    await insertMaterial(material);
    await updateCandidate(candidateId, { status: "approved", material_id: materialId });
    return res.json({ ok: true, data: material });
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

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[agent-ad-backend] listening on http://localhost:${port}`);
});
