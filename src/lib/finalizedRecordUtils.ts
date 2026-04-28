import type { FinalizedRecord } from '../types';

/** 高表现 CTR 下限（0~1，即 5%） */
export const HIGH_CTR_THRESHOLD = 0.05;

export function isHighPerforming(r: FinalizedRecord): boolean {
  if (r.business?.markAsHigh === true) return true;
  if (r.ctr !== undefined && r.ctr >= HIGH_CTR_THRESHOLD) return true;
  return false;
}

/** 本地日历日键，用于分组排序 */
export function dayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 分组标题：今天 / 昨天 / 本地化日期 */
export function formatLibraryDayHeading(dayKey: string): string {
  const [ys, ms, ds] = dayKey.split('-').map(Number);
  const day = new Date(ys, ms - 1, ds);
  const startOf = (x: Date) => {
    const t = new Date(x);
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  };
  const today = startOf(new Date());
  const target = startOf(day);
  const diff = Math.round((today - target) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  return day.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}
