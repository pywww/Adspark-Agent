import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const CANDIDATES_FILE = path.join(DATA_DIR, "generation_candidates.json");
const MATERIALS_FILE = path.join(DATA_DIR, "material_library.json");

async function ensureFile(filePath) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "[]", "utf8");
  }
}

async function readJson(filePath) {
  await ensureFile(filePath);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw || "[]");
}

async function writeJson(filePath, value) {
  await ensureFile(filePath);
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export async function listCandidates(taskId) {
  const all = await readJson(CANDIDATES_FILE);
  if (!taskId) return all;
  return all.filter((item) => item.task_id === taskId);
}

export async function insertCandidate(candidate) {
  const all = await readJson(CANDIDATES_FILE);
  all.unshift(candidate);
  await writeJson(CANDIDATES_FILE, all);
  return candidate;
}

export async function findCandidateById(candidateId) {
  const all = await readJson(CANDIDATES_FILE);
  return all.find((item) => item.candidate_id === candidateId) || null;
}

export async function updateCandidate(candidateId, patch) {
  const all = await readJson(CANDIDATES_FILE);
  const index = all.findIndex((item) => item.candidate_id === candidateId);
  if (index < 0) return null;
  all[index] = { ...all[index], ...patch };
  await writeJson(CANDIDATES_FILE, all);
  return all[index];
}

export async function insertMaterial(material) {
  const all = await readJson(MATERIALS_FILE);
  all.unshift(material);
  await writeJson(MATERIALS_FILE, all);
  return material;
}

export async function listMaterials() {
  return readJson(MATERIALS_FILE);
}
