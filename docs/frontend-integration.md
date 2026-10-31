# Spark frontend integration — AGREED v1.1.0

This is the operational handoff for connecting Spark to the teammate-owned backend. The behavioral source of truth remains `frontend-api-contract.md` and the byte-frozen `src/contracts/tutor.ts` (SHA-256 `24c35c31f4137805dffa56db4466b32ba585eb1c01ca61666b12661a11eeec07`).

## Step 4 journey coverage

All screen data access now goes through `TutorApi`. The mock adapter exercises the complete UI boundary; the HTTP adapter remains the only path used when `NEXT_PUBLIC_TUTOR_API_MODE=http`.

- Student home: dashboard profile, active-session resume, diagnostic entry, due revisions, recommendations, mastery/evidence estimates, and recent/abandoned sessions.
- Assessment: diagnostic, practice, and revision share one session journey. It renders server questions and progress, keeps final answer and reasoning separate, reveals supplied hints, validates answer format, and never grades in the browser.
- Feedback and clarification: status, explanation, misconception/evidence, mastery estimates, evidence count, review date, and clarification-of-attempt identity are shown as returned. Clarification creates a new submission identity and does not locally change mastery.
- Recovery: scoped drafts and pending payloads survive refresh and unknown network/protocol outcomes. Exact retries reuse the original immutable body and idempotency key. Explicit end-session supports answering, feedback, and clarification.
- Completion and learning views: persisted summaries distinguish completed/abandoned sessions; concepts, revision queue, progress/history, and cursor pagination display backend dates, states, counts, and relationships without deriving schedules or analytics.
- Teacher: class selector, aggregate concept table, misconception grouping by `conceptId:misconceptionCode`, revision priorities, and student detail are authorized adapter reads. A demo persona never grants HTTP permissions.

The browser test suite (`npm run test:e2e`) verifies these mock journeys, keyboard focus, mobile navigation, reduced motion, and console errors. Live compatibility remains a separate backend handoff step.

## Select the adapter

Use one of these public build-time settings:

```dotenv
NEXT_PUBLIC_TUTOR_API_MODE=http
NEXT_PUBLIC_TUTOR_API_BASE_URL=/api/v1
```

`mock` is the default. `http` makes real requests and never falls back to demo responses. Restart the development server after changing a `NEXT_PUBLIC_*` value because Next.js inlines it into the browser bundle.

## Browser authentication

- The backend owns an HttpOnly session cookie. The browser adapter always sends `credentials: "include"`.
- `GET /api/v1/auth/me` bootstraps both auth state and the CSRF token.
- `POST /api/v1/auth/sign-in` does not require a prior CSRF token. Spark never persists the password.
- Every other non-GET request sends the latest `X-CSRF-Token` when the authenticated response supplied one.
- `POST /api/v1/auth/sign-out` accepts an empty 204 and clears frontend private session state.
- A 401 clears the adapter's CSRF value. The UI must refresh auth or return to sign-in before another protected mutation.
- Same-origin `/api/v1` is the agreed deployment default. If development uses separate origins, the backend must use an explicit credentialed CORS allowlist; wildcard origins are invalid with cookies.

Expected cookie defaults are Secure on HTTPS, HttpOnly, and SameSite=Lax. The backend remains responsible for real authorization: student/teacher role, assigned class, roster membership, and resource ownership.

## Idempotency and unknown outcomes

`startSession`, `submitAttempt`, `advanceSession`, and `endSession` move `idempotencyKey` from JSON into the `Idempotency-Key` header. The frontend coordinator saves the exact request before sending it.

- Unchanged explicit retry reuses the original payload and key.
- Edited answers and clarification submissions require a new identity.
- Network failures, protocol failures on mutations, and server-marked retryable failures retain the pending request.
- A pending unknown outcome blocks competing learning mutations.
- Definitive validation/version/state errors release the pending identity while the session UI preserves editable draft text.
- Refreshing uses `getSession`; it never resubmits an answer. Replaying the original mutation remains the authoritative way to recover its result.

## Response validation

`HttpTutorApi` rejects a response when the success status, JSON media type, JSON syntax, error shape, or success invariants do not match v1.1.0. Protocol errors expose only a safe classification and validated request ID; raw HTML or proxy bodies are not surfaced.

Rewards must remain exactly:

```json
{"account":null,"grants":[]}
```

Unknown misconception codes are also rejected until both owners add them to a later shared catalog/version.

## Backend handoff inputs

Provide these out of band; do not commit credentials:

- Running same-origin development URL or a confirmed credentialed CORS origin pair.
- One pre-created student account that still needs onboarding.
- One returning-student account with revision/progress history.
- One teacher account assigned to the seeded class.
- Seeded class ID and the expected roster members.
- Trusted development origins and cookie behavior for HTTP versus HTTPS.

## Open integration decisions

These do not change v1.1.0 shapes but still need teammate confirmation before live testing:

1. Exact local frontend/backend ports and trusted Origin allowlist if same-origin proxying is not used.
2. Secure-cookie strategy for local HTTP development and whether the backend will provide an HTTPS dev URL.
3. Test-account emails/password delivery channel and seeded class/student IDs.
4. Backend diagnostic length, question calibration, mastery thresholds, and reasoning rubric; the frontend only renders returned values.
5. Request timeout/hosting proxy limits for grading calls and the expected `Retry-After` behavior for 429/503 responses.

Rewards are disabled, the roster is seeded, accounts are pre-created, cookies/CSRF are backend-managed, and `/api/v1` is same-origin unless both owners explicitly agree a new version/configuration.

## Live compatibility checklist

Run this separately from `npm test`, which uses deterministic mock/fake HTTP responses:

1. Sign in as each supplied account, refresh, and sign out.
2. Save the new-student profile and confirm identity is derived from the cookie.
3. Start and resume diagnostic/practice/revision sessions.
4. Submit one free response, one multiple choice answer, and one clarification; verify exact retry returns the same IDs.
5. Simulate a lost response, replay the same key/body, and verify no duplicate evidence.
6. End sessions from answering, feedback, and clarification; ensure a new session can start.
7. Confirm abandoned revision items remain unfinished and graded progress remains committed.
8. Compare queue statuses, next-review dates, due counts, misconception codes, and teacher aggregates.
9. Verify student access to teacher endpoints is 403 and inaccessible class/student resources are 404.
10. Confirm every reward shape is disabled and inspect the browser console/network panel for protocol errors.

## Short live demo script

1. Set `NEXT_PUBLIC_TUTOR_API_MODE=http` and `NEXT_PUBLIC_TUTOR_API_BASE_URL=/api/v1`, restart Next, and sign in with the supplied student account.
2. Save onboarding if required, start/resume a session, submit one multiple-choice and one free-response answer, then refresh in answering, feedback, and clarification phases.
3. Verify the response IDs, `clarificationOfAttemptId`, progress, mastery estimates, evidence counts, misconception codes, and review dates match the backend exactly.
4. End a session from each active phase and confirm the abandoned snapshot does not receive a completion celebration; start a new session afterward.
5. Complete and abandon a revision session, then confirm the queue is refetched and unfinished items remain unfinished.
6. Sign out, sign in as the supplied teacher, inspect class and student details, and confirm a student receives 403/404 for teacher or unauthorized resources.

No live run is reported until this script is exercised against the teammate's service.
