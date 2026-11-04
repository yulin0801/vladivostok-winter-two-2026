import { ApiError, database, handle, json, present, readJson, sameOrigin, type StoredRow, user, validId, validateData, validVersion } from "../../../lib/server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  return handle(async () => {
    const current = await user(request); sameOrigin(request);
    const { id } = await context.params; validId(id);
    const body = await readJson(request); validVersion(body.version);
    const db = database();
    const existing = await db.prepare("SELECT type FROM trip_records WHERE id = ? AND deleted = 0").bind(id).first<{ type: string }>();
    if (!existing) throw new ApiError(409, "这条记录已被删除，请刷新后重试。");
    validateData(body.data, existing.type);
    const row = await db.prepare("UPDATE trip_records SET payload = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND version = ? AND deleted = 0 RETURNING *")
      .bind(JSON.stringify(body.data), current.displayName, new Date().toISOString(), id, body.version).first<StoredRow>();
    if (!row) throw new ApiError(409, "这条记录已被同伴修改或删除。请刷新后查看最新内容，再保存你的修改。");
    return json({ record: present(row) });
  });
}
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    const current = await user(request); sameOrigin(request);
    const { id } = await context.params; validId(id);
    const version = Number(new URL(request.url).searchParams.get("version")); validVersion(version);
    const result = await database().prepare("UPDATE trip_records SET deleted = 1, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND version = ? AND deleted = 0")
      .bind(current.displayName, new Date().toISOString(), id, version).run();
    if (!result.meta.changes) throw new ApiError(409, "这条记录已被同伴修改或删除，请刷新后重试。");
    return json({ ok: true, id });
  });
}
