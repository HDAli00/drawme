import { createHash, randomBytes } from "node:crypto";

export const TOKEN_PREFIX = "drawme_pat_";

export type TokenScope = "read" | "read_write";

export type ApiToken = {
  id: string;
  name: string;
  token_prefix: string;
  scope: TokenScope;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
};

export function generateToken() {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, TOKEN_PREFIX.length + 6) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
