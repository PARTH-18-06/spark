import { describe, expect, it, vi } from "vitest";

import { authenticatedStateSchema, authStateSchema, studentProfileSchema } from "@/lib/server/contracts/tutor-schemas";
import { createAuthHandlers } from "@/lib/server/auth/handlers";
import { AuthProviderError, type AuthDependencies, type AuthProvider, type AuthStore, type CreateStoredSession, type IdentityRecord, type StoredSession } from "@/lib/server/auth/types";

const NOW = new Date("2026-10-31T10:00:00.000Z");
const ORIGIN = "https://spark.test";
const PROFILE_INPUT = { displayName: "Aarav Student", chapterId: "class-10-physics-electricity" as const, examDate: "2026-12-15", timeZone: "Asia/Kolkata" };

class MemoryStore implements AuthStore {
  sessions = new Map<string, StoredSession>(); tokenHashes = new Map<string, string>(); identities = new Map<string, IdentityRecord>();
  rateAllowed = true; revoked: string[] = []; savedFor: string[] = [];
  async findSession(hash: string) { const id = this.tokenHashes.get(hash); return id ? this.sessions.get(id) ?? null : null; }
  async createSession(session: CreateStoredSession) { this.sessions.set(session.id, session); this.tokenHashes.set(session.sessionTokenHash, session.id); }
  async updateProviderTokens(id: string, access: string, refresh: string, expiry: Date) { const row = this.sessions.get(id)!; row.accessTokenCiphertext = access; row.refreshTokenCiphertext = refresh; row.providerExpiresAt = expiry; }
  async revokeSession(id: string) { this.revoked.push(id); for (const [hash, value] of this.tokenHashes) if (value === id) this.tokenHashes.delete(hash); }
  async loadIdentity(id: string) { return this.identities.get(id) ?? null; }
  async saveStudentProfile(id: string, input: typeof PROFILE_INPUT) { this.savedFor.push(id); const profile = { ...input, onboardingComplete: true }; const identity = this.identities.get(id)!; identity.studentProfile = profile; identity.user.displayName = input.displayName; return profile; }
  async consumeLoginAttempt() { return { allowed: this.rateAllowed, retryAfterSeconds: this.rateAllowed ? 0 : 30 }; }
  async clearLoginAttempts() {}
  async teacherHasClass() { return true; }
  async teacherHasStudent() { return true; }
}

class MemoryProvider implements AuthProvider {
  mode: "ok" | "invalid-login" | "verify-invalid" | "refresh-invalid" | "outage" = "ok"; refreshes = 0; signOuts = 0;
  async signIn(email: string) { if (this.mode === "invalid-login") throw new AuthProviderError("invalid", "bad credentials"); if (this.mode === "outage") throw new AuthProviderError("unavailable", "offline"); return { accessToken: email.startsWith("teacher") ? "teacher-access" : "student-access", refreshToken: "provider-refresh-secret", expiresAt: new Date(NOW.getTime() + 3600_000) }; }
  async verifyUser(access: string) { if (this.mode === "outage") throw new AuthProviderError("unavailable", "offline"); if (this.mode === "verify-invalid") throw new AuthProviderError("invalid", "expired"); return { id: access.startsWith("teacher") ? "teacher-1" : "student-1" }; }
  async refresh() { this.refreshes++; if (this.mode === "refresh-invalid" || this.mode === "verify-invalid") throw new AuthProviderError("invalid", "refresh rejected"); if (this.mode === "outage") throw new AuthProviderError("unavailable", "offline"); return { accessToken: "student-refreshed-access", refreshToken: "rotated-provider-refresh-secret", expiresAt: new Date(NOW.getTime() + 3600_000) }; }
  async signOut() { this.signOuts++; if (this.mode === "outage") throw new AuthProviderError("unavailable", "offline"); }
}

function fixture() {
  const store = new MemoryStore(); const provider = new MemoryProvider();
  store.identities.set("student-1", { user: { id: "student-1", displayName: "Student", roles: ["student"] }, studentProfile: null });
  store.identities.set("teacher-1", { user: { id: "teacher-1", displayName: "Teacher", roles: ["teacher"] }, studentProfile: null });
  const dependencies: AuthDependencies = {
    provider, store,
    config: { allowedOrigins: [ORIGIN], cookieName: "spark_session", cookieSecure: true, sessionTtlSeconds: 7200, refreshSkewSeconds: 60, rateLimitSecret: "r".repeat(32), trustProxy: false },
    encrypt: (value) => `enc:${value}`, decrypt: (value) => value.slice(4), now: () => new Date(NOW),
  };
  return { store, provider, handlers: createAuthHandlers(dependencies) };
}

const request = (path: string, init: RequestInit = {}) => new Request(`https://spark.test${path}`, init);
function mutation(path: string, body?: unknown, headers: Record<string, string> = {}) { return request(path, { method: "POST", headers: { origin: ORIGIN, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
async function signIn(f = fixture(), email = "student@example.test") { const response = await f.handlers.signIn(mutation("/api/v1/auth/sign-in", { email, password: "correct-password" })); const setCookie = response.headers.get("set-cookie")!; return { ...f, response, body: await response.json(), cookie: setCookie.split(";", 1)[0]! }; }

describe("authentication and onboarding handlers", () => {
  it("returns the documented anonymous auth state directly", async () => { const response = await fixture().handlers.getCurrentUser(request("/api/v1/auth/me")); expect(response.status).toBe(200); expect(authStateSchema.parse(await response.json())).toEqual({ authenticated: false, user: null, studentProfile: null, csrfToken: null, expiresAt: null }); expect(response.headers.get("cache-control")).toContain("no-store"); });

  it("signs in with a direct authenticated body and hardened opaque cookie", async () => { const result = await signIn(); expect(result.response.status).toBe(200); expect(authenticatedStateSchema.parse(result.body).user.id).toBe("student-1"); const header = result.response.headers.get("set-cookie")!; expect(header).toMatch(/^spark_session=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=7200; Secure$/); expect(JSON.stringify(result.body)).not.toMatch(/provider-refresh|student-access|correct-password/); });

  it("rejects invalid credentials without password or token leakage", async () => { const f = fixture(); f.provider.mode = "invalid-login"; const response = await f.handlers.signIn(mutation("/api/v1/auth/sign-in", { email: "student@example.test", password: "super-secret-password" })); expect(response.status).toBe(401); const text = await response.text(); expect(JSON.parse(text).error).toMatchObject({ code: "INVALID_CREDENTIALS", retryable: false }); expect(text).not.toContain("super-secret-password"); });

  it("distinguishes provider outages from invalid credentials", async () => { const f = fixture(); f.provider.mode = "outage"; const response = await f.handlers.signIn(mutation("/api/v1/auth/sign-in", { email: "student@example.test", password: "secret" })); expect(response.status).toBe(500); expect(await response.json()).toMatchObject({ error: { code: "INTERNAL_ERROR", retryable: true, message: "Authentication provider is unavailable" } }); });

  it("rejects untrusted or missing sign-in origins", async () => { const f = fixture(); for (const origin of ["https://evil.test", undefined]) { const response = await f.handlers.signIn(request("/api/v1/auth/sign-in", { method: "POST", headers: origin ? { origin } : {}, body: JSON.stringify({ email: "student@example.test", password: "secret" }) })); expect(response.status).toBe(403); expect((await response.json()).error.code).toBe("FORBIDDEN"); } });

  it("enforces the database-backed login limiter result", async () => { const f = fixture(); f.store.rateAllowed = false; const response = await f.handlers.signIn(mutation("/api/v1/auth/sign-in", { email: "student@example.test", password: "secret" })); expect(response.status).toBe(429); expect(await response.json()).toMatchObject({ error: { code: "RATE_LIMITED", retryable: true, retryAfterSeconds: 30 } }); });

  it("loads an authenticated session and refreshes expiring provider tokens", async () => { const result = await signIn(); const row = [...result.store.sessions.values()][0]!; row.providerExpiresAt = new Date(NOW.getTime() + 10_000); const response = await result.handlers.getCurrentUser(request("/api/v1/auth/me", { headers: { cookie: result.cookie } })); expect(response.status).toBe(200); expect((await response.json()).authenticated).toBe(true); expect(result.provider.refreshes).toBe(1); expect(row.accessTokenCiphertext).toBe("enc:student-refreshed-access"); });

  it("turns an invalid refresh into anonymous state and clears matching cookie attributes", async () => { const result = await signIn(); [...result.store.sessions.values()][0]!.providerExpiresAt = new Date(NOW.getTime() - 1000); result.provider.mode = "refresh-invalid"; const response = await result.handlers.getCurrentUser(request("/api/v1/auth/me", { headers: { cookie: result.cookie } })); expect(await response.json()).toMatchObject({ authenticated: false }); expect(response.headers.get("set-cookie")).toBe("spark_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure"); expect(result.store.revoked).toHaveLength(1); });

  it("does not report a verification outage as anonymous", async () => { const result = await signIn(); result.provider.mode = "outage"; const response = await result.handlers.getCurrentUser(request("/api/v1/auth/me", { headers: { cookie: result.cookie } })); expect(response.status).toBe(500); expect(await response.json()).toMatchObject({ error: { code: "INTERNAL_ERROR", retryable: true } }); });

  it("returns anonymous and clears an expired backend session", async () => { const result = await signIn(); [...result.store.sessions.values()][0]!.expiresAt = new Date(NOW.getTime() - 1); const response = await result.handlers.getCurrentUser(request("/api/v1/auth/me", { headers: { cookie: result.cookie } })); expect((await response.json()).authenticated).toBe(false); expect(response.headers.get("set-cookie")).toContain("Max-Age=0"); });

  it("requires the correct session-bound CSRF token for sign-out", async () => { const result = await signIn(); for (const csrf of [undefined, "wrong-session-token"]) { const response = await result.handlers.signOut(mutation("/api/v1/auth/sign-out", undefined, { cookie: result.cookie, ...(csrf ? { "x-csrf-token": csrf } : {}) })); expect(response.status).toBe(403); } const response = await result.handlers.signOut(mutation("/api/v1/auth/sign-out", undefined, { cookie: result.cookie, "x-csrf-token": result.body.csrfToken })); expect(response.status).toBe(204); expect(await response.text()).toBe(""); expect(result.provider.signOuts).toBe(1); expect(response.headers.get("set-cookie")).toContain("Max-Age=0"); });

  it("rotates CSRF on a new session and rejects a token from another session", async () => { const first = await signIn(); const second = await signIn(first); expect(second.body.csrfToken).not.toBe(first.body.csrfToken); const response = await second.handlers.signOut(mutation("/api/v1/auth/sign-out", undefined, { cookie: second.cookie, "x-csrf-token": first.body.csrfToken })); expect(response.status).toBe(403); });

  it("allows repeated anonymous sign-out with 204 and no body", async () => { const response = await fixture().handlers.signOut(request("/api/v1/auth/sign-out", { method: "POST" })); expect(response.status).toBe(204); expect(await response.text()).toBe(""); });

  it("requires authentication for profile save", async () => { const response = await fixture().handlers.saveStudentProfile(request("/api/v1/me/profile", { method: "PUT", headers: { origin: ORIGIN, "x-csrf-token": "unbound" }, body: JSON.stringify(PROFILE_INPUT) })); expect(response.status).toBe(401); expect((await response.json()).error.code).toBe("AUTH_REQUIRED"); });

  it("saves only the authenticated student's strict profile and completes onboarding", async () => { const result = await signIn(); const response = await result.handlers.saveStudentProfile(request("/api/v1/me/profile", { method: "PUT", headers: { origin: ORIGIN, cookie: result.cookie, "x-csrf-token": result.body.csrfToken, "content-type": "application/json" }, body: JSON.stringify(PROFILE_INPUT) })); expect(response.status).toBe(200); expect(studentProfileSchema.parse(await response.json()).onboardingComplete).toBe(true); expect(result.store.savedFor).toEqual(["student-1"]); });

  it("rejects unknown fields and identity/role escalation", async () => { const result = await signIn(); const response = await result.handlers.saveStudentProfile(request("/api/v1/me/profile", { method: "PUT", headers: { origin: ORIGIN, cookie: result.cookie, "x-csrf-token": result.body.csrfToken, "content-type": "application/json" }, body: JSON.stringify({ ...PROFILE_INPUT, userId: "victim", roles: ["teacher"] }) })); expect(response.status).toBe(400); expect((await response.json()).error.code).toBe("VALIDATION_ERROR"); expect(result.store.savedFor).toEqual([]); });

  it("rejects invalid dates/time zones and teacher profile mutation", async () => { const student = await signIn(); const invalid = await student.handlers.saveStudentProfile(request("/api/v1/me/profile", { method: "PUT", headers: { origin: ORIGIN, cookie: student.cookie, "x-csrf-token": student.body.csrfToken, "content-type": "application/json" }, body: JSON.stringify({ ...PROFILE_INPUT, examDate: "2026-02-30", timeZone: "Mars/Olympus" }) })); expect(invalid.status).toBe(400); const teacher = await signIn(fixture(), "teacher@example.test"); const forbidden = await teacher.handlers.saveStudentProfile(request("/api/v1/me/profile", { method: "PUT", headers: { origin: ORIGIN, cookie: teacher.cookie, "x-csrf-token": teacher.body.csrfToken, "content-type": "application/json" }, body: JSON.stringify(PROFILE_INPUT) })); expect(forbidden.status).toBe(403); expect(teacher.body.studentProfile).toBeNull(); });

  it("does not log credentials or provider tokens", async () => { const error = vi.spyOn(console, "error").mockImplementation(() => {}); const log = vi.spyOn(console, "log").mockImplementation(() => {}); const result = await signIn(); expect(error).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled(); expect(JSON.stringify(result.body)).not.toContain("provider-refresh-secret"); error.mockRestore(); log.mockRestore(); });
});
