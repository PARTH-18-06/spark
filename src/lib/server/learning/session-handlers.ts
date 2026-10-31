import "server-only";

import type { AuthRuntimeConfig } from "@/lib/server/auth/types";
import { readSessionCookie, requireSessionCsrf, requireTrustedOrigin } from "@/lib/server/auth/request-security";
import { AuthService, type SessionResolution } from "@/lib/server/auth/service";
import { requireCompletedOnboarding, requireStudent } from "@/lib/server/auth/guards";
import { startSessionBodySchema, submitAttemptBodyForQuestionSchema, advanceSessionBodySchema, endSessionBodySchema, conceptsResponseSchema, sessionSnapshotSchema, attemptResultSchema } from "@/lib/server/contracts/tutor-schemas";
import { CHAPTER_ID, ELECTRICITY_CONCEPTS } from "@/contracts/tutor";
import { ApiError } from "@/lib/server/http/errors";
import { errorResponse, ok, created } from "@/lib/server/http/responses";
import { parseJson, validate, validateResponse } from "@/lib/server/http/validation";
import { StudentSessionService } from "@/lib/server/learning/session-service";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store", Pragma: "no-cache" } as const;
const mutationKey = (request: Request): string => {
  const key = request.headers.get("Idempotency-Key")?.trim();
  if (!key) throw new ApiError({ code: "VALIDATION_ERROR", message: "Idempotency-Key header is required", fieldErrors: { "Idempotency-Key": "Required for learning mutations" } });
  return key;
};

export interface StudentSessionHandlersDependencies {
  auth: AuthService;
  authConfig: AuthRuntimeConfig;
  sessions: StudentSessionService;
}

function pathOf(request: Request): string { return new URL(request.url).pathname; }
function failure(error: unknown): Response { const response = errorResponse(error); for (const [key, value] of Object.entries(NO_STORE_HEADERS)) response.headers.set(key, value); return response; }
function sessionToken(request: Request, config: AuthRuntimeConfig): string | null { return readSessionCookie(request, config.cookieName); }
async function authenticated(deps: StudentSessionHandlersDependencies, request: Request, requireOnboarding: boolean): Promise<NonNullable<Extract<Awaited<ReturnType<AuthService["resolve"]>>, { kind: "authenticated" }>['value']>> {
  const resolution = await deps.auth.resolve(sessionToken(request, deps.authConfig));
  if (resolution.kind !== "authenticated") throw new ApiError({ code: "AUTH_REQUIRED", message: "Authentication is required" });
  if (requireOnboarding) requireCompletedOnboarding(resolution.value.identity);
  else requireStudent(resolution.value.identity);
  return resolution.value;
}
export function createStudentSessionHandlers(deps: StudentSessionHandlersDependencies) {
  return {
    async getConcepts(request: Request): Promise<Response> {
      try {
        const auth = await authenticated(deps, request, false);
        const body = { chapterId: CHAPTER_ID, concepts: ELECTRICITY_CONCEPTS, progress: await deps.sessions.concepts(auth.identity.user.id) };
        return ok(validateResponse(conceptsResponseSchema, body), { headers: NO_STORE_HEADERS });
      } catch (error) { return failure(error); }
    },
    async startSession(request: Request): Promise<Response> {
      let resolution: SessionResolution | undefined;
      try {
        requireTrustedOrigin(request, deps.authConfig.allowedOrigins);
        resolution = await deps.auth.resolve(sessionToken(request, deps.authConfig));
        if (resolution.kind !== "authenticated") throw new ApiError({ code: "AUTH_REQUIRED", message: "Authentication is required" });
        requireCompletedOnboarding(resolution.value.identity); requireSessionCsrf(request, resolution.value.session.csrfTokenHash);
        const key = mutationKey(request); const body = await parseJson(request, startSessionBodySchema);
        const result = await deps.sessions.start(resolution.value.identity.user.id, { ...body, idempotencyKey: key, path: pathOf(request) });
        if (result.claim.kind === "in_progress") throw new ApiError({ code: "REQUEST_IN_PROGRESS", message: "The same request is already being processed", retryable: true, retryAfterSeconds: 1 });
        if (result.claim.kind === "replay") return ok(validateResponse(sessionSnapshotSchema, result.claim.body), { status: result.claim.status ?? 201, headers: NO_STORE_HEADERS });
        return created(validateResponse(sessionSnapshotSchema, result.snapshot), { headers: NO_STORE_HEADERS });
      } catch (error) { return failure(error); }
    },
    async getSession(request: Request, sessionId: string): Promise<Response> {
      try {
        const auth = await authenticated(deps, request, true); const snapshot = await deps.sessions.session(auth.identity.user.id, sessionId);
        if (!snapshot) throw new ApiError({ code: "NOT_FOUND", message: "Session not found" });
        return ok(validateResponse(sessionSnapshotSchema, snapshot), { headers: NO_STORE_HEADERS });
      } catch (error) { return failure(error); }
    },
    async submitAttempt(request: Request, sessionId: string): Promise<Response> {
      try {
        requireTrustedOrigin(request, deps.authConfig.allowedOrigins);
        const auth = await authenticated(deps, request, true); requireSessionCsrf(request, auth.session.csrfTokenHash); const key = mutationKey(request);
        const raw = await parseJson(request, submitAttemptBodyForQuestionSchema(await currentQuestion(deps, auth.identity.user.id, sessionId)));
        if (raw.sessionId !== sessionId) throw new ApiError({ code: "VALIDATION_ERROR", message: "sessionId must match the path", fieldErrors: { sessionId: "Must match URL" } });
        const result = await deps.sessions.submit(auth.identity.user.id, { ...raw, idempotencyKey: key, path: pathOf(request) });
        if (result.claim.kind === "in_progress") throw new ApiError({ code: "REQUEST_IN_PROGRESS", message: "The same request is already being processed", retryable: true, retryAfterSeconds: 1 });
        if (result.claim.kind === "replay") return ok(validateResponse(attemptResultSchema, result.claim.body), { status: result.claim.status ?? 200, headers: NO_STORE_HEADERS });
        const body = { ...result.result.feedback, session: result.result.session, rewards: { account: null, grants: [] } as const };
        return ok(validateResponse(attemptResultSchema, body), { headers: NO_STORE_HEADERS });
      } catch (error) { return failure(error); }
    },
    async advanceSession(request: Request, sessionId: string): Promise<Response> {
      try {
        requireTrustedOrigin(request, deps.authConfig.allowedOrigins); const auth = await authenticated(deps, request, true); requireSessionCsrf(request, auth.session.csrfTokenHash); const key = mutationKey(request); const raw = await parseJson(request, advanceSessionBodySchema);
        if (raw.sessionId !== sessionId) throw new ApiError({ code: "VALIDATION_ERROR", message: "sessionId must match the path", fieldErrors: { sessionId: "Must match URL" } });
        const result = await deps.sessions.advance(auth.identity.user.id, { ...raw, idempotencyKey: key, path: pathOf(request) });
        if (result.claim.kind === "in_progress") throw new ApiError({ code: "REQUEST_IN_PROGRESS", message: "The same request is already being processed", retryable: true, retryAfterSeconds: 1 });
        if (result.claim.kind === "replay") return ok(validateResponse(sessionSnapshotSchema, result.claim.body), { status: result.claim.status ?? 200, headers: NO_STORE_HEADERS });
        return ok(validateResponse(sessionSnapshotSchema, result.snapshot), { headers: NO_STORE_HEADERS });
      } catch (error) { return failure(error); }
    },
    async endSession(request: Request, sessionId: string): Promise<Response> {
      try {
        requireTrustedOrigin(request, deps.authConfig.allowedOrigins); const auth = await authenticated(deps, request, true); requireSessionCsrf(request, auth.session.csrfTokenHash); const key = mutationKey(request); const raw = await parseJson(request, endSessionBodySchema);
        if (raw.sessionId !== sessionId) throw new ApiError({ code: "VALIDATION_ERROR", message: "sessionId must match the path", fieldErrors: { sessionId: "Must match URL" } });
        const result = await deps.sessions.end(auth.identity.user.id, { ...raw, idempotencyKey: key, path: pathOf(request) });
        if (result.claim.kind === "in_progress") throw new ApiError({ code: "REQUEST_IN_PROGRESS", message: "The same request is already being processed", retryable: true, retryAfterSeconds: 1 });
        if (result.claim.kind === "replay") return ok(validateResponse(sessionSnapshotSchema, result.claim.body), { status: result.claim.status ?? 200, headers: NO_STORE_HEADERS });
        return ok(validateResponse(sessionSnapshotSchema, result.snapshot), { headers: NO_STORE_HEADERS });
      } catch (error) { return failure(error); }
    },
  };
}

async function currentQuestion(deps: StudentSessionHandlersDependencies, studentId: string, sessionId: string) {
  const snapshot = await deps.sessions.session(studentId, sessionId);
  if (!snapshot || !snapshot.currentQuestion) throw new ApiError({ code: "NOT_FOUND", message: "Session or current question not found" });
  return snapshot.currentQuestion;
}

