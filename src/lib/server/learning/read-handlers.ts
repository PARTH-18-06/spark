import "server-only";

import type { AuthRuntimeConfig, AuthStore } from "@/lib/server/auth/types";
import { z } from "zod";
import { AuthService } from "@/lib/server/auth/service";
import { readSessionCookie } from "@/lib/server/auth/request-security";
import { requireAssignedClass, requireCompletedOnboarding, requireRosterAccess, requireTeacher } from "@/lib/server/auth/guards";
import { ApiError } from "@/lib/server/http/errors";
import { errorResponse, ok } from "@/lib/server/http/responses";
import { validate, validateResponse } from "@/lib/server/http/validation";
import { pageInputSchema, progressResponseSchema, revisionQueueSchema, studentDashboardSchema, pageSchema, attemptHistoryItemSchema, classDashboardSchema, teacherStudentDetailSchema, classSummarySchema } from "@/lib/server/contracts/tutor-schemas";
import type { StudentReadRepository } from "@/lib/server/learning/read-repository";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store", Pragma: "no-cache" } as const;

export interface StudentReadHandlersDependencies {
  auth: AuthService;
  authStore: AuthStore;
  authConfig: AuthRuntimeConfig;
  reads: StudentReadRepository;
}

function fail(error: unknown): Response { const response = errorResponse(error); for (const [key, value] of Object.entries(NO_STORE_HEADERS)) response.headers.set(key, value); return response; }
async function identity(deps: StudentReadHandlersDependencies, request: Request) {
  const resolution = await deps.auth.resolve(readSessionCookie(request, deps.authConfig.cookieName));
  if (resolution.kind !== "authenticated") throw new ApiError({ code: "AUTH_REQUIRED", message: "Authentication is required" });
  return resolution.value;
}
function page(request: Request): { offset: number; limit: number } {
  const url = new URL(request.url);
  const parsed = validate(pageInputSchema, { ...(url.searchParams.get("cursor") ? { cursor: url.searchParams.get("cursor") } : {}), ...(url.searchParams.get("limit") ? { limit: Number(url.searchParams.get("limit")) } : {}) });
  if (parsed.cursor && !/^\d+$/.test(parsed.cursor)) throw new ApiError({ code: "VALIDATION_ERROR", message: "Cursor is invalid", fieldErrors: { cursor: "Cursor must be an opaque page cursor" } });
  return { offset: parsed.cursor ? Number(parsed.cursor) : 0, limit: parsed.limit ?? 20 };
}

export function createStudentReadHandlers(deps: StudentReadHandlersDependencies) {
  return {
    async getStudentDashboard(request: Request): Promise<Response> { try { const value = await identity(deps, request); requireCompletedOnboarding(value.identity); return ok(validateResponse(studentDashboardSchema, await deps.reads.getStudentDashboard(value.identity.user.id)), { headers: NO_STORE_HEADERS }); } catch (error) { return fail(error); } },
    async getRevisionQueue(request: Request): Promise<Response> { try { const value = await identity(deps, request); requireCompletedOnboarding(value.identity); return ok(validateResponse(revisionQueueSchema, await deps.reads.getRevisionQueue(value.identity.user.id)), { headers: NO_STORE_HEADERS }); } catch (error) { return fail(error); } },
    async getProgress(request: Request): Promise<Response> { try { const value = await identity(deps, request); requireCompletedOnboarding(value.identity); const bounds = page(request); return ok(validateResponse(progressResponseSchema, await deps.reads.getProgress(value.identity.user.id, bounds.offset, bounds.limit)), { headers: NO_STORE_HEADERS }); } catch (error) { return fail(error); } },
    async getAttemptHistory(request: Request): Promise<Response> { try { const value = await identity(deps, request); requireCompletedOnboarding(value.identity); const bounds = page(request); return ok(validateResponse(pageSchema(attemptHistoryItemSchema), await deps.reads.getAttemptHistory(value.identity.user.id, bounds.offset, bounds.limit)), { headers: NO_STORE_HEADERS }); } catch (error) { return fail(error); } },
    async getClasses(request: Request): Promise<Response> { try { const value = await identity(deps, request); requireTeacher(value.identity); return ok(validateResponse(z.array(classSummarySchema), await deps.reads.getClasses(value.identity.user.id)), { headers: NO_STORE_HEADERS }); } catch (error) { return fail(error); } },
    async getClassDashboard(request: Request, classId: string): Promise<Response> { try { const value = await identity(deps, request); await requireAssignedClass(deps.authStore, value.identity, classId); return ok(validateResponse(classDashboardSchema, await deps.reads.getClassDashboard(value.identity.user.id, classId)), { headers: NO_STORE_HEADERS }); } catch (error) { return fail(error); } },
    async getStudentDetail(request: Request, classId: string, studentId: string): Promise<Response> { try { const value = await identity(deps, request); await requireRosterAccess(deps.authStore, value.identity, classId, studentId); return ok(validateResponse(teacherStudentDetailSchema, await deps.reads.getStudentDetail(value.identity.user.id, classId, studentId)), { headers: NO_STORE_HEADERS }); } catch (error) { return fail(error); } },
  };
}

