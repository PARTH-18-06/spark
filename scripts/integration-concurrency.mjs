import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { config as loadEnvironment } from "dotenv";

loadEnvironment({ path: ".env.local", quiet: true });

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SPARK_ENVIRONMENT_NAME", "SPARK_INTEGRATION_ENABLED", "DEV_STUDENT_NEW_EMAIL", "DEV_STUDENT_NEW_PASSWORD"];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) throw new Error(`BLOCKED: missing configuration variables: ${missing.join(", ")}`);
if (process.env.SPARK_INTEGRATION_ENABLED !== "true") throw new Error("BLOCKED: integration is not enabled for the approved test target");
if (["prod", "production"].includes(process.env.SPARK_ENVIRONMENT_NAME.trim().toLowerCase())) throw new Error("BLOCKED: production-like target");
if (new URL(process.env.SUPABASE_URL).hostname.split(".")[0] !== "xrfesdcbhyhxwqwyzzoh") throw new Error("BLOCKED: configured Supabase project is not the approved Spark test project");

const origin = process.env.SPARK_INTEGRATION_ORIGIN ?? "http://localhost:3000";
const base = process.env.SPARK_INTEGRATION_BASE_URL?.replace(/\/+$/, "") ?? "http://localhost:3000";
const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = db();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hashPayload(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `${(hash >>> 0).toString(16).padStart(8, "0")}${text.length.toString(16).padStart(56, "0")}`;
}

class CookieJar {
  value = "";
  absorb(response) {
    const header = response.headers.get("set-cookie");
    if (!header) return;
    const pair = header.split(";", 1)[0];
    if (pair.includes("=")) this.value = pair;
  }
  header() { return this.value; }
}

async function http(jar, path, init = {}) {
  const headers = new Headers(init.headers);
  if (jar.header()) headers.set("cookie", jar.header());
  const response = await fetch(`${base}${path}`, { ...init, headers });
  jar.absorb(response);
  const body = response.status === 204 ? null : await response.json().catch(() => undefined);
  return { response, body };
}

async function signIn() {
  const jar = new CookieJar();
  const result = await http(jar, "/api/v1/auth/sign-in", {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: process.env.DEV_STUDENT_NEW_EMAIL, password: process.env.DEV_STUDENT_NEW_PASSWORD }),
  });
  assert(result.response.status === 200 && result.body?.authenticated, "synthetic student sign-in failed");
  return { jar, userId: result.body.user.id, csrf: result.body.csrfToken };
}

async function startSession(auth) {
  const result = await http(auth.jar, "/api/v1/sessions", {
    method: "POST", headers: { origin, "x-csrf-token": auth.csrf, "content-type": "application/json", "Idempotency-Key": `concurrency-start-${randomUUID()}` },
    body: JSON.stringify({ mode: "practice", conceptId: "resistance-and-ohms-law" }),
  });
  assert(result.response.status === 201 && result.body?.status === "active", "test session did not start");
  return result.body;
}

async function signOut(auth) {
  const result = await http(auth.jar, "/api/v1/auth/sign-out", { method: "POST", headers: { origin, "x-csrf-token": auth.csrf } });
  assert(result.response.status === 204, "test worker sign-out failed");
}

async function assignment(userId, session) {
  const result = await admin.rpc("spark_get_session_assignment", { p_student_id: userId, p_session_id: session.id, p_assignment_id: session.currentQuestion.id });
  if (result.error) throw result.error;
  assert(result.data, "test assignment was not available");
  return result.data;
}

function answerFor(session) {
  return session.currentQuestion.format === "multiple_choice"
    ? { finalAnswerText: "", reasoningText: "I used the relationship between voltage and current.", selectedOptionId: session.currentQuestion.options[0].id, clarificationOfAttemptId: null }
    : { finalAnswerText: "I = V/R", reasoningText: "I use Ohm's law to calculate current.", selectedOptionId: null, clarificationOfAttemptId: null };
}

function claimInput(userId, session, key, answer) {
  return { sessionId: session.id, questionId: session.currentQuestion.id, expectedSessionVersion: session.version, ...answer, idempotencyKey: key, path: `/api/v1/sessions/${session.id}/attempts` };
}

async function claim(client, userId, operation, path, key, payload) {
  const result = await client.rpc("spark_claim_learning_mutation", { p_user_id: userId, p_operation: operation, p_request_path: path, p_idempotency_key: key, p_payload_hash: hashPayload(payload) });
  if (result.error) throw result.error;
  return result.data;
}

async function release(client, userId, operation, path, key, token) {
  const result = await client.rpc("spark_release_learning_claim", { p_user_id: userId, p_operation: operation, p_request_path: path, p_idempotency_key: key, p_claim_token: token });
  if (result.error) throw result.error;
}

const evaluation = { status: "correct", finalAnswerCorrect: true, reasoningStatus: "sound", feedback: "Concurrency verification feedback.", misconception: null, clarificationPrompt: null };

async function finalize(client, userId, session, assignmentRow, answer, token) {
  return client.rpc("spark_finalize_learning_attempt", {
    p_student_id: userId, p_session_id: session.id, p_expected_version: session.version,
    p_assignment: assignmentRow, p_answer: answer, p_evaluation: evaluation,
    p_submitted_at: new Date().toISOString(), p_claim_token: token,
  });
}

async function endWithClaim(userId, session) {
  const client = db();
  const key = `concurrency-cleanup-${randomUUID()}`;
  const payload = { sessionId: session.id, expectedSessionVersion: session.version, idempotencyKey: key, path: `/api/v1/sessions/${session.id}/end` };
  const row = await claim(client, userId, "endSession", payload.path, key, payload);
  if (row.kind !== "new") return;
  const result = await client.rpc("spark_end_learning_session", { p_student_id: userId, p_session_id: session.id, p_expected_version: session.version, p_claim_token: row.token });
  if (result.error && !/INVALID_SESSION_STATE|SESSION_VERSION_CONFLICT/.test(result.error.message ?? "")) throw result.error;
}

async function counts(userId, session, conceptId) {
  const result = await admin.from("attempts").select("id", { count: "exact", head: true }).eq("session_id", session.id).eq("student_user_id", userId);
  if (result.error) throw result.error;
  const mastery = await admin.from("concept_mastery").select("evidence_count").eq("student_user_id", userId).eq("concept_id", conceptId).maybeSingle();
  if (mastery.error) throw mastery.error;
  const revisions = await admin.from("revision_items").select("id", { count: "exact", head: true }).eq("student_user_id", userId).eq("source_attempt_id", session.id);
  // source_attempt_id is an attempt id, so the session-specific revision count
  // is checked separately below from the committed attempt IDs.
  if (revisions.error && revisions.error.code !== "PGRST116") throw revisions.error;
  return { attempts: result.count ?? 0, evidence: mastery.data?.evidence_count ?? 0 };
}

async function committedAttemptCount(userId, session) {
  const attempts = await admin.from("attempts").select("id").eq("session_id", session.id).eq("student_user_id", userId);
  if (attempts.error) throw attempts.error;
  const ids = (attempts.data ?? []).map((row) => row.id);
  if (!ids.length) return { attempts: 0, revisions: 0 };
  const revisions = await admin.from("revision_items").select("id", { count: "exact", head: true }).eq("student_user_id", userId).in("source_attempt_id", ids);
  if (revisions.error) throw revisions.error;
  return { attempts: ids.length, revisions: revisions.count ?? 0 };
}

async function scenarioIdentical(userId) {
  const auth = await signIn();
  const session = await startSession(auth);
  const row = await assignment(userId, session);
  const answer = answerFor(session);
  const key = `concurrency-identical-${randomUUID()}`;
  const payload = claimInput(userId, session, key, answer);
  const workerOne = db();
  const first = await claim(workerOne, userId, "submitAttempt", payload.path, key, payload);
  assert(first.kind === "new", "first identical worker did not claim the mutation");
  await delay(250);
  const second = await claim(db(), userId, "submitAttempt", payload.path, key, payload);
  assert(second.kind === "in_progress", "identical overlap did not observe REQUEST_IN_PROGRESS");
  const committed = await finalize(workerOne, userId, session, row, answer, first.token);
  if (committed.error) throw committed.error;
  const replay = await claim(db(), userId, "submitAttempt", payload.path, key, payload);
  assert(replay.kind === "replay" && replay.status === 200, "committed identical submission did not replay");
  const effects = await committedAttemptCount(userId, session);
  assert(effects.attempts === 1 && effects.revisions === 1, "identical overlap created duplicate learning effects");
  await endWithClaim(userId, { ...session, version: committed.data.session.version });
  await signOut(auth);
  return "identical simultaneous submission, exact replay, and single-effect fencing";
}

async function scenarioDifferentKeys(userId) {
  const auth = await signIn();
  const session = await startSession(auth);
  const row = await assignment(userId, session);
  const answer = answerFor(session);
  const clients = [db(), db()];
  const keys = [`concurrency-a-${randomUUID()}`, `concurrency-b-${randomUUID()}`];
  const payloads = keys.map((key) => claimInput(userId, session, key, answer));
  const claims = await Promise.all(payloads.map((payload, index) => claim(clients[index], userId, "submitAttempt", payload.path, payload.idempotencyKey, payload)));
  assert(claims.every((value) => value.kind === "new"), "different-key workers did not both claim independently");
  const results = await Promise.all(claims.map((value, index) => finalize(clients[index], userId, session, row, answer, value.token)));
  const successes = results.filter((result) => !result.error);
  const conflicts = results.filter((result) => result.error && /SESSION_VERSION_CONFLICT/.test(result.error.message ?? ""));
  assert(successes.length === 1 && conflicts.length === 1, "different keys did not produce exactly one version-fenced commit");
  const effects = await committedAttemptCount(userId, session);
  assert(effects.attempts === 1 && effects.revisions === 1, "different-key race created duplicate effects");
  const winnerIndex = results.findIndex((result) => !result.error);
  const winningVersion = successes[0].data.session.version;
  await Promise.all(claims.map((value, index) => index === winnerIndex ? Promise.resolve() : release(clients[index], userId, "submitAttempt", payloads[index].path, keys[index], value.token)));
  await endWithClaim(userId, { ...session, version: winningVersion });
  await signOut(auth);
  return "different idempotency keys, same-version race, and version-fenced single commit";
}

async function scenarioFinalizeEndRace(userId) {
  const auth = await signIn();
  const session = await startSession(auth);
  const row = await assignment(userId, session);
  const answer = answerFor(session);
  const submitKey = `concurrency-finalize-${randomUUID()}`;
  const endKey = `concurrency-end-${randomUUID()}`;
  const submitPayload = claimInput(userId, session, submitKey, answer);
  const endPayload = { sessionId: session.id, expectedSessionVersion: session.version, idempotencyKey: endKey, path: `/api/v1/sessions/${session.id}/end` };
  const submitClient = db(); const endClient = db();
  const submitClaim = await claim(submitClient, userId, "submitAttempt", submitPayload.path, submitKey, submitPayload);
  const endClaim = await claim(endClient, userId, "endSession", endPayload.path, endKey, endPayload);
  const [submitResult, endResult] = await Promise.all([
    finalize(submitClient, userId, session, row, answer, submitClaim.token),
    endClient.rpc("spark_end_learning_session", { p_student_id: userId, p_session_id: session.id, p_expected_version: session.version, p_claim_token: endClaim.token }),
  ]);
  const submitWon = !submitResult.error;
  const endWon = !endResult.error;
  assert(submitWon !== endWon, "finalization/end race unexpectedly committed both workers");
  if (submitResult.error && !/INVALID_SESSION_STATE|SESSION_VERSION_CONFLICT/.test(submitResult.error.message ?? "")) throw submitResult.error;
  if (endResult.error && !/INVALID_SESSION_STATE|SESSION_VERSION_CONFLICT/.test(endResult.error.message ?? "")) throw endResult.error;
  if (submitResult.error) await release(submitClient, userId, "submitAttempt", submitPayload.path, submitKey, submitClaim.token);
  if (endResult.error) await release(endClient, userId, "endSession", endPayload.path, endKey, endClaim.token);
  const effects = await committedAttemptCount(userId, session);
  assert(effects.attempts <= 1 && effects.revisions <= 1, "finalization/end race duplicated learning effects");
  if (submitWon) await endWithClaim(userId, { ...session, version: submitResult.data.session.version });
  await signOut(auth);
  return "finalization/end race with one winner and stale-worker rejection";
}

async function scenarioExpiredRecovery(userId) {
  const auth = await signIn();
  const session = await startSession(auth);
  const row = await assignment(userId, session);
  const answer = answerFor(session);
  const key = `concurrency-expired-${randomUUID()}`;
  const payload = claimInput(userId, session, key, answer);
  const staleClient = db();
  const stale = await claim(staleClient, userId, "submitAttempt", payload.path, key, payload);
  assert(stale.kind === "new", "expired-claim setup did not create a claim");
  const expired = await admin.from("learning_idempotency").update({ claim_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("claim_token", stale.token);
  if (expired.error) throw expired.error;
  const takeover = await claim(db(), userId, "submitAttempt", payload.path, key, payload);
  assert(takeover.kind === "new" && takeover.token !== stale.token, "expired claim was not recovered");
  const staleFinalize = await finalize(staleClient, userId, session, row, answer, stale.token);
  assert(staleFinalize.error && /REQUEST_IN_PROGRESS/.test(staleFinalize.error.message ?? ""), "stale worker was not fenced after takeover");
  const committed = await finalize(db(), userId, session, row, answer, takeover.token);
  if (committed.error) throw committed.error;
  const replay = await claim(db(), userId, "submitAttempt", payload.path, key, payload);
  assert(replay.kind === "replay", "recovered committed response did not replay");
  const effects = await committedAttemptCount(userId, session);
  assert(effects.attempts === 1 && effects.revisions === 1, "expired recovery duplicated learning effects");
  await endWithClaim(userId, { ...session, version: committed.data.session.version });
  await signOut(auth);
  return "expired-claim takeover, stale finalization fencing, and lost-response replay";
}

const auth = await signIn();
const dashboard = await http(auth.jar, "/api/v1/student/dashboard");
assert(dashboard.response.status === 200 && !dashboard.body.activeSession, "synthetic student has an active session; clean it before concurrency verification");
const userId = auth.userId;
const results = [];
results.push(await scenarioIdentical(userId));
results.push(await scenarioDifferentKeys(userId));
results.push(await scenarioFinalizeEndRace(userId));
results.push(await scenarioExpiredRecovery(userId));
await signOut(auth);
console.log(`Concurrency PASS: ${results.length} controlled worker scenarios completed with single-effect/replay/fencing assertions (${results.join("; ")}).`);
