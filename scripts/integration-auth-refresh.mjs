import { createCipheriv, randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { config as loadEnvironment } from "dotenv";

loadEnvironment({ path: ".env.local", quiet: true });

const required = [
  "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_TOKEN_ENCRYPTION_KEY", "SPARK_ENVIRONMENT_NAME", "SPARK_INTEGRATION_ENABLED",
  "SPARK_INTEGRATION_BASE_URL", "SPARK_INTEGRATION_ORIGIN", "DEV_STUDENT_NEW_EMAIL",
  "DEV_STUDENT_NEW_PASSWORD",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) throw new Error(`BLOCKED: missing configuration variables: ${missing.join(", ")}`);
if (process.env.SPARK_INTEGRATION_ENABLED !== "true") throw new Error("BLOCKED: integration is not enabled for the approved test target");
if (["prod", "production"].includes(process.env.SPARK_ENVIRONMENT_NAME.trim().toLowerCase())) throw new Error("BLOCKED: production-like target");
const projectRef = new URL(process.env.SUPABASE_URL).hostname.split(".")[0];
if (projectRef !== "xrfesdcbhyhxwqwyzzoh") throw new Error("BLOCKED: configured Supabase project is not the approved Spark test project");

const base = process.env.SPARK_INTEGRATION_BASE_URL.replace(/\/+$/, "");
const origin = process.env.SPARK_INTEGRATION_ORIGIN;
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

class CookieJar {
  value = "";
  absorb(response) {
    const header = response.headers.get("set-cookie");
    if (!header) return;
    const pair = header.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator < 1) return;
    const value = pair.slice(separator + 1);
    this.value = value ? pair : "";
  }
  header() { return this.value; }
}

async function request(jar, path, init = {}) {
  const headers = new Headers(init.headers);
  if (jar.header()) headers.set("cookie", jar.header());
  const response = await fetch(`${base}${path}`, { ...init, headers });
  jar.absorb(response);
  const body = response.status === 204 ? null : await response.json().catch(() => undefined);
  return { response, body };
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function mutationHeaders(csrf) { return { origin, "x-csrf-token": csrf, "content-type": "application/json" }; }
function encrypt(value) {
  const key = Buffer.from(process.env.AUTH_TOKEN_ENCRYPTION_KEY, "base64");
  assert(key.length === 32, "configured encryption key is not 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

async function activeSession(userId) {
  const result = await admin.from("backend_auth_sessions")
    .select("id,provider_expires_at,provider_access_token_ciphertext,provider_refresh_token_ciphertext,last_refreshed_at,revoked_at")
    .eq("user_id", userId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw result.error;
  assert(result.data, "backend-managed session row was not found");
  return result.data;
}

async function updateSession(id, values) {
  const result = await admin.from("backend_auth_sessions").update(values).eq("id", id);
  if (result.error) throw result.error;
}

const first = new CookieJar();
const signIn = await request(first, "/api/v1/auth/sign-in", {
  method: "POST", headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.DEV_STUDENT_NEW_EMAIL, password: process.env.DEV_STUDENT_NEW_PASSWORD }),
});
assert(signIn.response.status === 200 && signIn.body?.authenticated === true, "live sign-in failed");
const userId = signIn.body.user.id;
const csrf = signIn.body.csrfToken;
const before = await activeSession(userId);
await updateSession(before.id, { provider_expires_at: new Date(Date.now() - 1000).toISOString() });

const refreshed = await request(first, "/api/v1/auth/me");
assert(refreshed.response.status === 200 && refreshed.body?.authenticated === true, "refresh did not preserve authentication");
assert(refreshed.body.csrfToken === csrf, "refresh unexpectedly changed the backend CSRF token");
const after = await activeSession(userId);
assert(after.provider_expires_at !== before.provider_expires_at, "provider expiry was not persisted after refresh");
assert(after.last_refreshed_at !== before.last_refreshed_at, "refresh timestamp was not persisted");
assert(after.provider_access_token_ciphertext !== before.provider_access_token_ciphertext, "access token ciphertext was not rotated/persisted");
assert(after.provider_refresh_token_ciphertext !== before.provider_refresh_token_ciphertext, "refresh token ciphertext was not rotated/persisted");

const profile = refreshed.body.studentProfile;
const csrfMutation = await request(first, "/api/v1/me/profile", {
  method: "PUT", headers: mutationHeaders(csrf),
  body: JSON.stringify({ displayName: profile.displayName, chapterId: profile.chapterId, examDate: profile.examDate, timeZone: profile.timeZone }),
});
assert(csrfMutation.response.status === 200, "CSRF-protected request failed after refresh");
const signOut = await request(first, "/api/v1/auth/sign-out", { method: "POST", headers: mutationHeaders(csrf) });
assert(signOut.response.status === 204, "sign-out after refresh failed");

const second = new CookieJar();
const secondSignIn = await request(second, "/api/v1/auth/sign-in", {
  method: "POST", headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.DEV_STUDENT_NEW_EMAIL, password: process.env.DEV_STUDENT_NEW_PASSWORD }),
});
assert(secondSignIn.response.status === 200 && secondSignIn.body?.authenticated === true, "second live sign-in failed");
const invalidSession = await activeSession(secondSignIn.body.user.id);
await updateSession(invalidSession.id, {
  provider_refresh_token_ciphertext: encrypt("invalid-refresh-token"),
  provider_expires_at: new Date(Date.now() - 1000).toISOString(),
});
const invalidRefresh = await request(second, "/api/v1/auth/me");
assert(invalidRefresh.response.status === 200 && invalidRefresh.body?.authenticated === false, "invalid refresh was not converted to anonymous state");
assert(/max-age=0|expires=thu, 01 jan 1970/i.test(invalidRefresh.response.headers.get("set-cookie") ?? ""), "invalid refresh did not clear the backend cookie");
const revoked = await admin.from("backend_auth_sessions").select("revoked_at").eq("id", invalidSession.id).maybeSingle();
if (revoked.error) throw revoked.error;
assert(Boolean(revoked.data?.revoked_at), "invalid refresh did not revoke the backend session");

console.log("Auth refresh PASS: real Supabase refresh preserved authentication, persisted rotated provider tokens, preserved CSRF behavior, and revoked an invalid-refresh session.");
