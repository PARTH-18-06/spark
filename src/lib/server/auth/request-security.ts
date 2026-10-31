import "server-only";

import { constantTimeHashMatch } from "@/lib/server/auth/crypto";
import { ApiError } from "@/lib/server/http/errors";

export const CSRF_HEADER_NAME = "x-csrf-token" as const;

export function readSessionCookie(request: Request, cookieName: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    const name = segment.slice(0, separator).trim();
    if (name === cookieName) return decodeURIComponent(segment.slice(separator + 1).trim());
  }

  return null;
}

export function requireSessionCookie(request: Request, cookieName: string): string {
  const session = readSessionCookie(request, cookieName);
  if (!session) {
    throw new ApiError({
      code: "AUTH_REQUIRED",
      message: "Authentication is required",
    });
  }
  return session;
}

export function requireTrustedOrigin(request: Request, allowedOrigins: readonly string[]): string {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.includes(origin)) {
    throw new ApiError({
      code: "FORBIDDEN",
      message: "Request origin is not allowed",
    });
  }
  return origin;
}

export function requireCsrfHeader(request: Request): string {
  const token = request.headers.get(CSRF_HEADER_NAME)?.trim();
  if (!token) {
    throw new ApiError({
      code: "FORBIDDEN",
      message: "A valid CSRF token is required",
    });
  }
  return token;
}

export function requireSessionCsrf(request: Request, expectedHash: string): void {
  const supplied = requireCsrfHeader(request);
  if (!constantTimeHashMatch(supplied, expectedHash)) {
    throw new ApiError({ code: "FORBIDDEN", message: "A valid CSRF token is required" });
  }
}

export function clientAddressBucket(request: Request, trustProxy: boolean): string {
  if (!trustProxy) return "direct";
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}
