# Spark frontend handoff — Step 6

Status: frontend transfer prepared. Live backend compatibility is **NOT VERIFIED** because this workspace contains no supplied development service address, test accounts, trusted-origin configuration, or backend repository.

## Transfer artifact

Git transfer was unavailable: the branch has no commits and no Git author identity is configured. A frontend-only archive is available beside the application at [`spark-frontend-handoff-step6.zip`](../spark-frontend-handoff-step6.zip).

- Verify the archive after transfer with `Get-FileHash spark-frontend-handoff-step6.zip -Algorithm SHA256` (or an equivalent SHA-256 tool).
- Contains: application source, tests, package manifests/lockfile, documentation, `.env.example`, and the frozen contract.
- Excludes: `node_modules`, `.next`, `test-results`, build/output directories, local environment files, logs, and unrelated parent-project files.
- The archive root is `electricity-tutor/`; extract it without nesting another application inside it.

## Branch and contract freeze

- Branch: `frontend/electricity-tutor`
- Repository state: this workspace has no existing Git commit history and no configured `user.name`/`user.email`, so no commit was created.
- Contract: **AGREED v1.1.0**, unchanged.
- Frozen SHA-256: `24c35c31f4137805dffa56db4466b32ba585eb1c01ca61666b12661a11eeec07`
- Freeze record: `src/contracts/tutor.ts` was hash-checked before and after Step 5. It is the exact frozen TypeScript contract; do not copy or edit a second version.
- Agreed API documentation: [`frontend-api-contract.md`](./frontend-api-contract.md)
- Exact frozen TypeScript contract: [`../src/contracts/tutor.ts`](../src/contracts/tutor.ts)
- Public configuration template with placeholders only: [`../.env.example`](../.env.example)

## Install and run

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The safe default is deterministic mock mode.

```bash
npm test
npm run test:e2e
npm run typecheck
npm run build
npm run start
```

## Adapter configuration

Mock mode:

```dotenv
NEXT_PUBLIC_TUTOR_API_MODE=mock
NEXT_PUBLIC_TUTOR_API_BASE_URL=/api/v1
```

HTTP mode:

```dotenv
NEXT_PUBLIC_TUTOR_API_MODE=http
NEXT_PUBLIC_TUTOR_API_BASE_URL=/api/v1
```

The single adapter boundary is `lib/tutor-api/context.tsx`. Mock mode uses labeled local sample personas and scripted outcomes. HTTP mode uses `HttpTutorApi`, same-origin `/api/v1`, browser-managed cookies, CSRF, and `Idempotency-Key`; failures never fall back to mock data. Never put credentials, passwords, Supabase keys, Groq keys, or API secrets in `.env.example` or `NEXT_PUBLIC_*` variables.

## Backend assumptions

The backend must provide the frozen v1.1.0 operations and shapes, a Secure/HttpOnly/SameSite cookie on HTTPS, CSRF rotation, explicit credentialed CORS if separate ports are used, pre-created student/teacher accounts, and a seeded class roster. Identity and authorization come from the authenticated session. The backend remains authoritative for grading, misconception detection, mastery, evidence, question selection, revision scheduling, and rewards (which remain disabled in this version).

Required teammate inputs before live verification:

- Development URL or same-origin proxy route.
- Student account needing onboarding and returning-student account with history.
- Teacher account, seeded class ID, and roster IDs.
- Trusted development origins and local cookie strategy.
- Confirmation that the backend serves the exact frozen hash above.

## Implemented journeys

- Student home: profile, active-session continuation, diagnostic entry, backend recommendation, revision due count, mastery/evidence estimates, and recent/abandoned sessions.
- Assessment: diagnostic, practice, and revision share server-driven question, hint, progress, answer, reasoning, feedback, clarification, retry, refresh/resume, end-session, and completion-summary states.
- Voice-first input: ordinary editable explanation text area with the exact instruction “Click the answer box, activate Wispr Flow, and explain your thinking.” Typed fallback and review-before-submit are supported; no microphone, recorder, waveform, audio upload, or SDK is present.
- Concept map: all eight concepts, prerequisite relationships, backend learning states, mastery estimates, evidence counts, misconceptions, review dates, and practice entry.
- Revision/progress: due/upcoming/completed queue, backend-supplied dates/reasons, cursor pagination, attempt history, session history, and clarification relationships.
- Teacher: class selection, aggregate concept mastery, misconception grouping by `conceptId:misconceptionCode`, revision priorities, and student detail.
- Recovery: user/session/question-scoped drafts and immutable pending mutation payloads survive refresh and unknown outcomes. Exact retries reuse the original idempotency key. Abandonment does not create completion celebration or locally complete revision.

## Verification results

Mock/frontend checks completed:

- `npm test`: 26 focused adapter, runtime-validation, mock, and pending-mutation tests passed.
- `npm run test:e2e`: 7 deterministic browser journeys passed, including onboarding/diagnostic summary, returning resume, both answer formats, voice-first draft persistence, evidence/clarification, exact retry, refresh, all end-session phases, revision completion/abandonment, teacher detail, account isolation, keyboard focus, mobile navigation, reduced motion, and console-error checks.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Production browser smoke check: home, student dashboard, concept map, and denied teacher access were inspected at `http://localhost:3100`; no live backend was involved.
- Frozen contract hash after implementation: `24c35c31f4137805dffa56db4466b32ba585eb1c01ca61666b12661a11eeec07`.

Live checks: **NOT RUN**. No backend endpoint, teammate workspace, or credentials were available. Do not interpret the mock results as cookie, CSRF, authorization, or backend grading verification.

Manual pending check: actual Wispr Flow dictation cannot be exercised in this environment. The ordinary explanation field, typed fallback, review-before-submit behavior, exact instruction, and draft persistence were verified; a teammate should dictate into the focused field once Wispr Flow is available and confirm that rerenders do not steal focus or erase text.

## Demo script

Use mock mode and say so explicitly: “This is the deterministic Spark demo; feedback and teacher data are scripted by `MockTutorApi`.”

1. Enter as **Returning student**.
2. Open **Concepts** and select **Resistance and Ohm’s law** to show its developing estimate and evidence gap.
3. Start practice, focus **Explain your thinking**, and use Wispr Flow if available; otherwise type the explanation. Review the text before submitting.
4. Show backend-shaped reasoning feedback and supporting misconception evidence.
5. Continue to the next question or select the scripted clarification outcome and resubmit the edited response.
6. Open **Revision** and **Progress** to show due work, dates, session history, and attempts.
7. Switch to **Teacher demo**, select the seeded class and a student, and show concept aggregates, misconception counts, priorities, sessions, and attempts.

## Owner handoff

The next action is a live compatibility pass against the teammate’s `/api/v1` service using the checklist in [`frontend-integration.md`](./frontend-integration.md). First obtain the backend URL/proxy, test accounts, trusted origins, seeded class/roster IDs, and confirmation of the frozen hash. Record any mismatch as request, expected v1.1.0 shape, actual response/HTTP status, and required owner action. Do not patch around a mismatch with fabricated fields or a silent contract change.
