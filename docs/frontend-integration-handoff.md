# Spark frontend integration handoff

## Contract and base URL

The target is the reviewed PROPOSED tutor contract v1.1.0. The authoritative
files and verified hashes are:

- `src/contracts/tutor.ts` —
  `24c35c31f4137805dffa56db4466b32ba585eb1c01ca61666b12661a11eeec07`
- `docs/frontend-api-contract.md` —
  `038cd82a468f0aae08139499a4bd6572a4dfc658c68580bea5fcf275c716c34f`

Configure the frontend API base URL without embedding secrets. For same-origin
deployment this is the site origin. For a separate backend origin, use the
backend origin and send requests with `credentials: "include"`.

## Authentication and CSRF

Authentication is a backend-managed Secure/HttpOnly/SameSite=Lax cookie. The
frontend never stores or sends Supabase access/refresh tokens and must not make
Bearer authentication its required path.

1. Call `POST /api/v1/auth/sign-in` with the configured backend `Origin` and
   `{ email, password }`; the response is the authenticated state and sets the
   session cookie.
2. Keep the returned `csrfToken` in in-memory application state only.
3. Send `credentials: "include"` on every request.
4. For every authenticated non-GET mutation, send the exact
   `X-CSRF-Token` value and an allowed `Origin`.
5. Call `GET /api/v1/auth/me` after reload to restore state. A missing or
   invalid session returns anonymous state or `AUTH_REQUIRED` as appropriate.
6. `POST /api/v1/auth/sign-out` clears the cookie and returns 204.

When frontend and backend origins differ, the backend's
`AUTH_ALLOWED_ORIGINS` must contain the exact frontend origin. Do not loosen
this setting or use wildcard origins to make local requests succeed. The
browser must be allowed to send credentials to the backend origin, and the
backend cookie's `SameSite`/`Secure` behavior must match the deployed site
topology.

## Learning mutations

Send a fresh opaque `Idempotency-Key` header for each user-intended learning
mutation. Reuse the same key and identical body only when retrying an unknown
network outcome. A different body with the same key is
`IDEMPOTENCY_CONFLICT`; an active claim is `REQUEST_IN_PROGRESS` and may be
retried after its server-provided delay.

Every session mutation includes the current `session.version` as
`expectedSessionVersion`. On `SESSION_VERSION_CONFLICT`, reload the session and
reconcile the UI before sending a new mutation. Do not increment the version
client-side.

Multiple-choice submissions use the selected option and an exactly empty
`finalAnswerText`; free-response submissions omit `selectedOptionId` and send a
nonempty final answer. Wispr Flow text should be submitted only after the
frontend has received the confirmed text.

If evaluation returns `needs_clarification`, keep the session in clarification
mode and submit the follow-up with `clarificationOfAttemptId` equal to the
latest unresolved attempt. Clarification does not change mastery or answered
count. `advanceSession` is valid only after graded feedback. `endSession`
abandons the active session without creating a summary; `getSession` is the
source of truth after reload.

## Response and error handling

Successful tutor responses are the documented object or array directly; there
is no `{ data: ... }` or `{ success: ... }` wrapper. `startSession` returns 201,
`signOut` returns 204, and other successful operations return 200.

Non-2xx responses have this shape:

```json
{
  "error": {
    "code": "SESSION_VERSION_CONFLICT",
    "message": "Reload before submitting.",
    "retryable": false,
    "requestId": "opaque-request-id"
  }
}
```

Validate response bodies against the v1.1.0 schemas. Retry only when the
contract marks an error retryable or when replaying an identical idempotent
mutation after an unknown network outcome. Never display `requestId` as a
secret or log response bodies containing student answers.

Rewards are intentionally disabled in v1.1.0: every response uses
`{ "account": null, "grants": [] }`.

## Secure integration accounts

Use only synthetic accounts in an explicitly approved local or dedicated test
Supabase project. Set the password variables in `.env.local` or the current
shell; they are intentionally absent from `.env.example` and must never be
committed. Run `pnpm db:provision:dev` only with
`SPARK_ALLOW_DEV_PROVISIONING=true` and a non-production
`SPARK_ENVIRONMENT_NAME`. The provisioner creates a teacher assigned to the
synthetic class, a second teacher without that assignment, and two students.

The backend team should provide frontend developers access through the team's
approved secret manager or password-sharing channel. Do not put account
passwords, cookies, CSRF tokens, or user IDs in this document or bug reports.

## Verification workflows

Credential-free checks currently pass:

- `pnpm verify:contract`
- `pnpm typecheck`
- `pnpm test`
- `pnpm db:test`
- `pnpm build`

The real integration harness is deliberately separate:

```powershell
pnpm integration:preflight
pnpm integration:test
```

It requires an approved target, real Supabase/Groq configuration, four
synthetic account credentials, and `SPARK_INTEGRATION_ENABLED=true`. It uses a
cookie jar, unique run-scoped idempotency keys, runtime schema validation, and
does not reset or broadly clean the database. Before any hosted mutation, run
`pnpm integration:db-check` (which runs the read-only checks
`supabase migration list --linked` and `supabase db diff --linked`) after
confirming the exact project and explicit integration authorization. Never use
`supabase db reset` for this workflow.

## Current blockers

`.env.local` is ignored by Git and contains the approved dedicated test
configuration; values are never committed or printed. The authorized hosted
integration suite passed Auth, PostgREST, real Groq evaluation, permissions,
and persistence across reload. Prompt 12 refresh and controlled
concurrency/recovery checks now pass; only physical Wispr microphone/dictation
remains unverified. No production deployment or hosted database reset was
performed.

## Integrated delivery (Prompt 11)

The teammate delivery was reviewed from the isolated checkout
`C:\Users\Asus\OneDrive\Documents\ChatGPT\spark-frontend-abhishek`, branch
`Abhishek`, commit `e6cfb14ad55ae3ee1d2d6b6f9f0b3ab6fae4c26e`. It was merged
selectively into the backend workspace; backend routes, services, migrations,
tests, and the authoritative contract were not replaced. The delivered
contract source was CRLF-normalized to the authoritative hash above; the
delivered API markdown differed and was not copied over the reviewed backend
document.

The integrated adapter is live-only when `NEXT_PUBLIC_TUTOR_API_MODE=http`,
uses same-origin `/api/v1` requests with `credentials: "include"`, keeps CSRF
tokens in memory, validates direct success/error bodies, and preserves exact
idempotency payloads for retries. Rewards remain disabled. The frontend's
confirmed-text Wispr workflow is present, but actual microphone dictation was
not exercised.

Verification observed after integration:

- `pnpm verify:contract`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and the
  hosted backend suite passed; live backend operation coverage remains **17/17**.
- At the Prompt 11 checkpoint, frontend adapter tests passed **26/26**, the
  focused persistence/replay regression was included in the root Vitest run,
  and mock Playwright coverage passed **7/7**. Prompt 12 expanded this to
  **8/8** below.
- A real browser run passed sign-in, onboarding, student dashboard and concept
  selection, practice, Groq feedback, reload/resume, advancement, abandonment,
  sign-out, teacher roster/class dashboard, and teacher student detail. A
  transient `REQUEST_IN_PROGRESS` response from the already-committed hosted
  SQL completion path was recovered by retrying the exact same mutation; no
  duplicate learning effect was observed. The production repository now
  tolerates that duplicate-completion signal, and the final hosted suite passed
  **17/17** operations without the false failure.
- Physical Wispr microphone/dictation remains unverified; the delivered
  confirmed-text workflow is covered, but microphone input requires a manual
  browser check.

## Prompt 12 verification closure

- `pnpm integration:auth-refresh` passed through the real Supabase provider
  refresh path using a test-owned session fixture. Rotated provider metadata
  persisted, the authenticated CSRF-protected follow-up succeeded, and an
  invalid refresh revoked the session and cleared authentication state.
- `pnpm integration:concurrency` passed four controlled independent-worker
  scenarios (same-key overlap, distinct-key version race, finalization/end race,
  and expired-claim takeover). Database assertions found one learning effect,
  stable replay, and stale-worker rejection in each case. This is separate from
  the real Groq smoke test and does not claim provider concurrency beyond these
  exercised cases.
- The expanded mock Playwright suite passed **8/8**, adding progress and attempt
  history after a committed answer. The final live browser run also observed
  teacher visibility after newly committed student activity. Physical Wispr
  dictation remains **unverified** pending the manual check in
  [`docs/hackathon-demo.md`](hackathon-demo.md).

Run locally with `pnpm install`, `pnpm dev`, and open
`http://localhost:3000`. Keep all Supabase/Groq/service-role values in the
ignored `.env.local`; none are required in browser code.

For setup, obtain Supabase project URL and keys from the project's Dashboard
API Keys page ([official Supabase documentation](https://supabase.com/docs/guides/getting-started/api-keys)).
Create the Groq key in [GroqCloud](https://console.groq.com/keys) and select an
evaluation model supported by this repository's strict-output allowlist. The
current Groq structured-output model documentation is available at
[Groq Structured Outputs](https://console.groq.com/docs/structured-outputs).
