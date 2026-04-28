import type {
  FinalizedBusinessMeta,
  FinalizedIngestMeta,
  FinalizedRecord,
} from '../types';

const KEY = 'agent-ad.finalized.all';

export function loadAllFinalized(): FinalizedRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as FinalizedRecord[];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function saveAllFinalized(list: FinalizedRecord[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function appendFinalized(rec: FinalizedRecord) {
  const all = loadAllFinalized().filter((x) => x.materialId !== rec.materialId);
  all.unshift(rec);
  saveAllFinalized(all);
}

export function countFinalizedByTask(taskId: string): number {
  return loadAllFinalized().filter((f) => f.taskId === taskId).length;
}

/** 按 materialId 合并更新（用于业务字段、ingest 补丁） */
export function patchFinalized(
  materialId: string,
  patch: {
    business?: Partial<FinalizedBusinessMeta>;
    ingest?: Partial<FinalizedIngestMeta>;
  },
): boolean {
  const all = loadAllFinalized();
  const i = all.findIndex((x) => x.materialId === materialId);
  if (i < 0) return false;
  const cur = all[i];
  const next = { ...cur };
  if (patch.business) {
    next.business = { ...(cur.business ?? {}), ...patch.business };
  }
  if (patch.ingest) {
    const base = cur.ingest ?? { at: cur.createdAt };
    next.ingest = { ...base, ...patch.ingest };
    if (!next.ingest.at) next.ingest.at = cur.createdAt;
  }
  all[i] = next;
  saveAllFinalized(all);
  return true;
}
