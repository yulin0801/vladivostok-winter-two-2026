import { ApiError, handle, json, readCache, readJson, sameOrigin, serviceJson, validCoordinate, writeCache } from "../../lib/server";
export const dynamic = "force-dynamic";
type Point = { id: string; lat: number; lng: number };
type Matrix = (number | null)[][];
type RoadResult = { code: string; routes?: { geometry: { type: "LineString"; coordinates: number[][] }; distance: number; duration: number }[]; waypoints?: { distance: number }[] };

function optimalOrder(matrix: Matrix): number[] {
  const n = matrix.length;
  if (n <= 3) return Array.from({ length: n }, (_, i) => i);
  const middle = n - 2; const full = (1 << middle) - 1;
  const costs = Array.from({ length: full + 1 }, () => Array<number>(middle).fill(Infinity));
  const parents = Array.from({ length: full + 1 }, () => Array<number>(middle).fill(-1));
  for (let i = 0; i < middle; i++) costs[1 << i][i] = matrix[0][i + 1] ?? Infinity;
  for (let mask = 1; mask <= full; mask++) {
    for (let last = 0; last < middle; last++) {
      if (!(mask & (1 << last)) || !Number.isFinite(costs[mask][last])) continue;
      for (let next = 0; next < middle; next++) {
        if (mask & (1 << next)) continue;
        const nextMask = mask | (1 << next);
        const value = costs[mask][last] + (matrix[last + 1][next + 1] ?? Infinity);
        if (value < costs[nextMask][next]) { costs[nextMask][next] = value; parents[nextMask][next] = last; }
      }
    }
  }
  let end = -1; let best = Infinity;
  for (let i = 0; i < middle; i++) {
    const total = costs[full][i] + (matrix[i + 1][n - 1] ?? Infinity);
    if (total < best) { best = total; end = i; }
  }
  if (end < 0) throw new ApiError(422, "这些地点之间没有完整的可通行路线，请更换交通方式或拆成两段。");
  const result: number[] = []; let mask = full;
  while (end >= 0) { result.push(end + 1); const previous = parents[mask][end]; mask ^= 1 << end; end = previous; }
  return [0, ...result.reverse(), n - 1];
}

function pathLength(matrix: Matrix, order: number[]) {
  let sum = 0;
  for (let i = 1; i < order.length; i++) { const length = matrix[order[i - 1]][order[i]]; if (length == null || !Number.isFinite(length)) return undefined; sum += length; }
  return sum;
}

export async function POST(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    const input = await readJson(request, 16384);
    if (!Array.isArray(input.points) || input.points.length < 2 || input.points.length > 10) throw new ApiError(400, "每次路线规划请选择 2–10 个地点。");
    const points: Point[] = input.points.map((value: unknown) => {
      if (!value || typeof value !== "object") throw new ApiError(400, "地点格式不正确。");
      const p = value as Record<string, unknown>;
      if (typeof p.id !== "string" || p.id.length > 120 || !validCoordinate(p.lat, p.lng)) throw new ApiError(400, "地点缺少有效的海参崴坐标，请先在地图中定位。");
      return { id: p.id, lat: Number(p.lat), lng: Number(p.lng) };
    });
    if (new Set(points.map(p => p.id)).size !== points.length) throw new ApiError(400, "路线中不能有重复的地点记录。");
    const mode = input.mode === "walking" ? "walking" : "driving"; const optimize = input.optimize === true;
    const root = mode === "walking" ? "https://routing.openstreetmap.de/routed-foot" : "https://router.project-osrm.org";
    const service = mode === "walking" ? "fossgis-foot" : "osrm-driving"; const origin = new URL(request.url).origin;
    const encode = (items: Point[]) => items.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
    const coordinates = encode(points);
    const cacheKey = `route:v3:${mode}:${optimize}:${coordinates}:${points.map(p => p.id).join(",")}`;
    const cached = await readCache<unknown>(cacheKey); if (cached) return json(cached);
    let order = points.map((_, i) => i); let originalDistance: number | undefined;
    if (optimize && points.length > 3) {
      const matrixKey = `table:v1:${mode}:${coordinates}`;
      let table = await readCache<{ code: string; distances?: Matrix }>(matrixKey);
      if (!table) {
        table = await serviceJson<{ code: string; distances?: Matrix }>(`${root}/table/v1/driving/${coordinates}?annotations=distance&generate_hints=false`, service, origin);
        if (table.code !== "Ok" || !Array.isArray(table.distances) || table.distances.length !== points.length || table.distances.some(row => row.length !== points.length)) throw new ApiError(502, "暂时无法计算地点间的道路距离，请稍后重试，或先按当前顺序生成路线。");
        await writeCache(matrixKey, table, 86400000);
      }
      if (!table.distances) throw new ApiError(502, "路线服务未返回道路距离。");
      originalDistance = pathLength(table.distances, order); order = optimalOrder(table.distances);
    }
    const arranged = order.map(i => points[i]);
    // Allow a new departure direction after each stop, matching the independent
    // pairwise roads used in the table matrix and its original-distance comparison.
    const road = await serviceJson<RoadResult>(`${root}/route/v1/driving/${encode(arranged)}?overview=full&geometries=geojson&steps=false&generate_hints=false&continue_straight=false`, service, origin);
    const route = road.routes?.[0];
    if (road.code !== "Ok" || !route || !route.geometry || route.geometry.type !== "LineString" || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) throw new ApiError(422, "没有找到完整路线，请更换交通方式、检查位置或拆分行程。");
    if (road.waypoints?.some(point => point.distance > 1500)) throw new ApiError(422, "部分标记离可通行道路较远，请把位置调整到实际入口后再规划。");
    const result = { order: arranged.map(p => p.id), geometry: route.geometry, distance: route.distance, duration: route.duration, ...(originalDistance == null ? {} : { originalDistance }), source: mode === "walking" ? "FOSSGIS · OSRM · OpenStreetMap" : "OSRM · OpenStreetMap", mode, estimated: true, optimized: optimize, fixedEndpoints: true };
    await writeCache(cacheKey, result, 3600000); return json(result);
  });
}
