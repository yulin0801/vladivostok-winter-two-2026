import { get, put } from "@vercel/blob";

export const tripImageStore = {
  async put(id: string, bytes: Uint8Array, options: { httpMetadata: { contentType: string; cacheControl?: string } }) {
    // UUID pathnames preserve existing /api/files/<id> references. The app
    // authorizes uploads; reads are public as requested for the travel plan.
    return put(id, Buffer.from(bytes), {
      access: "public",
      contentType: options.httpMetadata.contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 86400,
    });
  },

  async get(id: string) {
    // Let the SDK manage OIDC token refresh. Do not copy or explicitly pass
    // VERCEL_OIDC_TOKEN; a connected store or read-write token is read by it.
    const result = await get(id, { access: "public" });
    if (!result || result.statusCode !== 200) return null;
    return {
      body: result.stream,
      httpMetadata: { contentType: result.blob.contentType },
      httpEtag: result.blob.etag,
    };
  },
};
