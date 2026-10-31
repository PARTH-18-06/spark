import assert from "node:assert/strict";
import test from "node:test";

import { HttpApiError, NetworkError, ProtocolError } from "../src/lib/tutor-api/errors";
import { MockTutorApi } from "../src/lib/tutor-api/mock";
import { clearDraft, draftKey, readDraft, saveDraft } from "../src/lib/tutor-api/drafts";
import { PendingMutationConflictError, PendingMutationCoordinator } from "../src/lib/tutor-api/pending";
import { validErrorForStatus, validQuestion, validators } from "../src/lib/tutor-api/validation";
import { MemoryStorage } from "./helpers";

test("pending mutations preserve immutable payloads and keys after an unknown outcome", async () => {
  const storage = new MemoryStorage();
  const coordinator = new PendingMutationCoordinator("student-1", storage, () => new Date("2026-10-31T10:00:00.000Z"));
  const input = { mode: "diagnostic" as const, idempotencyKey: "original-key" };
  await assert.rejects(coordinator.execute("start", input, async () => { throw new NetworkError(); }), NetworkError);

  const pending = coordinator.current()!;
  assert.equal(pending.state, "unknown");
  assert.deepEqual(pending.input, input);
  assert.ok(Object.isFrozen(pending));
  assert.ok(Object.isFrozen(pending.input));
  assert.throws(
    () => coordinator.begin("start", { mode: "practice", idempotencyKey: "competing-key" }),
    PendingMutationConflictError,
  );

  let retried: unknown;
  const result = await coordinator.retry(async (sameInput) => {
    retried = sameInput;
    return "replayed";
  });
  assert.equal(result, "replayed");
  assert.deepEqual(retried, input);
  assert.equal(coordinator.current(), null);
});

test("protocol and retryable HTTP failures retain pending identity; definitive errors release it", async () => {
  const storage = new MemoryStorage();
  const coordinator = new PendingMutationCoordinator("student-2", storage);
  const input = { mode: "diagnostic" as const, idempotencyKey: "protocol-key" };
  await assert.rejects(
    coordinator.execute("start", input, async () => { throw new ProtocolError("invalid_success_payload", 200, "unknown"); }),
    ProtocolError,
  );
  assert.equal(coordinator.current()?.input.idempotencyKey, "protocol-key");
  coordinator.discardDefinitive();

  await assert.rejects(
    coordinator.execute("start", input, async () => {
      throw new HttpApiError(503, { error: { code: "AI_UNAVAILABLE", message: "Try later", retryable: true, requestId: "request-1" } });
    }),
    HttpApiError,
  );
  assert.equal(coordinator.current()?.input.idempotencyKey, "protocol-key");
  coordinator.discardDefinitive();

  await assert.rejects(
    coordinator.execute("start", input, async () => {
      throw new HttpApiError(400, { error: { code: "VALIDATION_ERROR", message: "Fix it", retryable: false, requestId: "request-2" } });
    }),
    HttpApiError,
  );
  assert.equal(coordinator.current(), null);
});

test("runtime validators enforce question formats, session invariants, mastery, stable codes, and disabled rewards", async () => {
  assert.equal(validQuestion({ id: "q", conceptId: "electric-current-and-charge", format: "free_response", prompt: "Prompt", difficulty: "easy" }), true);
  assert.equal(validQuestion({ id: "q", conceptId: "electric-current-and-charge", format: "free_response", prompt: "Prompt", difficulty: "easy", options: [] }), false);
  assert.equal(validQuestion({ id: "q", conceptId: "electric-current-and-charge", format: "multiple_choice", prompt: "Prompt", difficulty: "easy", options: [] }), false);
  assert.equal(validQuestion({ id: "q", conceptId: "electric-current-and-charge", format: "multiple_choice", prompt: "Prompt", difficulty: "easy", options: [{ id: "a", text: "A" }] }), true);

  const api = new MockTutorApi("student-returning", new MemoryStorage(), "validation-fixtures", 0);
  const progress = await api.getProgress();
  assert.equal(validators.getProgress(progress), true);

  const invalidMastery = structuredClone(progress);
  invalidMastery.concepts[0].mastery = 1.1;
  invalidMastery.concepts[0].state = "strong";
  assert.equal(validators.getProgress(invalidMastery), false);

  const unknownCode = structuredClone(progress);
  unknownCode.concepts[2].recentMisconceptions[0].misconceptionCode = "LLM_CREATED_CODE";
  assert.equal(validators.getProgress(unknownCode), false);

  const enabledRewards = structuredClone(progress) as unknown as Record<string, unknown>;
  enabledRewards.rewards = { account: null, grants: [{ eventId: "xp", awardedXp: 10, reason: "assessed_attempt" }] };
  assert.equal(validators.getProgress(enabledRewards), false);

  const session = await api.startSession({ mode: "practice", idempotencyKey: "validation-session" });
  assert.equal(validators.startSession(session), true);
  const invalidTerminal = { ...session, status: "completed", phase: "completed", currentQuestion: null, endedAt: session.updatedAt };
  assert.equal(validators.startSession(invalidTerminal), false);
});

test("API error validation enforces status and retryability semantics", () => {
  assert.equal(validErrorForStatus({ error: { code: "RATE_LIMITED", message: "Wait", retryable: true, requestId: "request-1", retryAfterSeconds: 1 } }, 429), true);
  assert.equal(validErrorForStatus({ error: { code: "RATE_LIMITED", message: "Wait", retryable: false, requestId: "request-1" } }, 429), false);
  assert.equal(validErrorForStatus({ error: { code: "NOT_FOUND", message: "Missing", retryable: false, requestId: "request-1" } }, 409), false);
  assert.equal(validErrorForStatus({ error: { code: "ACTIVE_SESSION_EXISTS", message: "Resume", retryable: false, requestId: "request-1", activeSessionId: "session-1" } }, 409), true);
});

test("answer drafts are scoped by user, session, and question", () => {
  const storage = new MemoryStorage();
  saveDraft("student-a", "session-1", "question-1", { finalAnswerText: "12 V", reasoningText: "V = IR", selectedOptionId: null }, storage);
  assert.equal(readDraft("student-a", "session-1", "question-1", storage)?.reasoningText, "V = IR");
  assert.equal(readDraft("student-b", "session-1", "question-1", storage), null);
  assert.equal(readDraft("student-a", "session-2", "question-1", storage), null);
  assert.equal(readDraft("student-a", "session-1", "question-2", storage), null);
  assert.match(draftKey("student-a", "session-1", "question-1"), /^spark:/);
  clearDraft("student-a", "session-1", "question-1", storage);
  assert.equal(readDraft("student-a", "session-1", "question-1", storage), null);
});
