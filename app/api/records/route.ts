import { seedRecords } from "../../lib/seed";
import { ApiError, database, handle, json, optionalUser, present, readJson, recordTypes, sameOrigin, type StoredRow, user, validId, validateData } from "../../lib/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(async () => {
    const current = await optionalUser(request);
    const db = database();
    // Tombstones keep deleted seed entries from reappearing.
    if (seedRecords.length) await db.batch(seedRecords.map(record => db.prepare("INSERT OR IGNORE INTO trip_records (id, type, payload, version, updated_by, updated_at, deleted) VALUES (?, ?, ?, 1, ?, ?, 0)").bind(record.id, record.type, JSON.stringify(record.data), "初始清单", "2026-11-04T00:00:00.000Z")));
    const result = await db.prepare("SELECT * FROM trip_records WHERE deleted = 0 ORDER BY updated_at, id LIMIT 5000").all<StoredRow>();
    return json({ records: result.results.map(present), user: current ? { id: current.userId, name: current.displayName, email: current.email } : null, canEdit: !!current });
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    const current = await user(request); sameOrigin(request);
    const body = await readJson(request);
    if (typeof body.type !== "string" || !recordTypes.has(body.type)) throw new ApiError(400, "记录类型不正确。");
    validateData(body.data, body.type);
    const id = body.id ?? crypto.randomUUID(); validId(id);
    const now = new Date().toISOString(); const db = database();
    const count = await db.prepare("SELECT COUNT(*) AS total FROM trip_records WHERE deleted = 0").first<{ total: number }>();
    if ((count?.total ?? 0) >= 5000) throw new ApiError(409, "旅行空间已达到 5000 条记录，请先整理旧内容。");
    const result = await db.prepare("INSERT OR IGNORE INTO trip_records (id, type, payload, version, updated_by, updated_at, deleted) VALUES (?, ?, ?, 1, ?, ?, 0)").bind(id, body.type, JSON.stringify(body.data), current.displayName, now).run();
    if (!result.meta.changes) throw new ApiError(409, "这条记录已经存在，请刷新后重试。");
    return json({ record: { id, type: body.type, data: body.data, version: 1, updatedAt: now, updatedBy: current.displayName } }, 201);
  });
}
