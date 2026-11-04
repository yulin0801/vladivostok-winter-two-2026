import { getTripDatabase } from "./database";
import { tripImageStore } from "./blob-store";
import { isAllowedFrontendOrigin } from "./origin";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const recordTypes = new Set(["place", "note", "packing", "restaurant", "hotel", "gift", "settings"]);
export type StoredRow = { id: string; type: string; payload: string; version: number; updated_by: string; updated_at: string; deleted: number };
export function database() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const local = !!url && (url.startsWith("file:") || url === ":memory:");
  if (!url || (!local && !authToken) || (local && process.env.NODE_ENV === "production")) throw new ApiError(503, "云端数据库尚未连接，请稍后重试。");
  return getTripDatabase(url, authToken);
}
export function bucket() {
  if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) throw new ApiError(503, "图片存储尚未连接，请稍后重试。");
  return tripImageStore;
}
export async function user(request: Request) {
  let selected = request.headers.get("x-trip-editor");
  try { selected = selected ? decodeURIComponent(selected) : null; } catch { selected = null; }
  const name = selected === "崔天琴" || selected === "张渝琳" ? selected : "旅行伙伴";
  // The owner chose public collaboration: every visitor can edit.
  // Display names are self-selected labels, never authenticated identities.
  return { userId: "shared-trip", displayName: name, email: "" };
}
export async function optionalUser(request: Request) {
  return user(request);
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // An explicitly configured static frontend is permitted to call this API
  // across sites. Every other origin keeps the existing same-origin checks.
  if (isAllowedFrontendOrigin(origin)) return;
  if (!origin || request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") {
    throw new ApiError(403, "请在旅行网站内操作，然后重试。");
  }
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    // Origin must be a serialized HTTP(S) origin, not a URL with credentials,
    // paths, fragments, a null origin, or a list of origins.
    if (!["http:", "https:"].includes(originUrl.protocol) || origin !== originUrl.origin || !["http:", "https:"].includes(requestUrl.protocol)) throw new Error("Invalid origin");
    // Next can normalize request.url to localhost. The actual Host retains
    // the authority used by the browser, including a non-default local port.
    const host = request.headers.get("host") ?? requestUrl.host;
    if (!host || /[\s/\\?#@,]/.test(host)) throw new Error("Invalid host");
    // Vercel terminates TLS before the Function, so its internal URL may use
    // HTTP. Only the platform-provided deployment flag permits this override;
    // client-supplied Forwarded/X-Forwarded-* headers are never trusted.
    const protocol = process.env.VERCEL === "1" ? "https:" : requestUrl.protocol;
    const expected = new URL(`${protocol}//${host}`);
    if (originUrl.origin !== expected.origin) throw new Error("Origin mismatch");
  } catch {
    throw new ApiError(403, "请在旅行网站内操作，然后重试。");
  }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
export async function handle(fn: () => Promise<Response>) {
  try { return await fn(); }
  catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    console.error("Trip API failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "暂时无法完成操作，请稍后重试。你的未保存输入仍会保留。" }, 500);
  }
}
export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiError(415, "请以 JSON 格式提交。");
  if (Number(request.headers.get("content-length") || 0) > maxBytes) throw new ApiError(413, "内容过长，请分成几条记录。");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new ApiError(413, "内容过长，请分成几条记录。");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new ApiError(400, "提交内容格式不正确。"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "提交内容格式不正确。");
  return value as Record<string, unknown>;
}
export function validId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) throw new ApiError(400, "记录编号不正确。");
}
export function validVersion(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new ApiError(400, "记录版本不正确，请刷新后重试。");
}
export function validCoordinate(lat: unknown, lng: unknown) {
  return typeof lat === "number" && Number.isFinite(lat) && lat >= 42.4 && lat <= 44.6 && typeof lng === "number" && Number.isFinite(lng) && lng >= 130.5 && lng <= 134;
}
function validUrl(value: string) {
  if (/^\/api\/files\/[a-f0-9-]+$/.test(value)) return true;
  try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; }
}
export function validateData(value: unknown, type?: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "记录内容不正确。");
  const data = value as Record<string, unknown>;
  const filled = (item: unknown) => item != null && !(typeof item === "string" && !item.trim());
  const meaningful = (item: unknown, depth = 0): boolean => {
    if (depth > 5) return false;
    if (typeof item === "string") return !!item.trim();
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item === "boolean") return item;
    if (Array.isArray(item)) return item.some(part => meaningful(part, depth + 1));
    if (item && typeof item === "object") return Object.values(item).some(part => meaningful(part, depth + 1));
    return false;
  };
  // Titles, text, prices, coordinates and photos are independently optional.
  // The editor filters untouched form defaults; an internal sort order alone
  // must never turn a completely empty API record into meaningful content.
  if (!Object.entries(data).some(([key, item]) => key !== "order" && meaningful(item))) throw new ApiError(400, "填任意一项或上传照片即可保存。");
  for (const key of ["name", "title", "text", "ruName", "address", "cuisine", "note", "category", "owner", "buyer", "currency", "status", "day", "time", "startDate", "endDate", "outbound", "inbound", "timezone", "flightNote", "url", "link", "website", "sourceUrl", "bookingUrl", "imageUrl", "coverUrl", "photoUrl"]) {
    if (filled(data[key]) && typeof data[key] !== "string") throw new ApiError(400, "文字与链接字段请填写文本内容。");
  }
  for (const key of ["images", "photos"]) {
    if (data[key] != null && (!Array.isArray(data[key]) || (data[key] as unknown[]).some(item => typeof item !== "string"))) throw new ApiError(400, "图片列表格式不正确。");
  }
  for (const key of ["done", "visited"]) {
    if (filled(data[key]) && typeof data[key] !== "boolean") throw new ApiError(400, "完成状态格式不正确。");
  }
  for (const key of ["price", "budget", "quantity", "duration", "nights", "order"]) {
    const number = data[key];
    const maximum = key === "order" ? Number.MAX_SAFE_INTEGER : 100000000;
    if (filled(number) && (typeof number !== "number" || !Number.isFinite(number) || number < 0 || number > maximum)) throw new ApiError(400, "价格、数量、天数和停留时长需填写有效的非负数。");
  }
  if (filled(data.nights) && (!Number.isInteger(data.nights) || Number(data.nights) < 1)) throw new ApiError(400, "住宿晚数需为大于 0 的整数。");
  if (filled(data.quantity) && !Number.isInteger(data.quantity)) throw new ApiError(400, "数量需为整数。");
  if (type === "packing" && filled(data.owner) && data.owner !== "崔天琴" && data.owner !== "张渝琳") throw new ApiError(400, "请选择行李所属的旅行伙伴。");
  if (filled(data.day) && (typeof data.day !== "string" || !/^2026-12-0[5-9]$/.test(data.day))) throw new ApiError(400, "请在 12 月 5–9 日中选择行程日期。");
  if (filled(data.time) && (typeof data.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time))) throw new ApiError(400, "请填写有效的 24 小时制时间。");
  const visit = (item: unknown, key = "", depth = 0) => {
    if (depth > 5) throw new ApiError(400, "记录结构过于复杂。");
    if (typeof item === "string") {
      if (item.length > 10000 || (/^(name|title)$/.test(key) && item.length > 200)) throw new ApiError(400, "文字太长，请缩短后保存。");
      if (item.trim() && /^(url|link|website|sourceUrl|bookingUrl|imageUrl|coverUrl|photoUrl|image|photos|images)$/i.test(key) && !validUrl(item)) throw new ApiError(400, "链接需要以 http:// 或 https:// 开头。");
    } else if (typeof item === "number" && !Number.isFinite(item)) throw new ApiError(400, "数值格式不正确。");
    else if (Array.isArray(item)) {
      if (item.length > 100) throw new ApiError(400, "单条记录包含的项目太多。");
      item.forEach(part => visit(part, key, depth + 1));
    } else if (item && typeof item === "object") {
      if (Object.keys(item).length > 60) throw new ApiError(400, "记录字段太多。");
      for (const [childKey, child] of Object.entries(item)) {
        if (["__proto__", "constructor", "prototype"].includes(childKey)) throw new ApiError(400, "字段名称不正确。");
        visit(child, childKey, depth + 1);
      }
    }
  };
  visit(data);
  // A partial coordinate is stored as supplied, never completed or converted
  // to zero. Only the map/routing code requires both coordinates to be present.
  if (filled(data.lat) && (typeof data.lat !== "number" || !Number.isFinite(data.lat) || data.lat < 42.4 || data.lat > 44.6)) throw new ApiError(400, "请填写海参崴及周边地区的有效纬度。");
  if (filled(data.lng) && (typeof data.lng !== "number" || !Number.isFinite(data.lng) || data.lng < 130.5 || data.lng > 134)) throw new ApiError(400, "请填写海参崴及周边地区的有效经度。");
  if (new TextEncoder().encode(JSON.stringify(data)).byteLength > 48 * 1024) throw new ApiError(413, "记录过大，请减少文字或图片链接。");
}
export function present(row: StoredRow) {
  return { id: row.id, type: row.type, data: JSON.parse(row.payload), version: row.version, updatedAt: row.updated_at, updatedBy: row.updated_by };
}
export async function readCache<T>(key: string): Promise<T | null> {
  const row = await database().prepare("SELECT payload FROM api_cache WHERE key = ? AND expires_at > ?").bind(key, Date.now()).first<{ payload: string }>();
  return row ? JSON.parse(row.payload) as T : null;
}
export async function writeCache(key: string, payload: unknown, lifetime = 3600000) {
  const db = database();
  await db.batch([
    db.prepare("INSERT INTO api_cache (key, payload, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, expires_at=excluded.expires_at").bind(key, JSON.stringify(payload), Date.now() + lifetime),
    db.prepare("DELETE FROM api_cache WHERE expires_at < ?").bind(Date.now()),
  ]);
}
export async function reserveService(name: string) {
  // The shared SQLite primary serializes reservations across Function instances.
  const now = Date.now();
  const slot = await database().prepare("INSERT INTO service_limits (name, next_allowed) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET next_allowed = MAX(service_limits.next_allowed, ?) + 1200 WHERE service_limits.next_allowed < ? RETURNING next_allowed")
    .bind(name, now + 1200, now, now + 12000).first<{ next_allowed: number }>();
  if (!slot) throw new ApiError(429, "地图服务正忙，请稍等片刻再试。");
  const delay = Math.max(0, slot.next_allowed - 1200 - Date.now());
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
}
export async function serviceJson<T>(url: string, service: string, origin: string): Promise<T> {
  await reserveService(service);
  try {
    const response = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": `VladivostokTwoTravel/1.0 (+${origin})`, "Referer": `${origin}/` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new ApiError(502, "地图服务暂时不可用，请稍后重试，或使用手动标记。");
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "地图服务连接超时，请稍后重试。");
  }
}
