# Spark backend with integrated frontend

Next.js App Router workspace for the Spark adaptive Class 10 Physics:
Electricity tutor. The backend remains the protected integration boundary and
the teammate's reviewed frontend is now integrated locally.

## Authoritative contract

The implementation target is the reviewed **PROPOSED v1.1.0** pair:

- `src/contracts/tutor.ts`
- `docs/frontend-api-contract.md`

They were imported byte-for-byte from the explicitly selected WhatsApp files
`tutor (1).ts` and `frontend-api-contract (1).md`. The two entries in
`spark-contract-proposed-v1.1.0.zip` were independently checked and are
byte-identical to those standalone files.

`pnpm verify:contract` pins both authoritative SHA-256 hashes, verifies version
`1.1.0`, required exports, all 17 endpoint declarations, every documented JSON
example, and representative lifecycle/reward invariants. Contract changes must
be coordinated in both authoritative files and require a new agreed version.

## Ownership boundary

- Backend owns `src/app/api/v1/**`, `src/lib/server/**`, server tests, database
  migrations, authentication enforcement, Groq integration, grading, mastery,
  scheduling, permissions, and idempotency.
- Frontend owns pages, layouts, UI components, styles, browser state, Wispr
  confirmed-text entry, and the `TutorApi` adapters. The integrated frontend
  source is under `src/app` (outside `src/app/api`), `src/components`,
  `src/lib/tutor-api`, and `src/mocks`; backend routes and server modules remain
  under the backend ownership boundary above.
- The health route at `src/app/api/v1/system/health` is infrastructure. It is
  not one of the 17 tutor operations.

## Setup and commands

Requires Node.js 20.9+ and pnpm.

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

Quality checks:

```powershell
pnpm verify:contract
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

Real integration is intentionally separate and requires an explicitly approved
local/dedicated target. It never runs as part of `pnpm test` or `pnpm verify`:

```powershell
pnpm integration:preflight
pnpm integration:db-check
pnpm integration:test
```

## Backend structure

- `src/app/api/v1`: versioned route handlers only.
- `src/contracts/tutor.ts`: dependency-free shared compile-time contract.
- `src/lib/server/contracts/tutor-schemas.ts`: strict runtime schemas and a
  schema registry for all 17 operations.
- `src/lib/server`: server-only auth, clients, configuration, validation, and
  HTTP utilities. Every module imports `server-only`.
- `src/lib/server/learning`: deterministic mastery, misconception, question
  selection, scheduling, and persistence-boundary policy services.
- `src/lib/server/evaluation`: server-only deterministic checks, strict Groq
  analysis, catalog validation, and provider failure handling.
- `tests`: contract-example, invariant, request-security, and HTTP tests.
- `tests/http.test.ts`, `tests/mock.test.ts`, and
  `tests/pending-validation.test.ts`: frontend adapter checks run by
  `pnpm test:frontend`; `tests/session-repository.test.ts` covers the direct
  attempt-result/replay regression in the root Vitest run.
- `supabase/migrations`: versioned database schema, invariants, grants, and RLS.
- `supabase/seed.sql`: repeatable eight-concept and 24-question catalog seed.
- `docs/database-setup.md`: safe local/remote migration and provisioning guide.
- `docs/learning-sessions.md`: student session routes, idempotency, and
  lifecycle invariants.
- `docs/frontend-integration-handoff.md`: cookie/CSRF integration, mutation
  retry rules, secure synthetic accounts, and live-verification blockers.
- `docs/verification-report.md`: exact frontend delivery, automated checks,
  live browser journeys, refresh/concurrency evidence, and remaining manual
  voice verification.
- `docs/hackathon-demo.md`: short live-demo walkthrough, checklist, Wispr test,
  and honest fallbacks.

## Wire conventions

Tutor successes return the documented object or array directly. They are never
wrapped in `{ "data": ... }` or `{ "success": ... }`. `startSession` uses 201,
`signOut` uses an empty 204, and other tutor successes use 200.

Every non-2xx tutor response uses the exact `ApiErrorBody` shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request payload does not match the API contract",
    "retryable": false,
    "requestId": "opaque-request-id",
    "fieldErrors": { "finalAnswerText": "Required" }
  }
}
```

Authentication is backend-managed: Secure/HttpOnly/SameSite=Lax session cookie,
`credentials: "include"`, explicit allowed Origin, and `X-CSRF-Token` on
authenticated non-GET requests. Bearer tokens are not the frontend contract.
The cookie contains only a random opaque session handle. Supabase access and
refresh tokens and the session CSRF secret are AES-256-GCM encrypted in the
private backend session table. CSRF comparison is bound to that session, and
new sign-ins rotate both the session and CSRF values. See
`docs/authentication.md` for the complete lifecycle and configuration.

Learning mutations carry `Idempotency-Key` as a header. The body schemas omit
the adapter-only `idempotencyKey`. Session mutations validate the current
version, phase, answer format, and replay behavior as described in the contract.
Rewards remain disabled: every reward shape is exactly
`{ "account": null, "grants": [] }`.

## Current implementation status

- Contract/schema coverage: **17/17 operations** have strict runtime request
  and response schemas registered and the documented examples validate.
- Tutor route files and production wiring: **17/17 operations**: auth state,
  sign-in, sign-out, student profile save, six learning-session operations,
  and the seven dashboard/progress/history/teacher reads. All **17/17** were
  verified through the authorized hosted Supabase/Groq integration suite.
- Infrastructure route implementation: `/api/v1/system/health` only.
- Database foundation: seven versioned migrations, repeatable chapter/question
  seed, isolated PostgreSQL constraint/RLS tests, and development roster
  provisioning tooling are implemented. The seven migrations and repeatable
  seed are applied to the authorized test project; its synthetic roster was
  provisioned and the opt-in was disabled afterward.

- Student learning-session routes: **6/6 in this slice** (`getConcepts`,
  `startSession`, `getSession`, `submitAttempt`, `advanceSession`, and
  `endSession`). They use backend-managed auth/CSRF, direct v1.1.0 success
  bodies, strict payload validation, short-lived idempotency claims, version
  fences, and an evaluator-outside-persistence flow. The injected repository
  is fully exercised locally; production writes are delegated to named
  Supabase RPC boundaries implemented in migrations 005/006 and exercised in
  the hosted test project.
- Evaluation service: implemented and mock-tested; no Groq request is made at
  module import, and a real structured evaluation passed in the hosted suite.

The seven read operations are implemented through backend-managed handlers and
the migration 007 read-model RPCs; their SQL, authorization paths, and hosted
execution are verified by the live suite. Controlled provider-refresh and
concurrency/recovery verification now pass; physical Wispr dictation remains
manual and unverified. The session service deliberately does not hold
a database transaction open around Groq; a short claim transaction fences
recovery and a separate finalization RPC must atomically commit attempt,
mastery, misconception, revision, session, and replay state.

The integrated frontend delivery is branch `Abhishek` at commit
`e6cfb14ad55ae3ee1d2d6b6f9f0b3ab6fae4c26e`. The authoritative contract hash
remains `24c35c31f4137805dffa56db4466b32ba585eb1c01ca61666b12661a11eeec07`;
the delivered documentation differed and was not used to replace the reviewed
backend contract. Automated frontend adapter tests pass **26/26**, mock browser
coverage passes **8/8**, and the live browser journey passed sign-in,
onboarding, real evaluation, reload/resume, advancement, abandonment,
teacher class/student visibility, and sign-out. Actual Wispr microphone
dictation remains unverified; provider refresh and the four controlled
concurrency/recovery scenarios pass. The
production repository also tolerates the deployed SQL RPC's already-committed
duplicate completion signal; the final hosted integration run passed **17/17**.

Before live integration, place real values only in `.env.local`: Supabase URL,
anon/service-role keys, Groq key, reviewed model IDs, deployed allowed origins,
auth token-encryption/rate-limit secrets, evaluation timeout/retry settings,
and production cookie security. Never commit or expose service-role, Groq,
encryption, or provider tokens. See `docs/evaluation-service.md`.
