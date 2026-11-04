import { ApiError, bucket, handle, json, sameOrigin, user } from "../../lib/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const maximum = 4 * 1024 * 1024;
function imageType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  const prefix = new TextDecoder().decode(bytes.slice(0, 12));
  if (prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a")) return "image/gif";
  if (prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}
export async function POST(request: Request) {
  return handle(async () => {
    await user(request); sameOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new ApiError(415, "请选择图片文件上传。");
    if (Number(request.headers.get("content-length") || 0) > maximum + 16384) throw new ApiError(413, "图片需小于 4 MB。");
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError(400, "没有收到图片。");
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maximum + 16384) { await reader.cancel(); throw new ApiError(413, "图片需小于 4 MB。"); }
      chunks.push(value);
    }
    const all = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
    let form: FormData;
    try { form = await new Response(all, { headers: { "content-type": request.headers.get("content-type")! } }).formData(); }
    catch { throw new ApiError(400, "图片上传格式不正确，请重新选择。"); }
    const file = form.get("file");
    if (!file || typeof file === "string" || !file.size) throw new ApiError(400, "请选择一张图片。");
    if (file.size > maximum) throw new ApiError(413, "图片需小于 4 MB。");
    const bytes = new Uint8Array(await file.arrayBuffer()); const contentType = imageType(bytes);
    if (!contentType) throw new ApiError(415, "仅支持 JPEG、PNG、WebP 或 GIF 图片。");
    const id = crypto.randomUUID();
    await bucket().put(id, bytes, { httpMetadata: { contentType, cacheControl: "private, max-age=86400" } });
    return json({ url: `/api/files/${id}` }, 201);
  });
}
