import type { RecordItem, RecordType } from '../lib/types';

const fallbackTitles: Record<RecordType, string> = {
  place: '待命名地点', note: '待补充的备忘', packing: '待补充的行李',
  restaurant: '待命名餐厅', hotel: '待命名酒店', gift: '待命名伴手礼', settings: '旅行信息',
};
const presetFields = new Set(['category', 'currency', 'owner', 'buyer', 'status', 'day', 'startDate', 'endDate', 'timezone']);
const internalFields = new Set(['order', 'done', 'visited']);
function filled(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.some(filled);
  return false;
}
export function hasDraftContent(data: Record<string, unknown>, touched: ReadonlySet<string>, existing = false) {
  return Object.entries(data).some(([field, value]) => !internalFields.has(field) && filled(value) && (existing || !presetFields.has(field) || touched.has(field)));
}
export function recordTitle(record: Pick<RecordItem, 'type' | 'data'>) {
  for (const field of ['name', 'text', 'ruName']) {
    const value = record.data[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallbackTitles[record.type];
}
export function hasNumber(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '' && (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
}
export function hasLocation(record: Pick<RecordItem, 'data'>) {
  const { lat, lng } = record.data;
  return hasNumber(lat) && hasNumber(lng) && Number(lat) >= -90 && Number(lat) <= 90 && Number(lng) >= -180 && Number(lng) <= 180;
}
export function hotelTotal(record: Pick<RecordItem, 'data'>): number | undefined {
  const { price, nights } = record.data;
  return hasNumber(price) && hasNumber(nights) ? Number(price) * Number(nights) : undefined;
}

/** Reapply only edits made since the editor opened onto the latest record. */
export function rebaseDraft(
  baseline: Record<string, unknown>,
  draft: Record<string, unknown>,
  latest: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...latest };
  for (const key of new Set([...Object.keys(baseline), ...Object.keys(draft)])) {
    if (JSON.stringify(baseline[key]) === JSON.stringify(draft[key])) continue;
    if (Object.prototype.hasOwnProperty.call(draft, key)) result[key] = draft[key];
    else delete result[key];
  }
  return result;
}
