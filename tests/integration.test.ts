import { randomUUID } from "node:crypto";

import { config as loadEnvironment } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  apiErrorBodySchema,
  attemptHistoryItemSchema,
  attemptResultSchema,
  authStateSchema,
  authenticatedStateSchema,
  classDashboardSchema,
  classSummarySchema,
  conceptsResponseSchema,
  pageSchema,
  progressResponseSchema,
  revisionQueueSchema,
  sessionSnapshotSchema,
  studentDashboardSchema,
  studentProfileSchema,
  teacherStudentDetailSchema,
} from "@/lib/server/contracts/tutor-schemas";

loadEnvironment({ path: ".env.local", quiet: true });

const requiredNames = [
  "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GROQ_API_KEY",
  "GROQ_EVALUATION_MODEL", "GROQ_GENERATION_MODEL", "AUTH_ALLOWED_ORIGINS",
  "AUTH_TOKEN_ENCRYPTION_KEY", "AUTH_RATE_LIMIT_SECRET", "SPARK_ENVIRONMENT_NAME",
  "SPARK_INTEGRATION_ENABLED", "SPARK_INTEGRATION_BASE_URL", "SPARK_INTEGRATION_ORIGIN",
  "DEV_TEACHER_EMAIL", "DEV_TEACHER_PASSWORD", "DEV_TEACHER_UNASSIGNED_EMAIL",
  "DEV_TEACHER_UNASSIGNED_PASSWORD", "DEV_STUDENT_NEW_EMAIL", "DEV_STUDENT_NEW_PASSWORD",
  "DEV_STUDENT_RETURNING_EMAIL", "DEV_STUDENT_RETURNING_PASSWORD",
];

function requireIntegrationConfiguration(): void {
  const missing = requiredNames.filter((name) => !process.env[name]?.trim());
  if (process.env.SPARK_INTEGRATION_ENABLED !== "true") {
    throw new Error("BLOCKED: set SPARK_INTEGRATION_ENABLED=true only for an approved local/dedicated integration target");
  }
  if (missing.length) throw new Error(`BLOCKED: missing integration configuration variables: ${missing.join(", ")}`);
  const environment = process.env.SPARK_ENVIRONMENT_NAME!.trim().toLowerCase();
  if (environment === "prod" || environment === "production") throw new Error("BLOCKED: production-like integration targets are not allowed");
}

type Schema<T> = { parse(value: unknown): T };

class CookieJar {
  private readonly values = new Map<string, string>();
  set(name: string, value: string): void { this.values.set(name, value); }
  header(): string { return [...this.values].map(([name, value]) => `${name}=${value}`).join("; "); }
  absorb(response: Response): void {
    const setCookie = response.headers.get("set-cookie");
    if (!setCookie) return;
    const pair = setCookie.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator < 1) return;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!value || /max-age=0/i.test(setCookie) || /expires=Thu, 01 Jan 1970/i.test(setCookie)) this.values.delete(name);
    else this.values.set(name, value);
  }
}

type HttpResult = { response: Response; body: unknown };

const baseUrl = () => process.env.SPARK_INTEGRATION_BASE_URL!.replace(/\/+$/, "");
const origin = () => process.env.SPARK_INTEGRATION_ORIGIN!;

async function http(jar: CookieJar, path: string, init: RequestInit = {}): Promise<HttpResult> {
  const headers = new Headers(init.headers);
  if (jar.header()) headers.set("cookie", jar.header());
  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers });
  jar.absorb(response);
  const body = response.status === 204 ? null : await response.json().catch(() => undefined);
  return { response, body };
}

function success<T>(result: HttpResult, status: number, schema: Schema<T>, label: string): T {
  if (result.response.status !== status) {
    const code = result.body && typeof result.body === "object" && "error" in result.body && result.body.error && typeof result.body.error === "object" && "code" in result.body.error ? String(result.body.error.code) : "unknown";
    throw new Error(`${label}: HTTP ${result.response.status} (${code})`);
  }
  expect(result.response.status, label).toBe(status);
  if (result.body && typeof result.body === "object" && "data" in result.body) throw new Error(`${label}: success body was wrapped`);
  try { return schema.parse(result.body); } catch { throw new Error(`${label}: response failed the v1.1.0 runtime schema`); }
}

function noContent(result: HttpResult, label: string): void { expect(result.response.status, label).toBe(204); expect(result.body, label).toBeNull(); }

function error(result: HttpResult, status: number, code: string, label: string): void {
  expect(result.response.status, label).toBe(status);
  const parsed = apiErrorBodySchema.parse(result.body);
  expect(parsed.error.code, label).toBe(code);
}

function mutationHeaders(jar: CookieJar, csrf: string, key: string, extra: Record<string, string> = {}) {
  return { origin: origin(), "x-csrf-token": csrf, "Idempotency-Key": key, "content-type": "application/json", ...extra };
}

describe("approved real Spark integration", () => {
  it("exercises all 17 tutor operations and real provider/database boundaries", async () => {
    requireIntegrationConfiguration();
    const runId = randomUUID();
    const verified = new Set<string>();
    const mark = (name: string) => { verified.add(name); };
    const student = new CookieJar();

    const anonymous = await http(student, "/api/v1/auth/me");
    const anonymousState = success(anonymous, 200, authStateSchema, "anonymous auth state");
    expect(anonymousState.authenticated).toBe(false);
    mark("getCurrentUser");

    const signedIn = await http(student, "/api/v1/auth/sign-in", {
      method: "POST", headers: { origin: origin(), "content-type": "application/json" },
      body: JSON.stringify({ email: process.env.DEV_STUDENT_NEW_EMAIL, password: process.env.DEV_STUDENT_NEW_PASSWORD }),
    });
    const studentState = success(signedIn, 200, authenticatedStateSchema, "student sign-in");
    const csrf = studentState.csrfToken;
    mark("signIn");

    const current = success(await http(student, "/api/v1/auth/me"), 200, authStateSchema, "authenticated auth state");
    expect(current.authenticated).toBe(true);
    mark("getCurrentUser");

    const profile = success(await http(student, "/api/v1/me/profile", {
      method: "PUT", headers: mutationHeaders(student, csrf, `integration-${runId}-profile`),
      body: JSON.stringify({ displayName: `Spark Integration ${runId.slice(0, 8)}`, chapterId: "class-10-physics-electricity", examDate: null, timeZone: "Asia/Kolkata" }),
    }), 200, studentProfileSchema, "student profile/onboarding");
    expect(profile.onboardingComplete).toBe(true);
    mark("saveStudentProfile");

    const dashboardBefore = success(await http(student, "/api/v1/student/dashboard"), 200, studentDashboardSchema, "student dashboard");
    if (dashboardBefore.activeSession) throw new Error("PRECONDITION: synthetic student already has an active session; use a fresh approved integration account");
    mark("getStudentDashboard");
    success(await http(student, "/api/v1/concepts"), 200, conceptsResponseSchema, "concept discovery"); mark("getConcepts");
    success(await http(student, "/api/v1/revision"), 200, revisionQueueSchema, "revision queue"); mark("getRevisionQueue");
    success(await http(student, "/api/v1/progress?limit=20"), 200, progressResponseSchema, "progress"); mark("getProgress");
    success(await http(student, "/api/v1/attempts?limit=20"), 200, pageSchema(attemptHistoryItemSchema), "attempt history"); mark("getAttemptHistory");

    const started = success(await http(student, "/api/v1/sessions", {
      method: "POST", headers: mutationHeaders(student, csrf, `integration-${runId}-start`),
      body: JSON.stringify({ mode: "practice", conceptId: "resistance-and-ohms-law" }),
    }), 201, sessionSnapshotSchema, "start session");
    mark("startSession");
    const sessionId = started.id;
    const reloaded = success(await http(student, `/api/v1/sessions/${sessionId}`), 200, sessionSnapshotSchema, "session reload");
    expect(reloaded.id).toBe(sessionId); mark("getSession");
    if (!reloaded.currentQuestion) throw new Error("Session did not return a current question");
    const question = reloaded.currentQuestion;
    const answer = question.format === "multiple_choice"
      ? { sessionId, questionId: question.id, expectedSessionVersion: reloaded.version, finalAnswerText: "", reasoningText: "I selected the option using the physics relationship.", selectedOptionId: question.options[0]!.id }
      : { sessionId, questionId: question.id, expectedSessionVersion: reloaded.version, finalAnswerText: "I = V/R", reasoningText: "I use the relationship I = V/R to calculate current." };
    const answerKey = `integration-${runId}-attempt-1`;
    let attempt = success(await http(student, `/api/v1/sessions/${sessionId}/attempts`, {
      method: "POST", headers: mutationHeaders(student, csrf, answerKey), body: JSON.stringify(answer),
    }), 200, attemptResultSchema, "submit attempt");
    mark("submitAttempt");
    const replay = success(await http(student, `/api/v1/sessions/${sessionId}/attempts`, {
      method: "POST", headers: mutationHeaders(student, csrf, answerKey), body: JSON.stringify(answer),
    }), 200, attemptResultSchema, "attempt replay");
    expect(replay.attemptId).toBe(attempt.attemptId);
    if (attempt.session.phase === "clarification") {
      const clarification = { sessionId, questionId: question.id, expectedSessionVersion: attempt.session.version, finalAnswerText: "The current is voltage divided by resistance.", reasoningText: "I apply Ohm's law.", clarificationOfAttemptId: attempt.attemptId };
      attempt = success(await http(student, `/api/v1/sessions/${sessionId}/attempts`, {
        method: "POST", headers: mutationHeaders(student, csrf, `integration-${runId}-attempt-2`), body: JSON.stringify(clarification),
      }), 200, attemptResultSchema, "clarification attempt");
    }
    if (attempt.session.phase !== "feedback") throw new Error("Real evaluator did not produce a graded feedback phase needed for advance verification");
    let terminal = success(await http(student, `/api/v1/sessions/${sessionId}/advance`, {
      method: "POST", headers: mutationHeaders(student, csrf, `integration-${runId}-advance`), body: JSON.stringify({ sessionId, expectedSessionVersion: attempt.session.version }),
    }), 200, sessionSnapshotSchema, "advance session");
    mark("advanceSession");
    let endSessionId = sessionId;
    if (terminal.status === "completed") {
      const second = success(await http(student, "/api/v1/sessions", {
        method: "POST", headers: mutationHeaders(student, csrf, `integration-${runId}-start-2`),
        body: JSON.stringify({ mode: "practice", conceptId: "resistance-and-ohms-law" }),
      }), 201, sessionSnapshotSchema, "second start for end verification");
      endSessionId = second.id;
      terminal = second;
    }
    const ended = success(await http(student, `/api/v1/sessions/${endSessionId}/end`, {
      method: "POST", headers: mutationHeaders(student, csrf, `integration-${runId}-end`), body: JSON.stringify({ sessionId: endSessionId, expectedSessionVersion: terminal.version }),
    }), 200, sessionSnapshotSchema, "end session");
    expect(ended.status).toBe("abandoned"); mark("endSession");
    const finalSession = success(await http(student, `/api/v1/sessions/${sessionId}`), 200, sessionSnapshotSchema, "terminal session reload");
    expect(finalSession.id).toBe(sessionId);

    const finalDashboard = success(await http(student, "/api/v1/student/dashboard"), 200, studentDashboardSchema, "post-session dashboard");
    expect(finalDashboard.recentSessions.some((item) => item.id === sessionId)).toBe(true);
    const finalHistory = success(await http(student, "/api/v1/attempts?limit=20"), 200, pageSchema(attemptHistoryItemSchema), "post-session history");
    expect(finalHistory.items.some((item) => item.sessionId === sessionId)).toBe(true);

    error(await http(student, "/api/v1/teacher/classes"), 403, "FORBIDDEN", "student wrong-role request");
    const missingCsrf = await http(student, "/api/v1/me/profile", { method: "PUT", headers: { origin: origin(), "content-type": "application/json" }, body: JSON.stringify({ displayName: "Should not mutate", chapterId: "class-10-physics-electricity", examDate: null, timeZone: "Asia/Kolkata" }) });
    error(missingCsrf, 403, "FORBIDDEN", "missing CSRF");
    const wrongOrigin = await http(student, "/api/v1/sessions", { method: "POST", headers: mutationHeaders(student, csrf, `integration-${runId}-wrong-origin`, { origin: "https://not-approved.invalid" }), body: JSON.stringify({ mode: "practice", conceptId: "resistance-and-ohms-law" }) });
    error(wrongOrigin, 403, "FORBIDDEN", "disallowed origin");

    const invalid = new CookieJar(); invalid.set("spark_session", "invalid-session-handle");
    error(await http(invalid, "/api/v1/student/dashboard"), 401, "AUTH_REQUIRED", "invalid session");
    const returning = new CookieJar();
    const returningState = success(await http(returning, "/api/v1/auth/sign-in", { method: "POST", headers: { origin: origin(), "content-type": "application/json" }, body: JSON.stringify({ email: process.env.DEV_STUDENT_RETURNING_EMAIL, password: process.env.DEV_STUDENT_RETURNING_PASSWORD }) }), 200, authenticatedStateSchema, "second student sign-in");
    error(await http(returning, `/api/v1/sessions/${sessionId}`), 404, "NOT_FOUND", "cross-student session access");

    const teacher = new CookieJar();
    const teacherState = success(await http(teacher, "/api/v1/auth/sign-in", { method: "POST", headers: { origin: origin(), "content-type": "application/json" }, body: JSON.stringify({ email: process.env.DEV_TEACHER_EMAIL, password: process.env.DEV_TEACHER_PASSWORD }) }), 200, authenticatedStateSchema, "assigned teacher sign-in");
    const classes = success(await http(teacher, "/api/v1/teacher/classes"), 200, z.array(classSummarySchema), "teacher class list");
    if (!classes[0]) throw new Error("PRECONDITION: assigned teacher has no provisioned class");
    const classId = classes[0].id;
    success(await http(teacher, `/api/v1/teacher/classes/${classId}`), 200, classDashboardSchema, "teacher class dashboard"); mark("getClassDashboard");
    success(await http(teacher, `/api/v1/teacher/classes/${classId}/students/${studentState.user.id}`), 200, teacherStudentDetailSchema, "teacher student detail"); mark("getStudentDetail"); mark("getClasses");

    const unassigned = new CookieJar();
    const unassignedState = success(await http(unassigned, "/api/v1/auth/sign-in", { method: "POST", headers: { origin: origin(), "content-type": "application/json" }, body: JSON.stringify({ email: process.env.DEV_TEACHER_UNASSIGNED_EMAIL, password: process.env.DEV_TEACHER_UNASSIGNED_PASSWORD }) }), 200, authenticatedStateSchema, "unassigned teacher sign-in");
    error(await http(unassigned, `/api/v1/teacher/classes/${classId}`), 403, "FORBIDDEN", "unassigned teacher class access");
    error(await http(unassigned, `/api/v1/teacher/classes/${classId}/students/${studentState.user.id}`), 403, "FORBIDDEN", "unassigned teacher student access");

    const anonClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const restrictedRpc = await anonClient.rpc("spark_get_student_dashboard", { p_student_id: studentState.user.id });
    expect(restrictedRpc.error, "browser role RPC denial").toBeTruthy();
    const privateTable = await anonClient.from("question_rubrics").select("question_id").limit(1);
    expect(privateTable.error, "private rubric denial").toBeTruthy();

    noContent(await http(student, "/api/v1/auth/sign-out", { method: "POST", headers: mutationHeaders(student, csrf, `integration-${runId}-signout`) }), "student sign-out");
    mark("signOut");
    const afterSignOut = success(await http(student, "/api/v1/auth/me"), 200, authStateSchema, "post-sign-out auth state");
    expect(afterSignOut.authenticated).toBe(false);
    expect(returningState.authenticated && teacherState.authenticated && unassignedState.authenticated).toBe(true);

    const expected = new Set(["getCurrentUser", "signIn", "signOut", "saveStudentProfile", "getStudentDashboard", "getConcepts", "startSession", "getSession", "submitAttempt", "advanceSession", "endSession", "getRevisionQueue", "getProgress", "getAttemptHistory", "getClasses", "getClassDashboard", "getStudentDetail"]);
    expect(verified).toEqual(expected);
    console.log("Integration PASS: all 17 tutor operations exercised through real HTTP/Auth/PostgREST boundaries; secrets and private payloads were not logged.");
  });
});
