// Dependency-free so Next.js proxy.ts can share the exact API origin policy.
export function getAllowedFrontendOrigin(): string | null {
  const configured = process.env.TRIP_FRONTEND_ORIGIN;
  if (!configured) return null;
  try {
    const parsed = new URL(configured);
    // A single canonical HTTPS origin only: no wildcard, path, userinfo,
    // trailing slash, query, fragment, comma-separated list or null origin.
    if (parsed.protocol !== "https:" || configured !== parsed.origin || !parsed.hostname || parsed.hostname.includes("*")) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isAllowedFrontendOrigin(origin: string | null): boolean {
  const allowed = getAllowedFrontendOrigin();
  return !!allowed && origin === allowed;
}
