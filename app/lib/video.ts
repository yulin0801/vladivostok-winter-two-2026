export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const videoTypes = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" } as const;
const videoPath = /^videos\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(mp4|mov|webm)$/;

export function videoContentType(pathname: string): string | null {
  const match = videoPath.exec(pathname);
  return match ? videoTypes[match[1] as keyof typeof videoTypes] : null;
}

export function validUploadedVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash &&
      /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname) &&
      url.href === value && !!videoContentType(url.pathname.slice(1));
  } catch { return false; }
}
