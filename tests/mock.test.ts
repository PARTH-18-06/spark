import assert from "node:assert/strict";
import test from "node:test";

import { HttpApiError } from "../src/lib/tutor-api/errors";
import { MockTutorApi } from "../src/lib/tutor-api/mock";
import { MISCONCEPTION_CODES, type SessionSnapshot, type SubmitAttemptInput } from "../src/contracts/tutor";
import { MemoryStorage } from "./helpers";

const make = (persona: "student-new" | "student-returning" | "teacher" = "student-new", storage = new MemoryStorage()) =>
  new MockTutorApi(persona, storage, "mock-test", 0);

async function onboard(api: MockTutorApi) {
  await api.saveStudentProfile({ displayName: "Sam", chapterId: "class-10-physics-electricity", examDate: null, timeZone: "Asia/Calcutta" });
}

function answer(session: SessionSnapshot, key: string, overrides: Partial<SubmitAttemptInput> = {}): SubmitAttemptInput {
  const question = session.currentQuestion!;
  return {
    sessionId: session.id,
    questionId: question.id,
    expectedSessionVersion: session.version,
    finalAnswerText: question.format === "multiple_choice" ? "" : "Current doubles.",
    reasoningText: "I = V/R, so current doubles when resistance stays fixed.",
    ...(question.format === "multiple_choice" ? { selectedOptionId: question.options[0].id } : {}),
    idempotencyKey: key,
    ...overrides,
  };
}

test("mock scenarios cover correct, partial, incorrect, and clarification feedback", async () => {
  for (const outcome of ["correct", "partial", "incorrect"] as const) {
    const api = make();
    await onboard(api);
    api.outcome = outcome;
    const session = await api.startSession({ mode: "practice", conceptId: "electric-current-and-charge", idempotencyKey: `start-${outcome}` });
    const result = await api.submitAttempt(answer(session, `answer-${outcome}`));
    assert.equal(result.status, outcome);
    assert.equal(result.session.phase, "feedback");
    assert.deepEqual(result.rewards, { account: null, grants: [] });
  }

  const api = make();
  await onboard(api);
  api.outcome = "needs_clarification";
  const session = await api.startSession({ mode: "practice", conceptId: "resistance-and-ohms-law", idempotencyKey: "start-clarify" });
  const before = await api.getProgress();
  const unclear = await api.submitAttempt(answer(session, "unclear", { finalAnswerText: "It changes.", reasoningText: "It could double or halve." }));
  assert.equal(unclear.session.phase, "clarification");
  assert.equal(unclear.mastery.before, unclear.mastery.after);
  assert.equal(unclear.mastery.evidenceCount, before.concepts[2].evidenceCount);
  assert.equal(unclear.nextReviewAt, before.concepts[2].nextReviewAt);
  assert.deepEqual(await api.getSession(session.id), unclear.session);

  api.outcome = "correct";
  const resolved = await api.submitAttempt(answer(unclear.session, "clarified", { clarificationOfAttemptId: unclear.attemptId }));
  assert.equal(resolved.clarificationOfAttemptId, unclear.attemptId);
  assert.notEqual(resolved.attemptId, unclear.attemptId);
  assert.equal(resolved.session.progress.answeredCount, 1);
});

test("mock enforces answer formats and supports multiple choice progression", async () => {
  const api = make();
  await onboard(api);
  let session = await api.startSession({ mode: "practice", conceptId: "resistance-and-ohms-law", idempotencyKey: "start-mc" });
  const first = await api.submitAttempt(answer(session, "free-answer"));
  session = await api.advanceSession({ sessionId: session.id, expectedSessionVersion: first.session.version, idempotencyKey: "advance-mc" });
  assert.equal(session.currentQuestion?.format, "multiple_choice");

  await assert.rejects(
    api.submitAttempt(answer(session, "bad-mc", { finalAnswerText: "Current doubles." })),
    (error: unknown) => error instanceof HttpApiError && error.body.error.code === "VALIDATION_ERROR",
  );
  const result = await api.submitAttempt(answer(session, "good-mc"));
  assert.equal(result.finalAnswerText, "");
  assert.ok(result.selectedOptionId);
});

test("mock retry replay is stable and changed content conflicts", async () => {
  const api = make();
  await onboard(api);
  const session = await api.startSession({ mode: "practice", idempotencyKey: "stable-start" });
  const input = answer(session, "stable-answer");
  const first = await api.submitAttempt(input);
  const replay = await api.submitAttempt(input);
  assert.deepEqual(replay, first);
  await assert.rejects(
    api.submitAttempt({ ...input, reasoningText: "Edited after the first request." }),
    (error: unknown) => error instanceof HttpApiError && error.body.error.code === "IDEMPOTENCY_CONFLICT",
  );
  await assert.rejects(
    api.advanceSession({ sessionId: session.id, expectedSessionVersion: 1, idempotencyKey: "stale" }),
    (error: unknown) => error instanceof HttpApiError && error.body.error.code === "SESSION_VERSION_CONFLICT",
  );
});

test("refresh resumes persisted feedback without another submission", async () => {
  const storage = new MemoryStorage();
  const firstApi = make("student-new", storage);
  await onboard(firstApi);
  const session = await firstApi.startSession({ mode: "practice", idempotencyKey: "resume-start" });
  const result = await firstApi.submitAttempt(answer(session, "resume-answer"));
  const secondApi = make("student-new", storage);
  const resumed = await secondApi.getSession(session.id);
  assert.deepEqual(resumed, result.session);
  assert.equal((await secondApi.getAttemptHistory()).items.length, 1);
});

test("endSession works from every active phase", async () => {
  const end = async (phase: "answering" | "feedback" | "clarification") => {
    const api = make();
    await onboard(api);
    let session = await api.startSession({ mode: "practice", idempotencyKey: `end-${phase}-start` });
    if (phase !== "answering") {
      api.outcome = phase === "clarification" ? "needs_clarification" : "correct";
      session = (await api.submitAttempt(answer(session, `end-${phase}-answer`))).session;
    }
    const ended = await api.endSession({ sessionId: session.id, expectedSessionVersion: session.version, idempotencyKey: `end-${phase}` });
    assert.equal(ended.status, "abandoned");
    assert.equal(ended.phase, "abandoned");
    assert.equal(ended.summary, null);
    assert.ok(ended.endedAt);
  };
  await end("answering");
  await end("feedback");
  await end("clarification");
});

test("abandonment preserves graded progress and releases the active slot", async () => {
  const api = make();
  await onboard(api);
  api.outcome = "incorrect";
  const session = await api.startSession({ mode: "practice", conceptId: "resistance-and-ohms-law", idempotencyKey: "abandon-start" });
  const graded = await api.submitAttempt(answer(session, "abandon-answer", { finalAnswerText: "Current halves.", reasoningText: "Current halves because higher voltage increases resistance." }));
  const before = await api.getProgress();
  await api.endSession({ sessionId: session.id, expectedSessionVersion: graded.session.version, idempotencyKey: "abandon-end" });
  const after = await api.getProgress();
  assert.deepEqual(after.concepts, before.concepts);
  const next = await api.startSession({ mode: "practice", idempotencyKey: "after-abandon" });
  assert.equal(next.status, "active");
});

test("abandoned revision remains due and can be restarted", async () => {
  const api = make("student-returning");
  const queue = await api.getRevisionQueue();
  const due = queue.items.find((item) => item.status === "due")!;
  const session = await api.startSession({ mode: "revision", revisionItemIds: [due.id], idempotencyKey: "revision-start" });
  await api.endSession({ sessionId: session.id, expectedSessionVersion: session.version, idempotencyKey: "revision-end" });
  assert.equal((await api.getRevisionQueue()).items.find((item) => item.id === due.id)?.status, "due");
  const restarted = await api.startSession({ mode: "revision", revisionItemIds: [due.id], idempotencyKey: "revision-restart" });
  assert.equal(restarted.mode, "revision");
});

test("revision counts, misconception identities, teacher roster, and disabled rewards stay consistent", async () => {
  const student = make("student-returning");
  const queue = await student.getRevisionQueue();
  const dashboard = await student.getStudentDashboard();
  assert.equal(dashboard.dueRevisionCount, queue.items.filter((item) => item.status === "due").length);
  assert.deepEqual(dashboard.rewards, { account: null, grants: [] });
  assert.equal(dashboard.concepts[2].recentMisconceptions[0].misconceptionCode, MISCONCEPTION_CODES.VOLTAGE_CHANGES_FIXED_RESISTANCE);

  const teacher = make("teacher");
  const classes = await teacher.getClasses();
  const classDashboard = await teacher.getClassDashboard(classes[0].id);
  assert.equal(classDashboard.students.length, classes[0].studentCount);
  assert.ok(classDashboard.students.some((row) => row.concepts.every((concept) => concept.mastery === null)));
  assert.equal(classDashboard.commonMisconceptions[0].misconceptionCode, MISCONCEPTION_CODES.VOLTAGE_CHANGES_FIXED_RESISTANCE);
  const detail = await teacher.getStudentDetail(classes[0].id, "student-returning");
  assert.equal(detail.classId, classes[0].id);

  await assert.rejects(
    student.getClasses(),
    (error: unknown) => error instanceof HttpApiError && error.body.error.code === "FORBIDDEN",
  );
});

test("reset restores deterministic sample identities and timestamps", async () => {
  const api = make();
  await onboard(api);
  const first = await api.startSession({ mode: "diagnostic", idempotencyKey: "deterministic-start" });
  api.reset();
  await onboard(api);
  const second = await api.startSession({ mode: "diagnostic", idempotencyKey: "deterministic-start" });
  assert.equal(second.id, first.id);
  assert.equal(second.updatedAt, first.updatedAt);
  assert.deepEqual(second.currentQuestion, first.currentQuestion);
});

test("progress and attempt history expose deterministic pagination cursors", async () => {
  const api = make();
  await onboard(api);
  for (let index = 0; index < 2; index += 1) {
    const session = await api.startSession({ mode: "practice", idempotencyKey: `page-start-${index}` });
    const result = await api.submitAttempt(answer(session, `page-answer-${index}`));
    await api.endSession({ sessionId: session.id, expectedSessionVersion: result.session.version, idempotencyKey: `page-end-${index}` });
  }
  const firstSessions = await api.getProgress({ limit: 1 });
  assert.equal(firstSessions.sessions.items.length, 1);
  assert.ok(firstSessions.sessions.nextCursor);
  const secondSessions = await api.getProgress({ cursor: firstSessions.sessions.nextCursor!, limit: 1 });
  assert.equal(secondSessions.sessions.items.length, 1);
  assert.notEqual(secondSessions.sessions.items[0].id, firstSessions.sessions.items[0].id);

  const firstAttempts = await api.getAttemptHistory({ limit: 1 });
  assert.equal(firstAttempts.items.length, 1);
  assert.ok(firstAttempts.nextCursor);
  const secondAttempts = await api.getAttemptHistory({ cursor: firstAttempts.nextCursor!, limit: 1 });
  assert.equal(secondAttempts.items.length, 1);
  assert.notEqual(secondAttempts.items[0].feedback.attemptId, firstAttempts.items[0].feedback.attemptId);
});
