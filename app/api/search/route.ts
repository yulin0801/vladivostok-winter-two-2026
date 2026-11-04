import { ApiError, handle, json, readCache, serviceJson, validCoordinate, writeCache } from "../../lib/server";
export const dynamic = "force-dynamic";
type Feature = { geometry?: { coordinates?: number[] }; properties?: Record<string, string | number> };
export async function GET(request: Request) {
  return handle(async () => {
    const q = (new URL(request.url).searchParams.get("q") || "").trim();
    if (q.length < 2 || q.length > 120) throw new ApiError(400, "请输入 2–120 个字符的地点名称，可使用俄文或英文。");
    const cacheKey = `photon:v1:${q.toLocaleLowerCase()}`;
    const cached = await readCache<unknown>(cacheKey); if (cached) return json(cached);
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", q); url.searchParams.set("lat", "43.1155"); url.searchParams.set("lon", "131.8855");
    url.searchParams.set("bbox", "130.5,42.4,134,44.6"); url.searchParams.set("limit", "8");
    const result = await serviceJson<{ features?: Feature[] }>(url.href, "photon", new URL(request.url).origin);
    if (!Array.isArray(result.features)) throw new ApiError(502, "地点搜索暂时不可用，请稍后重试。");
    const results = result.features.flatMap((feature, index) => {
      const coordinates = feature.geometry?.coordinates; const p = feature.properties || {};
      if (!coordinates || !validCoordinate(coordinates[1], coordinates[0])) return [];
      return [{ id: `search-${p.osm_type || "osm"}-${p.osm_id || index}`, name: String(p.name || p.street || q), subtitle: [p.housenumber, p.street, p.district, p.city, p.state].filter(Boolean).join(" · "), lat: coordinates[1], lng: coordinates[0], category: "place" }];
    });
    const response = { results, source: "Photon · OpenStreetMap" };
    await writeCache(cacheKey, response, 86400000); return json(response);
  });
}
