import { ApiError, database, handle, json, present, readJson, sameOrigin, type StoredRow, user, validId, validVersion } from "../../lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const current = await user(request); sameOrigin(request);
    const body = await readJson(request, 16384);
    if (!Array.isArray(body.items) || body.items.length < 2 || body.items.length > 30) throw new ApiError(400, "请选择 2–30 个同一天的地点进行排序。");
    const items = body.items.map((item: unknown) => {
      if (!item || typeof item !== "object") throw new ApiError(400, "排序数据不正确。");
      const value = item as Record<string, unknown>;
      validId(value.id); validVersion(value.version);
      if (!Number.isSafeInteger(value.order) || Number(value.order) < 0) throw new ApiError(400, "排序数字不正确。");
      return { id: value.id, version: value.version, order: Number(value.order) };
    });
    if (new Set(items.map(item => item.id)).size !== items.length) throw new ApiError(400, "排序列表不能包含重复地点。");
    const values = items.map(() => "(?, ?, ?)").join(", ");
    const sql = `WITH expected(id, version, new_order) AS (VALUES ${values}),
      eligible AS MATERIALIZED (
        SELECT COUNT(*) AS n, COUNT(DISTINCT COALESCE(json_extract(r.payload, '$.day'), '')) AS days
        FROM trip_records r JOIN expected e ON r.id = e.id AND r.version = e.version
        WHERE r.deleted = 0 AND r.type = 'place'
      )
      UPDATE trip_records
      SET payload = json_set(payload, '$.order', (SELECT new_order FROM expected WHERE expected.id = trip_records.id)),
          version = version + 1, updated_by = ?, updated_at = ?
      WHERE id IN (SELECT id FROM expected) AND (SELECT n FROM eligible) = ? AND (SELECT days FROM eligible) = 1
      RETURNING *`;
    const bindings = items.flatMap(item => [item.id, item.version, item.order]);
    const result = await database().prepare(sql).bind(...bindings, current.displayName, new Date().toISOString(), items.length).all<StoredRow>();
    if (result.results.length !== items.length) throw new ApiError(409, "同伴刚刚修改了行程。排序未保存，请刷新后再试。");
    return json({ records: result.results.map(present) });
  });
}
