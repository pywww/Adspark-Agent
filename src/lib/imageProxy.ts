const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  'http://localhost:8787';

export function toPreviewUrl(rawUrl: string) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}/api/image-proxy?url=${encodeURIComponent(url)}`;
}
