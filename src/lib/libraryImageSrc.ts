import type { FinalizedRecord } from '../types';

/**
 * 为 true 时资产库统一用占位图。
 * 当前默认 false：优先展示真实入库图，仅在 URL 缺失时回退占位图。
 */
export const LIBRARY_USE_PLACEHOLDER_IMAGES = false;

/** 基于 materialId 的确定性 seed，同一素材占位图不变 */
function picsumSeed(rec: FinalizedRecord): string {
  const raw = rec.materialId.replace(/[^a-zA-Z0-9]/g, '') || 'asset';
  return encodeURIComponent(raw.slice(-24));
}

/**
 * @param size 请求边长（像素），用于列表小图与详情大图区分清晰度
 */
export function getLibraryImageSrc(rec: FinalizedRecord, size = 480): string {
  const url = rec.imageUrl?.trim();
  if (!LIBRARY_USE_PLACEHOLDER_IMAGES && url) return url;
  return `https://picsum.photos/seed/${picsumSeed(rec)}/${size}/${size}`;
}
