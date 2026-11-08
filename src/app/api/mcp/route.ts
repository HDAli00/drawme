import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { hashToken, TOKEN_PREFIX, type TokenScope } from "@/lib/apiTokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMcpServer } from "@/lib/mcp/server";
import { publicAppUrl } from "@/lib/appUrl";

// Remote MCP endpoint (Streamable HTTP, stateless). Clients authenticate with
// a personal access token created on /settings:
//   Authorization: Bearer drawme_pat_...

function unauthorized(message: string) {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="drawme"' } },
  );
}

async function handle(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || !token.startsWith(TOKEN_PREFIX)) {
    return unauthorized("Missing or malformed drawme access token.");
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("api_tokens")
    .select("id, owner_id, scope, expires_at, last_used_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!row || (row.expires_at && new Date(row.expires_at) < new Date())) {
    return unauthorized("Invalid, revoked or expired drawme access token.");
  }

  // Record usage at most once a minute per token.
  if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 60_000) {
    void supabase
      .from("api_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id)
      .then(() => undefined);
  }

  const server = createMcpServer({
    supabase,
    userId: row.owner_id,
    scope: row.scope as TokenScope,
    appUrl: publicAppUrl(new URL(request.url).origin),
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: each request stands alone
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // JSON responses are complete once handleRequest resolves.
    void server.close();
  }
}

export const POST = handle;
export const DELETE = handle;

// Stateless server: no server-initiated SSE stream.
export function GET() {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
    { status: 405, headers: { Allow: "POST" } },
  );
}
