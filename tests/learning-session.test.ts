import "./support/server-only";

import { describe, expect, it } from "vitest";

import type { Question } from "@/contracts/tutor";
import { InMemorySessionRepository, StudentSessionService } from "@/lib/server/learning/session-service";
import type { BankQuestion } from "@/lib/server/learning/selection";
import type { TrustedRubric } from "@/lib/server/evaluation/types";
import type { EvaluationDecision } from "@/lib/server/evaluation/types";

const bank: BankQuestion[] = [
  { id: "q1", conceptId: "resistance-and-ohms-law", format: "free_response", difficulty: "easy", prompt: "What happens to current when voltage doubles at fixed resistance?", hint: "Use I=V/R" },
  { id: "q2", conceptId: "resistance-and-ohms-law", format: "free_response", difficulty: "easy", prompt: "State Ohm's law.", hint: "Use the ratio" },
];
const rubrics = new Map<string, TrustedRubric>(bank.map((q) => [q.id, { questionId: q.id, rubricVersion: 1, correctAnswer: { acceptedExpression: "double" }, workedSolution: "private solution", reasoningRubric: { required: ["I=V/R"] }, numericAnswer: null, numericTolerance: null, expectedUnit: null, supportedMisconceptionCodes: [] }]));
const catalog = [{ code: "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE", conceptId: "resistance-and-ohms-law" as const, label: "Assumes voltage increases the fixed resistance" }];

function makeService(result: "correct" | "needs_clarification" = "correct") {
  const repository = new InMemorySessionRepository({ bank, rubrics, now: () => new Date("2026-10-31T09:00:00.000Z") });
  const evaluator = { evaluate: async (): Promise<EvaluationDecision> => result === "correct" ? ({ status: "correct", finalAnswerCorrect: true, reasoningStatus: "sound", feedback: "Correct.", misconception: null, clarificationPrompt: null, deterministicFinalAnswer: true }) : ({ status: "needs_clarification", finalAnswerCorrect: null, reasoningStatus: "unclear", feedback: "Clarify.", misconception: null, clarificationPrompt: "Explain the ratio.", deterministicFinalAnswer: null }) };
  return { repository, service: new StudentSessionService({ repository, evaluator, bank, rubrics, misconceptionCatalog: catalog, now: () => new Date("2026-10-31T09:00:00.000Z") }) };
}

describe("student learning-session workflow", () => {
  it("persists direct snapshots, grades once, advances and replays", async () => {
    const { service } = makeService();
    const started = await service.start("student-1", { mode: "practice", conceptId: "resistance-and-ohms-law", idempotencyKey: "start-1", path: "/api/v1/sessions" });
    expect(started.snapshot.phase).toBe("answering");
    const submitted = await service.submit("student-1", { sessionId: started.snapshot.id, questionId: started.snapshot.currentQuestion!.id, expectedSessionVersion: 1, finalAnswerText: "Current doubles", reasoningText: "I=V/R", idempotencyKey: "attempt-1", path: `/api/v1/sessions/${started.snapshot.id}/attempts` });
    expect(submitted.result.session.phase).toBe("feedback");
    expect(submitted.result.session.progress.answeredCount).toBe(1);
    const replay = await service.submit("student-1", { sessionId: started.snapshot.id, questionId: started.snapshot.currentQuestion!.id, expectedSessionVersion: 1, finalAnswerText: "Current doubles", reasoningText: "I=V/R", idempotencyKey: "attempt-1", path: `/api/v1/sessions/${started.snapshot.id}/attempts` });
    expect(replay.claim.kind).toBe("replay");
    expect((replay.claim.body as { attemptId: string }).attemptId).toBe(submitted.result.feedback.attemptId);
    let current = await service.advance("student-1", { sessionId: started.snapshot.id, expectedSessionVersion: 2, idempotencyKey: "advance-1", path: `/api/v1/sessions/${started.snapshot.id}/advance` });
    expect(current.snapshot.phase).toBe("answering");
    for (let index = 2; index <= 5; index += 1) {
      const submittedNext = await service.submit("student-1", { sessionId: started.snapshot.id, questionId: current.snapshot.currentQuestion!.id, expectedSessionVersion: current.snapshot.version, finalAnswerText: "Current doubles", reasoningText: "I=V/R", idempotencyKey: `attempt-${index}`, path: `/api/v1/sessions/${started.snapshot.id}/attempts` });
      current = await service.advance("student-1", { sessionId: started.snapshot.id, expectedSessionVersion: submittedNext.result.session.version, idempotencyKey: `advance-${index}`, path: `/api/v1/sessions/${started.snapshot.id}/advance` });
    }
    expect(current.snapshot.status).toBe("completed");
  });

  it("keeps clarification evidence and mastery unchanged", async () => {
    const { service } = makeService("needs_clarification");
    const started = await service.start("student-2", { mode: "practice", conceptId: "resistance-and-ohms-law", idempotencyKey: "start-2", path: "/api/v1/sessions" });
    const result = await service.submit("student-2", { sessionId: started.snapshot.id, questionId: started.snapshot.currentQuestion!.id, expectedSessionVersion: 1, finalAnswerText: "It changes", reasoningText: "Not sure", idempotencyKey: "attempt-2", path: `/api/v1/sessions/${started.snapshot.id}/attempts` });
    expect(result.result.session.phase).toBe("clarification");
    expect(result.result.session.progress.answeredCount).toBe(0);
    expect(result.result.feedback.mastery.after).toBeNull();
  });

  it("abandons without a summary and preserves feedback", async () => {
    const { service } = makeService();
    const started = await service.start("student-3", { mode: "practice", conceptId: "resistance-and-ohms-law", idempotencyKey: "start-3", path: "/api/v1/sessions" });
    const abandoned = await service.end("student-3", { sessionId: started.snapshot.id, expectedSessionVersion: 1, idempotencyKey: "end-3", path: `/api/v1/sessions/${started.snapshot.id}/end` });
    expect(abandoned.snapshot.phase).toBe("abandoned");
    expect(abandoned.snapshot.summary).toBeNull();
    expect(abandoned.snapshot.currentQuestion).toBeNull();
  });
});

