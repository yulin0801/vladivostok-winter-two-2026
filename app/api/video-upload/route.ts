import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { ApiError, handle, json, readJson, sameOrigin, user } from "../../lib/server";
import { MAX_VIDEO_BYTES, videoContentType } from "../../lib/video";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handle(async () => {
    // Only the small token request or signed completion event reaches this
    // Function. Browser video bytes go directly to Blob, including multipart.
    const body = await readJson(request, 8 * 1024);
    if (body.type !== "blob.generate-client-token" && body.type !== "blob.upload-completed") throw new ApiError(400, "视频上传请求格式不正确。");
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) throw new ApiError(400, "视频上传请求格式不正确。");
    if (body.type === "blob.generate-client-token") {
      sameOrigin(request);
      const payload = body.payload as Record<string, unknown>;
      if (typeof payload.pathname !== "string" || !videoContentType(payload.pathname) ||
          (payload.multipart !== undefined && typeof payload.multipart !== "boolean") ||
          (payload.clientPayload != null && typeof payload.clientPayload !== "string")) throw new ApiError(400, "请选择 MP4、MOV 或 WebM 视频重新上传。");
    } else {
      // Blob callbacks do not carry a browser Origin. They must instead pass
      // the SDK's HMAC verification below, before onUploadCompleted can run.
      if (!/^[a-f0-9]{64}$/i.test(request.headers.get("x-vercel-signature") ?? "")) throw new ApiError(401, "视频上传回调验证失败。");
    }
    // handleUpload requires the static read-write token for signing; the SDK
    // cannot substitute the OIDC credentials used by server-side image uploads.
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new ApiError(503, "视频上传服务尚未连接，请稍后重试。");
    try {
      const response = await handleUpload({
        request,
        body: body as unknown as HandleUploadBody,
        onBeforeGenerateToken: async pathname => {
          const current = await user(request);
          sameOrigin(request);
          const contentType = videoContentType(pathname);
          if (!contentType) throw new ApiError(400, "视频路径格式不正确，请重新选择文件。");
          return {
            allowedContentTypes: [contentType],
            maximumSizeInBytes: MAX_VIDEO_BYTES,
            validUntil: Date.now() + 60 * 60 * 1000,
            addRandomSuffix: false,
            allowOverwrite: false,
            cacheControlMaxAge: 86400,
            tokenPayload: JSON.stringify({ kind: "transition-video", pathname, editor: current.displayName }),
          };
        },
        // The user explicitly saves the transition record after uploading.
        // A callback retry must never create or overwrite a trip record.
        onUploadCompleted: async () => {},
      });
      return json(response);
    } catch (error) {
      if (error instanceof Error && /(?:Missing|Invalid) callback signature/.test(error.message)) throw new ApiError(401, "视频上传回调验证失败。");
      throw error;
    }
  });
}
