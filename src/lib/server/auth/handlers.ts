import "server-only";

import {
  authStateSchema,
  authenticatedStateSchema,
  saveStudentProfileInputSchema,
  signInInputSchema,
  studentProfileSchema,
} from "@/lib/server/contracts/tutor-schemas";
import { clearedSessionCookie, sessionCookie } from "@/lib/server/auth/cookies";
import { clientAddressBucket, readSessionCookie, requireSessionCsrf, requireTrustedOrigin } from "@/lib/server/auth/request-security";
import { ANONYMOUS_AUTH_STATE, AuthService, type SessionResolution } from "@/lib/server/auth/service";
import type { AuthDependencies } from "@/lib/server/auth/types";
import { ApiError } from "@/lib/server/http/errors";
import { errorResponse, noContent, ok } from "@/lib/server/http/responses";
import { parseJson, validateResponse } from "@/lib/server/http/validation";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store", Pragma: "no-cache" } as const;

function withCookie(response: Response, value: string): Response {
  response.headers.append("Set-Cookie", value);
  return response;
}

export function createAuthHandlers(dependencies: AuthDependencies) {
  const service = new AuthService(dependencies);
  const cookieOptions = (request: Request) => ({
    name: dependencies.config.cookieName,
    secure: dependencies.config.cookieSecure || new URL(request.url).protocol === "https:",
  });
  const clearCookie = (response: Response, request: Request) => withCookie(response, clearedSessionCookie(cookieOptions(request)));
  const sessionFrom = (request: Request) => readSessionCookie(request, dependencies.config.cookieName);
  const failure = (error: unknown) => {
    const response = errorResponse(error);
    for (const [name, value] of Object.entries(NO_STORE_HEADERS)) response.headers.set(name, value);
    return response;
  };

  return {
    async getCurrentUser(request: Request): Promise<Response> {
      try {
        const resolution = await service.resolve(sessionFrom(request));
        const body = resolution.kind === "authenticated" ? service.toState(resolution.value) : ANONYMOUS_AUTH_STATE;
        const response = ok(validateResponse(authStateSchema, body), { headers: NO_STORE_HEADERS });
        return resolution.kind === "anonymous" && resolution.clearCookie ? clearCookie(response, request) : response;
      } catch (error) {
        return failure(error);
      }
    },

    async signIn(request: Request): Promise<Response> {
      try {
        requireTrustedOrigin(request, dependencies.config.allowedOrigins);
        const input = await parseJson(request, signInInputSchema);
        const keys = service.loginKeys(input.email, clientAddressBucket(request, dependencies.config.trustProxy));
        const result = await service.signIn(input.email, input.password, keys);
        const response = ok(validateResponse(authenticatedStateSchema, result.state), { headers: NO_STORE_HEADERS });
        return withCookie(response, sessionCookie(cookieOptions(request), result.sessionToken, dependencies.config.sessionTtlSeconds));
      } catch (error) {
        return failure(error);
      }
    },

    async signOut(request: Request): Promise<Response> {
      const sessionToken = sessionFrom(request);
      if (!sessionToken) return clearCookie(noContent({ headers: NO_STORE_HEADERS }), request);
      let resolution: SessionResolution | undefined;
      try {
        requireTrustedOrigin(request, dependencies.config.allowedOrigins);
        resolution = await service.resolve(sessionToken);
        if (resolution.kind === "authenticated") {
          requireSessionCsrf(request, resolution.value.session.csrfTokenHash);
        }
        await service.signOut(resolution);
        return clearCookie(noContent({ headers: NO_STORE_HEADERS }), request);
      } catch (error) {
        const response = failure(error);
        return resolution?.kind === "anonymous" && resolution.clearCookie ? clearCookie(response, request) : response;
      }
    },

    async saveStudentProfile(request: Request): Promise<Response> {
      let resolution: SessionResolution | undefined;
      try {
        requireTrustedOrigin(request, dependencies.config.allowedOrigins);
        resolution = await service.resolve(sessionFrom(request));
        if (resolution.kind !== "authenticated") {
          throw new ApiError({ code: "AUTH_REQUIRED", message: "Authentication is required" });
        }
        requireSessionCsrf(request, resolution.value.session.csrfTokenHash);
        const input = await parseJson(request, saveStudentProfileInputSchema);
        const profile = await service.saveProfile(resolution.value, input);
        return ok(validateResponse(studentProfileSchema, profile), { headers: NO_STORE_HEADERS });
      } catch (error) {
        const response = failure(error);
        return resolution?.kind === "anonymous" && resolution.clearCookie ? clearCookie(response, request) : response;
      }
    },
  };
}

export type AuthHandlers = ReturnType<typeof createAuthHandlers>;
