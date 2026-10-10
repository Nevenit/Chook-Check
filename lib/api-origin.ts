export const PRODUCTION_API_ORIGIN =
  "https://chook-check-api.nevenit.workers.dev";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Resolve the build-time CHOOK_API_ORIGIN override. Only a loopback origin is
 * accepted, so a test build can target `wrangler dev` but never a remote host.
 */
export function resolveApiOrigin(value: string | undefined): string {
  if (!value) return PRODUCTION_API_ORIGIN;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`CHOOK_API_ORIGIN is not a URL: ${value}`);
  }
  if (
    url.protocol !== "http:" ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `CHOOK_API_ORIGIN must be a loopback origin such as http://localhost:8787: ${value}`,
    );
  }
  return url.origin;
}
