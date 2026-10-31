import { describe, expect, it, vi } from "vitest";

import { createStudentReadHandlers } from "@/lib/server/learning/read-handlers";
import type { AuthService } from "@/lib/server/auth/service";
import type { AuthRuntimeConfig, AuthStore, IdentityRecord } from "@/lib/server/auth/types";
import type { StudentReadRepository } from "@/lib/server/learning/read-repository";

const config: AuthRuntimeConfig = {
  allowedOrigins: ["https://spark.test"],
  cookieName: "spark_session",
  cookieSecure: true,
  sessionTtlSeconds: 3600,
  refreshSkewSeconds: 60,
  rateLimitSecret: "r".repeat(32),
  trustProxy: false,
};

const profile = {
  displayName: "Student",
  chapterId: "class-10-physics-electricity" as const,
  examDate: null,
  timeZone: "Asia/Kolkata",
  onboardingComplete: true,
};

function identity(roles: ("student" | "teacher")[], studentProfile: IdentityRecord["studentProfile"] = profile): IdentityRecord {
  return { user: { id: "user-1", displayName: "User", roles }, studentProfile };
}

function fixture(resolved: { kind: "anonymous" } | { kind: "authenticated"; value: { identity: IdentityRecord; session: { csrfTokenHash: string }; csrfToken: string; accessToken: string } }, assigned = true) {
  const auth = { resolve: async () => resolved } as unknown as AuthService;
  const store = {
    teacherHasClass: vi.fn(async () => assigned),
    teacherHasStudent: vi.fn(async () => assigned),
  } as unknown as AuthStore;
  const reads = {
    getStudentDashboard: vi.fn(), getRevisionQueue: vi.fn(), getProgress: vi.fn(),
    getAttemptHistory: vi.fn(), getClasses: vi.fn(), getClassDashboard: vi.fn(), getStudentDetail: vi.fn(),
  } as unknown as StudentReadRepository;
  return { handlers: createStudentReadHandlers({ auth, authStore: store, authConfig: config, reads }), store, reads };
}

const authenticatedStudent = { kind: "authenticated" as const, value: { identity: identity(["student"]), session: { csrfTokenHash: "hash" }, csrfToken: "csrf", accessToken: "access" } };
const authenticatedTeacher = { kind: "authenticated" as const, value: { identity: identity(["teacher"], null), session: { csrfTokenHash: "hash" }, csrfToken: "csrf", accessToken: "access" } };

describe("student read handler authorization and validation", () => {
  it("rejects anonymous dashboard requests with the contract error body", async () => {
    const { handlers } = fixture({ kind: "anonymous" });
    const response = await handlers.getStudentDashboard(new Request("https://spark.test/api/v1/student/dashboard"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "AUTH_REQUIRED", retryable: false, requestId: expect.any(String) } });
  });

  it("rejects a student attempting the teacher class list", async () => {
    const { handlers, reads } = fixture(authenticatedStudent);
    const response = await handlers.getClasses(new Request("https://spark.test/api/v1/teacher/classes"));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
    expect(reads.getClasses).not.toHaveBeenCalled();
  });

  it("checks class assignment before a teacher dashboard read", async () => {
    const { handlers, store, reads } = fixture(authenticatedTeacher, false);
    const response = await handlers.getClassDashboard(new Request("https://spark.test/api/v1/teacher/classes/class-1"), "class-1");
    expect(response.status).toBe(403);
    expect(store.teacherHasClass).toHaveBeenCalledWith("user-1", "class-1");
    expect(reads.getClassDashboard).not.toHaveBeenCalled();
  });

  it("rejects malformed pagination before calling the history repository", async () => {
    const { handlers, reads } = fixture(authenticatedStudent);
    const response = await handlers.getAttemptHistory(new Request("https://spark.test/api/v1/attempts?cursor=not-a-cursor"));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(reads.getAttemptHistory).not.toHaveBeenCalled();
  });
});
