import { ApiError, bucket, handle } from "../../../lib/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await context.params;
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new ApiError(404, "图片不存在。");
    const file = await bucket().get(id);
    if (!file) throw new ApiError(404, "图片不存在或已被删除。");
    return new Response(file.body, { headers: { "Content-Type": file.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "ETag": file.httpEtag } });
  });
}
