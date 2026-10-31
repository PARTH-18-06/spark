# Spark frontend

Spark is a Next.js frontend for a voice-first, game-like Class 10 Electricity tutor. Steps 4–6 connect, polish, and prepare the complete student and teacher journeys around the Step 3 `TutorApi` boundary. The backend still owns identity, authorization, grading, mastery, question selection, scheduling, and any future rewards.

The shared contract is **AGREED v1.1.0**. Its frozen file is `src/contracts/tutor.ts` with SHA-256:

```text
24c35c31f4137805dffa56db4466b32ba585eb1c01ca61666b12661a11eeec07
```

Do not edit that file for a UI shortcut. Coordinate and version any future contract change with both owners.

## Requirements

- Node.js 20.9 or newer
- npm

## Install and run

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Mock mode is the safe default when no environment file exists.

## Commands

```bash
npm test
npm run test:e2e
npm run typecheck
npm run build
npm run start
```

`npm test` runs focused Node tests through `tsx` and does not require a live backend. `npm run test:e2e` starts the mock adapter in a local Next dev server and runs deterministic browser journeys. `npm run build` creates the production Next.js build.

## Adapter mode

The provider in `lib/tutor-api/context.tsx` is the only adapter-selection point.

```dotenv
NEXT_PUBLIC_TUTOR_API_MODE=mock
NEXT_PUBLIC_TUTOR_API_BASE_URL=/api/v1
```

- `mock`: local, clearly labeled sample personas and canned outcomes persisted in browser local storage.
- `http`: real same-origin requests through `HttpTutorApi`; failures remain failures and never fall back to mock data.

The base URL is public configuration, not a secret. Do not put Supabase service keys, Groq keys, passwords, or API secrets in `NEXT_PUBLIC_*` variables. See `docs/frontend-integration.md` for the backend handoff.

## Routes

| Route | Purpose |
|---|---|
| `/` | Product introduction and demo entry |
| `/sign-in` | Adapter-backed sign-in without credential persistence |
| `/onboarding` | Authenticated student profile save |
| `/learn` | Role/onboarding-protected student shell |
| `/learn/diagnostic` | Diagnostic start and session entry |
| `/learn/session/[sessionId]` | Shared diagnostic, practice, and revision assessment journey |
| `/learn/concepts` | Eight-concept graph, prerequisites, and concept detail/practice |
| `/learn/revision` | Due, upcoming, and completed revision queue |
| `/learn/progress` | Backend progress, paginated history, misconceptions, and attempts |
| `/teacher` | Class selector, aggregate dashboard, and student detail |

## Implemented in Step 4

- Student home loads `getStudentDashboard`: profile, active-session continuation, diagnostic entry, due revisions, backend recommendation, mastery/evidence estimates, and abandoned/recent sessions.
- One shared assessment journey renders backend questions, difficulty, progress, hints, multiple-choice/free-response input, separate reasoning, Wispr Flow instruction, validation, processing, feedback, clarification, refresh/resume, exact retry, explicit end-session, completion summaries, and abandoned state.
- Drafts and unknown pending mutations are scoped by user/session/question. Edited answers and clarifications receive fresh request identities; refresh never resubmits.
- Concept map, revision queue, progress/history, and teacher dashboard are connected through `TutorApi`, including prerequisites, server states, supplied dates/reasons, cursor pagination, aggregate misconception identity, class selection, and student details.
- Browser journeys cover onboarding/diagnostic, returning resume, both answer formats, evidence and clarification, exact retry, refresh, end-session phases, revision completion/abandonment, teacher detail, account isolation, keyboard focus, mobile navigation, reduced motion, and console errors.

## Implemented in Step 3

- All 17 `TutorApi` HTTP operations, including encoded paths/query values, `credentials: "include"`, CSRF, `Idempotency-Key`, expected status checks, and empty sign-out 204 handling.
- Strict successful-response and error validation for question formats, ISO dates, mastery 0–1/null, full concept sets, session phases, summaries, misconception catalog codes, revision state, and disabled rewards.
- Distinct HTTP, network, and protocol error classes. Real adapter failures never substitute demo data.
- Persistent `MockTutorApi` personas for a new student, returning student, and seeded teacher class, with scripted correct/partial/incorrect/clarification branches.
- Mock session resume, idempotent replay/conflict behavior, revision/progress/history, teacher reads, version conflicts, network failure, and abandonment from all active phases.
- One provider boundary for adapter/auth/profile state, sign-in, sign-out, onboarding, and role/onboarding access states.
- User-scoped pending learning mutations that retain an immutable payload and original idempotency key after unknown outcomes, block competing mutations, and support explicit exact retry.
- Private `sessionStorage` state clearing on sign-out and account/persona changes. Passwords are held only in the live form and cleared after submission.
- Existing Spark design, navigation, responsive behavior, focus styling, reduced-motion mascot, and honest backend-owned boundaries.

## Remaining limitations

- No backend, Supabase client, Groq call, grading, mastery calculation, question selection, or revision algorithm in the frontend.
- Rewards remain exactly `{ account: null, grants: [] }`; no XP totals, streaks, or reward events are invented.
- No microphone controls, audio capture, waveform, or Wispr SDK integration.
- No live-backend verification has been claimed: it requires the teammate's running agreed v1.1.0 service, cookie/CSRF configuration, and test accounts.

## Demo script

1. Run `npm install`, then `npm run dev` and open `http://localhost:3000`.
2. Keep the default **Demo mode** and choose **New student**. Save onboarding, open **Start diagnostic**, answer the eight deterministic questions, and refresh the persisted summary.
3. Return to `/`, choose **Returning student**, open a concept, submit an answer, refresh the feedback, and continue to the next question.
4. Use the banner's scripted feedback selector to demonstrate incorrect evidence, clarification/resubmission, and the exact retry control after **Fail next request**.
5. Open **Revision** to complete or abandon a seeded due item. Open **Progress** for cursor history.
6. Choose **Teacher demo**, open `/teacher`, select the seeded class and a student, and inspect concept aggregates, misconceptions, priorities, sessions, and attempts.

## Verification (mock mode)

- `npm test` — 26 focused adapter/validation/pending tests passed.
- `npm run test:e2e` — 7 browser journey tests passed, including voice-first draft persistence.
- `npm run typecheck` — passed.
- `npm run build` — production build passed.
- Production browser smoke check — home, student dashboard, and a live mock assessment were inspected; the exact Wispr Flow instruction and editable explanation field were visible.
- Contract SHA-256 before and after implementation: `24c35c31f4137805dffa56db4466b32ba585eb1c01ca61666b12661a11eeec07`.
- Live-backend checks: **NOT VERIFIED**; no backend endpoint, account, or trusted-origin configuration was available in this workspace.
- Actual Wispr Flow dictation: pending manual check; typed fallback and draft persistence are verified.

## Project documentation

- `docs/frontend-api-contract.md` — AGREED v1.1.0 behavior and examples.
- `docs/frontend-integration.md` — mode configuration, cookie/CSRF expectations, test-account handoff, retry rules, and live verification checklist.
- `docs/frontend-handoff.md` — Step 6 transfer record, freeze record, verification status, backend prerequisites, and demo script.
