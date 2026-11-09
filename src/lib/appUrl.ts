// The app's stable public URL. On Vercel, a request can arrive on a
// per-deployment address (drawme-<hash>-<team>.vercel.app) that changes on
// every deploy and sits behind Vercel Authentication, which MCP clients
// can't pass. Prefer, in order: an explicit NEXT_PUBLIC_APP_URL, Vercel's
// production domain, then the request's own origin (local development).
export function publicAppUrl(requestOrigin: string) {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return requestOrigin;
}
