import assert from "node:assert/strict";
import test from "node:test";

import { HttpApiError, NetworkError, ProtocolError } from "../src/lib/tutor-api/errors";
import { HttpTutorApi } from "../src/lib/tutor-api/http";
import { MockTutorApi } from "../src/lib/tutor-api/mock";
import type { SubmitAttemptInput } from "../src/contracts/tutor";
import { jsonResponse, MemoryStorage } from "./helpers";

test("HttpTutorApi maps all 17 operations with cookies, CSRF, encoded URLs, and header idempotency", async () => {
  const fixtureApi = new MockTutorApi("student-returning", new MemoryStorage(), "http-fixtures", 0);
  const auth = await fixtureApi.getCurrentUser();
  assert.equal(auth.authenticated, true);
  const signedIn = await fixtureApi.signIn({ email: "sample@example.test", password: "not-stored" });
  const profile = await fixtureApi.saveStudentProfile({ displayName: "Asha", chapterId: "class-10-physics-electricity", examDate: null, timeZone: "Asia/Calcutta" });
  const started = await fixtureApi.startSession({ mode: "practice", idempotencyKey: "fixture-start" });
  const submitted = await fixtureApi.submitAttempt({
    sessionId: started.id,
    questionId: started.currentQuestion!.id,
    expectedSessionVersion: started.version,
    finalAnswerText: "Current doubles.",
    reasoningText: "I = V/R and resistance is fixed.",
    idempotencyKey: "fixture-submit",
  });
  const advanced = await fixtureApi.advanceSession({ sessionId: started.id, expectedSessionVersion: submitted.session.version, idempotencyKey: "fixture-advance" });
  const ended = await fixtureApi.endSession({ sessionId: started.id, expectedSessionVersion: advanced.version, idempotencyKey: "fixture-end" });
  const teacherApi = new MockTutorApi("teacher", new MemoryStorage(), "http-teacher-fixtures", 0);
  const classes = await teacherApi.getClasses();
  const classDashboard = await teacherApi.getClassDashboard(classes[0].id);
  const studentDetail = await teacherApi.getStudentDetail(classes[0].id, "student-returning");

  const responses = [
    jsonResponse(auth),
    jsonResponse(signedIn),
    jsonResponse(profile),
    jsonResponse(await fixtureApi.getStudentDashboard()),
    jsonResponse(await fixtureApi.getConcepts()),
    jsonResponse(started, 201),
    jsonResponse(started),
    jsonResponse(submitted),
    jsonResponse(advanced),
    jsonResponse(ended),
    jsonResponse(await fixtureApi.getRevisionQueue()),
    jsonResponse(await fixtureApi.getProgress()),
    jsonResponse(await fixtureApi.getAttemptHistory()),
    jsonResponse(classes),
    jsonResponse(classDashboard),
    jsonResponse(studentDetail),
    new Response(null, { status: 204 }),
  ];
  const expected = [
    ["GET", "/api/v1/auth/me"],
    ["POST", "/api/v1/auth/sign-in"],
    ["PUT", "/api/v1/me/profile"],
    ["GET", "/api/v1/student/dashboard"],
    ["GET", "/api/v1/concepts"],
    ["POST", "/api/v1/sessions"],
    ["GET", "/api/v1/sessions/session%2Fa%20b"],
    ["POST", "/api/v1/sessions/session%2Fa%20b/attempts"],
    ["POST", "/api/v1/sessions/session%2Fa%20b/advance"],
    ["POST", "/api/v1/sessions/session%2Fa%20b/end"],
    ["GET", "/api/v1/revision"],
    ["GET", "/api/v1/progress?cursor=next%2Fpage+%3F&limit=7"],
    ["GET", "/api/v1/attempts?limit=5"],
    ["GET", "/api/v1/teacher/classes"],
    ["GET", "/api/v1/teacher/classes/class%2F10%20A"],
    ["GET", "/api/v1/teacher/classes/class%2F10%20A/students/student%2F1"],
    ["POST", "/api/v1/auth/sign-out"],
  ] as const;
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const index = calls.length;
    const url = String(input);
    calls.push({ url, init });
    assert.equal(init.method, expected[index][0]);
    assert.equal(url, expected[index][1]);
    assert.equal(init.credentials, "include");
    assert.equal(init.cache, "no-store");
    assert.equal(new Headers(init.headers).get("accept"), "application/json");
    return responses[index];
  };
  const api = new HttpTutorApi("/api/v1/", fetcher, 1_000);

  await api.getCurrentUser();
  await api.signIn({ email: "sample@example.test", password: "not-stored" });
  await api.saveStudentProfile({ displayName: "Asha", chapterId: "class-10-physics-electricity", examDate: null, timeZone: "Asia/Calcutta" });
  await api.getStudentDashboard();
  await api.getConcepts();
  await api.startSession({ mode: "diagnostic", idempotencyKey: "start-key" });
  await api.getSession("session/a b");
  await api.submitAttempt({ sessionId: "session/a b", questionId: "q1", expectedSessionVersion: 1, finalAnswerText: "42 V", reasoningText: "Using the equation.", idempotencyKey: "submit-key" });
  await api.advanceSession({ sessionId: "session/a b", expectedSessionVersion: 2, idempotencyKey: "advance-key" });
  await api.endSession({ sessionId: "session/a b", expectedSessionVersion: 3, idempotencyKey: "end-key" });
  await api.getRevisionQueue();
  await api.getProgress({ cursor: "next/page ?", limit: 7 });
  await api.getAttemptHistory({ limit: 5 });
  await api.getClasses();
  await api.getClassDashboard("class/10 A");
  await api.getStudentDetail("class/10 A", "student/1");
  await api.signOut();

  assert.equal(calls.length, 17);
  for (const index of [2, 5, 7, 8, 9, 16]) {
    assert.equal(new Headers(calls[index].init.headers).get("x-csrf-token"), signedIn.csrfToken);
  }
  assert.equal(new Headers(calls[5].init.headers).get("idempotency-key"), "start-key");
  assert.equal(new Headers(calls[7].init.headers).get("idempotency-key"), "submit-key");
  assert.equal(new Headers(calls[8].init.headers).get("idempotency-key"), "advance-key");
  assert.equal(new Headers(calls[9].init.headers).get("idempotency-key"), "end-key");
  assert.deepEqual(JSON.parse(String(calls[5].init.body)), { mode: "diagnostic" });
  assert.equal("idempotencyKey" in JSON.parse(String(calls[7].init.body)), false);
  assert.equal(calls[16].init.body, undefined);
});

test("HttpTutorApi preserves multiple-choice and free-response wire formats", async () => {
  const bodies: unknown[] = [];
  const fixture = new MockTutorApi("student-new", new MemoryStorage(), "answer-fixture", 0);
  await fixture.saveStudentProfile({ displayName: "Sam", chapterId: "class-10-physics-electricity", examDate: null, timeZone: "UTC" });
  const auth = await fixture.getCurrentUser();
  const session = await fixture.startSession({ mode: "practice", idempotencyKey: "s" });
  const result = await fixture.submitAttempt({ sessionId: session.id, questionId: session.currentQuestion!.id, expectedSessionVersion: 1, finalAnswerText: "Answer", reasoningText: "Reason", idempotencyKey: "a" });
  const fetcher: typeof fetch = async (request, init = {}) => {
    bodies.push(init.body ? JSON.parse(String(init.body)) : null);
    return String(request).endsWith("/auth/sign-in") ? jsonResponse(auth) : jsonResponse(result);
  };
  const free = new HttpTutorApi("/api/v1", fetcher);
  await free.signIn({ email: "sample@example.test", password: "not-stored" });
  await free.submitAttempt({ sessionId: "s", questionId: "q", expectedSessionVersion: 1, finalAnswerText: "Answer", reasoningText: "Reason", idempotencyKey: "free" });
  await free.submitAttempt({ sessionId: "s", questionId: "q", expectedSessionVersion: 1, finalAnswerText: "", selectedOptionId: "option-a", reasoningText: "Reason", idempotencyKey: "mc" });
  assert.equal((bodies[1] as Record<string, unknown>).finalAnswerText, "Answer");
  assert.equal((bodies[2] as Record<string, unknown>).finalAnswerText, "");
  assert.equal((bodies[2] as Record<string, unknown>).selectedOptionId, "option-a");

  let requests = 0;
  const invalid = new HttpTutorApi("/api/v1", async () => { requests += 1; return jsonResponse(result); });
  const bad: SubmitAttemptInput = { sessionId: "s", questionId: "q", expectedSessionVersion: 1, finalAnswerText: "conflict", selectedOptionId: "option-a", reasoningText: "Reason", idempotencyKey: "bad" };
  assert.throws(() => invalid.submitAttempt(bad), (error: unknown) => error instanceof HttpApiError && error.status === 400);
  assert.equal(requests, 0);
});

test("HttpTutorApi distinguishes network, HTTP, and protocol failures", async (context) => {
  await context.test("network", async () => {
    const api = new HttpTutorApi("/api/v1", async () => { throw new Error("offline"); });
    await assert.rejects(api.getSession("s"), NetworkError);
  });
  await context.test("valid HTTP error", async () => {
    const api = new HttpTutorApi("/api/v1", async () => jsonResponse({ error: { code: "NOT_FOUND", message: "Missing", retryable: false, requestId: "request-1" } }, 404));
    await assert.rejects(api.getSession("s"), (error: unknown) => error instanceof HttpApiError && error.status === 404);
  });
  await context.test("non-JSON", async () => {
    const api = new HttpTutorApi("/api/v1", async () => new Response("<html>bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }));
    await assert.rejects(api.getSession("s"), (error: unknown) => error instanceof ProtocolError && error.reason === "non_json_response" && error.outcome === "not_applicable");
  });
  await context.test("malformed JSON", async () => {
    const api = new HttpTutorApi("/api/v1", async () => new Response("{", { status: 200, headers: { "content-type": "application/json" } }));
    await assert.rejects(api.getSession("s"), (error: unknown) => error instanceof ProtocolError && error.reason === "malformed_json");
  });
  await context.test("invalid success", async () => {
    const api = new HttpTutorApi("/api/v1", async () => jsonResponse({ rewards: { account: null, grants: [{ awardedXp: 10 }] } }));
    await assert.rejects(api.getProgress(), (error: unknown) => error instanceof ProtocolError && error.reason === "invalid_success_payload");
  });
  await context.test("invalid error", async () => {
    const api = new HttpTutorApi("/api/v1", async () => jsonResponse({ error: { code: "RATE_LIMITED", message: "Wait", retryable: false, requestId: "request-1" } }, 429));
    await assert.rejects(api.getSession("s"), (error: unknown) => error instanceof ProtocolError && error.reason === "invalid_error_payload");
  });
  await context.test("mutation protocol outcome is unknown", async () => {
    const auth = await new MockTutorApi("student-returning", new MemoryStorage(), "auth-fixture", 0).getCurrentUser();
    const replies = [jsonResponse(auth), new Response("not json", { status: 201, headers: { "content-type": "text/plain" } })];
    const api = new HttpTutorApi("/api/v1", async () => replies.shift()!);
    await assert.rejects(api.startSession({ mode: "diagnostic", idempotencyKey: "unknown" }), (error: unknown) => error instanceof ProtocolError && error.outcome === "unknown");
  });
});

test("signOut accepts an empty 204 response", async () => {
  const auth = await new MockTutorApi("student-returning", new MemoryStorage(), "signout-fixture", 0).getCurrentUser();
  const replies = [jsonResponse(auth), new Response(null, { status: 204 })];
  const api = new HttpTutorApi("/api/v1", async () => replies.shift()!);
  await api.getCurrentUser();
  await api.signOut();
  assert.equal(replies.length, 0);
});
