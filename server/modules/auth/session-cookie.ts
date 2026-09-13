import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";

export const SESSION_COOKIE = "vault_session";

/** Absolute lifetime: a session never outlives this, however active. */
export const SESSION_ABSOLUTE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
/** Idle timeout: a session unused for this long is dead. */
export const SESSION_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
/** `last_seen_at` is written at most this often to keep reads cheap. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface SessionToken {
  /** Sent to the browser, never stored. */
  token: string;
  /** Stored; the only thing the database knows about the token. */
  tokenHash: string;
}

export function generateSessionToken(): SessionToken {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export interface CookiePolicy {
  /** `Secure` is set in production; local development runs over plain HTTP. */
  secure: boolean;
}

function attributes(policy: CookiePolicy, maxAgeSeconds: number): string {
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...(policy.secure ? ["Secure"] : []),
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

export function setSessionCookie(
  res: Response,
  token: string,
  policy: CookiePolicy,
): void {
  res.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; ${attributes(policy, Math.floor(SESSION_ABSOLUTE_LIFETIME_MS / 1000))}`,
  );
}

export function clearSessionCookie(res: Response, policy: CookiePolicy): void {
  res.append("Set-Cookie", `${SESSION_COOKIE}=; ${attributes(policy, 0)}`);
}

/** Reads the session token from the Cookie header; no cookie library needed. */
export function readSessionToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE}=`)) {
      const value = trimmed.slice(SESSION_COOKIE.length + 1);
      return /^[A-Za-z0-9_-]{20,128}$/.test(value) ? value : undefined;
    }
  }
  return undefined;
}
