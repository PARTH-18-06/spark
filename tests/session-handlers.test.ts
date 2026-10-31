import "./support/server-only";

import { describe, expect, it } from "vitest";

import { sha256 } from "@/lib/server/auth/crypto";
import { createStudentSessionHandlers } from "@/lib/server/learning/session-handlers";
import { InMemorySessionRepository, StudentSessionService } from "@/lib/server/learning/session-service";
import type { BankQuestion } from "@/lib/server/learning/selection";
import type { TrustedRubric, EvaluationDecision } from "@/lib/server/evaluation/types";
import type { AuthService } from "@/lib/server/auth/service";

const ORIGIN = "https://spark.test";
const bank: BankQuestion[] = [{ id: "q1", conceptId: "resistance-and-ohms-law", format: "free_response", difficulty: "easy", prompt: "Explain Ohm's law." }];
const rubrics = new Map<string, TrustedRubric>([["q1", { questionId: "q1", rubricVersion: 1, correctAnswer: { acceptedExpression: "V=IR" }, workedSolution: "private", reasoningRubric: { required: ["V=IR"] }, numericAnswer: null, numericTolerance: null, expectedUnit: null, supportedMisconceptionCodes: [] }]]);

function fixture() {
  const repository = new InMemorySessionRepository({ bank, rubrics, now: () => new Date("2026-10-31T09:00:00.000Z") });
  const decision: EvaluationDecision = { status: "correct", finalAnswerCorrect: true, reasoningStatus: "sound", feedback: "Correct.", misconception: null, clarificationPrompt: null, deterministicFinalAnswer: true };
  const service = new StudentSessionService({ repository, bank, rubrics, misconceptionCatalog: [], evaluator: { evaluate: async () => decision }, now: () => new Date("2026-10-31T09:00:00.000Z") });
  const auth = { resolve: async () => ({ kind: "authenticated" as const, value: { session: { csrfTokenHash: sha256("csrf") }, identity: { user: { id: "student-1", displayName: "Student", roles: ["student"] as const }, studentProfile: { displayName: "Student", chapterId: "class-10-physics-electricity" as const, examDate: null, timeZone: "Asia/Kolkata", onboardingComplete: true } }, csrfToken: "csrf", accessToken: "private" } }) } as unknown as AuthService;
  return { handlers: createStudentSessionHandlers({ auth, authConfig: { allowedOrigins: [ORIGIN], cookieName: "spark_session", cookieSecure: true, sessionTtlSeconds: 3600, refreshSkewSeconds: 60, rateLimitSecret: "r".repeat(32), trustProxy: false }, sessions: service }) };
}

const request = (path: string, init: RequestInit = {}) => new Request(`https://spark.test${path}`, init);
const mutation = (path: string, body: unknown, key?: string) => request(path, { method: "POST", headers: { origin: ORIGIN, "x-csrf-token": "csrf", "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) });

describe("student session HTTP handlers", () => {
  it("returns the authoritative chapter id for content discovery", async () => {
    const response = await fixture().handlers.getConcepts(request("/api/v1/concepts"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ chapterId: "class-10-physics-electricity" });
  });

  it("returns direct start success and contract-shaped missing-key errors", async () => {
    const f = fixture();
    const missing = await f.handlers.startSession(mutation("/api/v1/sessions", { mode: "practice", conceptId: "resistance-and-ohms-law" }));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    const response = await f.handlers.startSession(mutation("/api/v1/sessions", { mode: "practice", conceptId: "resistance-and-ohms-law" }, "start-handler-1"));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty("id");
    expect(body).not.toHaveProperty("data");
  });
});

