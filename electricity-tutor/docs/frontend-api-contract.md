# Spark — frontend / backend API contract

**AGREED v1.1.0 — frozen implementation target as of 31 October 2026.**

Frozen `src/contracts/tutor.ts` SHA-256: `24c35c31f4137805dffa56db4466b32ba585eb1c01ca61666b12661a11eeec07`. Changes require a newly agreed contract version; the TypeScript contract remains byte-for-byte unchanged.

This covers the two-person Class 10 Physics: Electricity tutor. It is the agreed shared interface, not an implemented backend. Types have no runtime dependencies and can be copied into both projects at `src/contracts/tutor.ts`.

## Changes from proposed v1.0.0

1. Added endSession and terminal abandoned status/phase, plus endedAt on session snapshots/history. Safe from answering, feedback and clarification; existing graded progress stays intact. No completion, grading or revision-completion side effects. The student can start another session afterward.
2. Added explicit Question.format and authoritative-answer rules: selectedOptionId for multiple choice, finalAnswerText for free response; conflicting fields fail validation without grading.
3. Added client-side TutorProtocolError for unexpected/non-JSON/malformed/invalid payloads. Unknown mutation outcomes preserve pending payloads and original keys.
4. Aligned sample misconceptions/progress and revision dates/counts. Clearly labeled separate baseline, graded-answer, clarification, revision and abandonment scenarios.
5. Added stable misconceptionCode to attempt/progress/teacher responses. Teacher aggregation uses conceptId + misconceptionCode, never label text.
6. Rewards remain disabled in every response and fixture; the Rewards type now enforces account=null/grants=[]. Endpoint count is 17. No frontend adapter implementation is changed by this revision.

## Agreement and implementation

1. Both owners implement this exact version. No silent field or endpoint changes.
2. Coordinate any future change in BOTH files and increment the contract version before implementation.
3. Integrate auth/profile, start/get session, submitAttempt, advanceSession and endSession first. Share a development base URL and test accounts early.
4. Frontend selects MockTutorApi or HttpTutorApi at one provider boundary.

Frontend owns views, routes, accessible text entry, mocks, loading/errors and animation. Backend owns Supabase persistence, authentication enforcement, Groq, question generation/selection, grading, misconception analysis, mastery, scheduling, teacher permissions and real rewards. No direct browser Groq/database calls or frontend backend is needed.

## Conventions and agreed defaults

- Same-origin base `/api/v1`, configurable in HttpTutorApi. Append endpoint paths once without duplicating `/api/v1`.
- Success JSON is the stated object directly, NOT a `{data: ...}` envelope. Success: 200 except new session 201 and sign-out 204.
- JSON content type, browser credentials included, no GET body, Cache-Control: no-store for private responses.
- IDs are opaque, case-sensitive strings. URL-encode path/query values. No studentId on student writes.
- Null means known absence/unassessed. Optional absent properties differ from null. Reject unknown write fields with VALIDATION_ERROR.
- Mastery is finite 0–1 or null. State is backend-provided, unassessed exactly when mastery is null. UI formats percentages and labels them estimates.
- Evidence counts are nonnegative graded-question counts. Resolving clarification contributes at most one graded assignment; network retries add none.
- Instants: ISO 8601 with explicit offset, preferably Z. examDate/lastActivityDate: YYYY-MM-DD. Do not convert calendar-only dates through UTC. timeZone is IANA.
- Full concept overviews have exactly eight unique progress rows. Other arrays can be empty.
- History pages: default limit=20, range 1–50, opaque cursor; newest updated/submitted first with ID tie-breaker. Invalid cursor is VALIDATION_ERROR; nextCursor=null at end.
- Display name: trimmed 1–80 characters. finalAnswerText max 2,000; reasoningText max 8,000. The authoritative field depends on Question.format (rules below). Empty reasoning is allowed; never infer a misconception solely from missing reasoning. Backend validates dates/zones/IDs/option membership.
- Diagnostic omits conceptId/revisionItemIds. Practice conceptId is optional, revisionItemIds omitted. Revision uses nonempty due revisionItemIds or server selects due items if omitted. Reject empty/non-owned/non-due selections. Voluntary early review uses practice.
- At most one active session per student. New start while active returns ACTIVE_SESSION_EXISTS with activeSessionId; resume, finish or end it. Abandoned/completed sessions do not block a new start. Replay lookup happens first.

## Stable chapter and graph

Chapter: `class-10-physics-electricity`. The source defines eight concepts: current and charge; potential difference; resistance and Ohm's law; factors affecting resistance; series; parallel; power; energy. `ELECTRICITY_CONCEPTS` is the shared graph and is also returned in the getConcepts example below. Prerequisites guide recommendations, not mandatory game locks. Do not merge power/energy or add a concept without revising both files.

## Authentication and permissions

Agreed MVP default: pre-created Supabase-backed email/password accounts through the teammate's same-origin backend. Backend sets a Secure (on HTTPS), HttpOnly, SameSite=Lax cookie. Browser requests use `credentials: "include"`. No provider key, raw token or password is persisted in browser storage.

getCurrentUser bootstraps session/CSRF. Anonymous is a normal 200. Protected missing/expired login is 401 AUTH_REQUIRED. signIn requires no previous session/CSRF but validates Origin against an explicit allowlist, rate-limits login and never caches/logs passwords. It returns AuthenticatedState; a teacher can have studentProfile=null. Registration/password reset is outside this MVP.

All authenticated non-GET calls send X-CSRF-Token and validate both token and Origin. Rotate token with auth-session changes; refresh it via getCurrentUser as needed. On 401 clear private cached data and show sign-in. signOut invalidates cookie/session; anonymous sign-out may return 204 without CSRF. No GET sign-out.

Separate development ports require an explicit credentialed CORS allowlist; never wildcard origin with credentials. Final same-origin integration avoids cross-site cookie issues. No login redirect, audio endpoint, Wispr API or custom microphone integration.

Backend derives current student from session. IDs never grant access. Another student's resource is 404. Teacher reads require role, assigned class and roster membership. Inaccessible class/detail is 404; student access to teacher routes is 403. A demo role selector grants no HTTP permission.

Before onboarding allow auth/profile save/concept read; student dashboard/learning/history/revision returns 409 ONBOARDING_REQUIRED. Teacher-only accounts cannot call student routes.

## Request and response examples

All people, dates, scores and counts are SAMPLE DATA, not real performance claims or a mastery algorithm. Rewards are disabled throughout this version. Each example is shape-checked against tutor.ts. Scenario A0 is the initial unassessed state; A1 is the graded incorrect-answer branch; C is an alternative clarification branch; R is a separate returning-student revision scenario. Never combine these different snapshots as if simultaneous.

Mutation inputs startSession/submitAttempt/advanceSession/endSession include adapter-only idempotencyKey. HttpTutorApi removes it from JSON and sends `Idempotency-Key` header. Example mutation bodies below exclude the key. sessionId remains in attempt/advance/end JSON and must match the path. Profile PUT is inherently idempotent. Auth calls do not use learning-submission idempotency caching.

## Endpoint index

| Method | HTTP | Success type |
|---|---|---|
| `getCurrentUser` | `GET /api/v1/auth/me` | `AuthState` |
| `signIn` | `POST /api/v1/auth/sign-in` | `AuthenticatedState` |
| `signOut` | `POST /api/v1/auth/sign-out` | `void` |
| `saveStudentProfile` | `PUT /api/v1/me/profile` | `StudentProfile` |
| `getStudentDashboard` | `GET /api/v1/student/dashboard` | `StudentDashboard` |
| `getConcepts` | `GET /api/v1/concepts` | `ConceptsResponse` |
| `startSession` | `POST /api/v1/sessions` | `SessionSnapshot` |
| `getSession` | `GET /api/v1/sessions/{sessionId}` | `SessionSnapshot` |
| `submitAttempt` | `POST /api/v1/sessions/{sessionId}/attempts` | `AttemptResult` |
| `advanceSession` | `POST /api/v1/sessions/{sessionId}/advance` | `SessionSnapshot` |
| `endSession` | `POST /api/v1/sessions/{sessionId}/end` | `SessionSnapshot` |
| `getRevisionQueue` | `GET /api/v1/revision` | `RevisionQueue` |
| `getProgress` | `GET /api/v1/progress` | `ProgressResponse` |
| `getAttemptHistory` | `GET /api/v1/attempts` | `Page<AttemptHistoryItem>` |
| `getClasses` | `GET /api/v1/teacher/classes` | `ClassSummary[]` |
| `getClassDashboard` | `GET /api/v1/teacher/classes/{classId}` | `ClassDashboard` |
| `getStudentDetail` | `GET /api/v1/teacher/classes/{classId}/students/{studentId}` | `TeacherStudentDetail` |

For getProgress/getAttemptHistory, optional cursor/limit are query parameters, not JSON bodies. Example: `/api/v1/attempts?limit=20`. All endpoints except auth require an authenticated role appropriate for that resource.

### 1. getCurrentUser

`GET /api/v1/auth/me`

Request body: none.

Response JSON:

```json
{
  "authenticated": true,
  "user": {
    "id": "student_asha",
    "displayName": "Asha",
    "roles": [
      "student"
    ]
  },
  "studentProfile": {
    "displayName": "Asha",
    "chapterId": "class-10-physics-electricity",
    "examDate": null,
    "timeZone": "Asia/Calcutta",
    "onboardingComplete": true
  },
  "csrfToken": "sample-csrf-placeholder",
  "expiresAt": "2026-10-31T15:00:00.000Z"
}
```

### 2. signIn

`POST /api/v1/auth/sign-in`

Scenario A0: initial profile/unassessed state.

Request JSON:

```json
{
  "email": "asha@example.test",
  "password": "replace-with-test-password"
}
```

Response JSON:

```json
{
  "authenticated": true,
  "user": {
    "id": "student_asha",
    "displayName": "Asha",
    "roles": [
      "student"
    ]
  },
  "studentProfile": {
    "displayName": "Asha",
    "chapterId": "class-10-physics-electricity",
    "examDate": null,
    "timeZone": "Asia/Calcutta",
    "onboardingComplete": true
  },
  "csrfToken": "sample-csrf-placeholder",
  "expiresAt": "2026-10-31T15:00:00.000Z"
}
```

### 3. signOut

`POST /api/v1/auth/sign-out`

Request body: none.

Response: HTTP 204; no body. Already signed out also returns 204.

### 4. saveStudentProfile

`PUT /api/v1/me/profile`

Scenario A0: initial profile/unassessed state.

Request JSON:

```json
{
  "displayName": "Asha",
  "chapterId": "class-10-physics-electricity",
  "examDate": null,
  "timeZone": "Asia/Calcutta"
}
```

Response JSON:

```json
{
  "displayName": "Asha",
  "chapterId": "class-10-physics-electricity",
  "examDate": null,
  "timeZone": "Asia/Calcutta",
  "onboardingComplete": true
}
```

### 5. getStudentDashboard

`GET /api/v1/student/dashboard`

Scenario A1: graded wrong-answer branch (summary/history reads are after completion).

Request body: none.

Response JSON:

```json
{
  "profile": {
    "displayName": "Asha",
    "chapterId": "class-10-physics-electricity",
    "examDate": null,
    "timeZone": "Asia/Calcutta",
    "onboardingComplete": true
  },
  "activeSession": null,
  "dueRevisionCount": 0,
  "recommendedConceptId": "resistance-and-ohms-law",
  "concepts": [
    {
      "conceptId": "electric-current-and-charge",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "potential-difference",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistance-and-ohms-law",
      "mastery": 0.25,
      "state": "needs_practice",
      "evidenceCount": 1,
      "lastAssessedAt": "2026-10-31T09:01:00.000Z",
      "nextReviewAt": "2026-11-01T09:01:00.000Z",
      "recentMisconceptions": [
        {
          "misconceptionCode": "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
          "label": "Assumes voltage increases the fixed resistance",
          "evidence": "higher voltage increases resistance",
          "observedAt": "2026-10-31T09:01:00.000Z"
        }
      ]
    },
    {
      "conceptId": "factors-affecting-resistance",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistors-in-series",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistors-in-parallel",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "electric-power",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "electrical-energy",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    }
  ],
  "recentSessions": [
    {
      "id": "session_01",
      "mode": "practice",
      "status": "completed",
      "answeredCount": 1,
      "updatedAt": "2026-10-31T09:02:00.000Z",
      "completedAt": "2026-10-31T09:02:00.000Z",
      "endedAt": "2026-10-31T09:02:00.000Z"
    }
  ],
  "rewards": {
    "account": null,
    "grants": []
  }
}
```

### 6. getConcepts

`GET /api/v1/concepts`

Scenario A0: initial profile/unassessed state.

Request body: none.

Response JSON:

```json
{
  "chapterId": "class-10-physics-electricity",
  "concepts": [
    {
      "id": "electric-current-and-charge",
      "title": "Electric current and charge",
      "description": "Charge flow, I = Q/t, amperes and coulombs.",
      "prerequisiteIds": []
    },
    {
      "id": "potential-difference",
      "title": "Potential difference",
      "description": "Work per unit charge and the volt.",
      "prerequisiteIds": [
        "electric-current-and-charge"
      ]
    },
    {
      "id": "resistance-and-ohms-law",
      "title": "Resistance and Ohm's law",
      "description": "Resistance and the relationship I = V/R.",
      "prerequisiteIds": [
        "electric-current-and-charge",
        "potential-difference"
      ]
    },
    {
      "id": "factors-affecting-resistance",
      "title": "Factors affecting resistance",
      "description": "Length, cross-sectional area, material and temperature.",
      "prerequisiteIds": [
        "resistance-and-ohms-law"
      ]
    },
    {
      "id": "resistors-in-series",
      "title": "Resistors in series",
      "description": "Equivalent resistance, current and voltage in series.",
      "prerequisiteIds": [
        "resistance-and-ohms-law"
      ]
    },
    {
      "id": "resistors-in-parallel",
      "title": "Resistors in parallel",
      "description": "Equivalent resistance, branch currents and voltage in parallel.",
      "prerequisiteIds": [
        "resistance-and-ohms-law"
      ]
    },
    {
      "id": "electric-power",
      "title": "Electric power",
      "description": "P = VI and equivalent power relationships.",
      "prerequisiteIds": [
        "resistance-and-ohms-law"
      ]
    },
    {
      "id": "electrical-energy",
      "title": "Electrical energy",
      "description": "E = Pt, joules, kilowatt-hours and energy consumption.",
      "prerequisiteIds": [
        "electric-power"
      ]
    }
  ],
  "progress": [
    {
      "conceptId": "electric-current-and-charge",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "potential-difference",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistance-and-ohms-law",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "factors-affecting-resistance",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistors-in-series",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistors-in-parallel",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "electric-power",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "electrical-energy",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    }
  ]
}
```

### 7. startSession

`POST /api/v1/sessions`

Scenario A0: initial profile/unassessed state.

HTTP 201 on creation; include Idempotency-Key header (example: start-example-key-01).

Request JSON:

```json
{
  "mode": "practice",
  "conceptId": "resistance-and-ohms-law"
}
```

Response JSON:

```json
{
  "id": "session_01",
  "mode": "practice",
  "conceptId": "resistance-and-ohms-law",
  "status": "active",
  "phase": "answering",
  "version": 1,
  "progress": {
    "answeredCount": 0,
    "targetQuestionCount": 1
  },
  "currentQuestion": {
    "id": "assigned_q01",
    "conceptId": "resistance-and-ohms-law",
    "format": "free_response",
    "prompt": "If voltage doubles while resistance stays constant, what happens to current? Explain why.",
    "difficulty": "easy",
    "hint": "Think about I = V/R."
  },
  "lastAttempt": null,
  "summary": null,
  "endedAt": null,
  "updatedAt": "2026-10-31T09:00:00.000Z"
}
```

### 8. getSession

`GET /api/v1/sessions/{sessionId}`

Scenario A1: graded wrong-answer branch (summary/history reads are after completion).

Request body: none.

Response JSON:

```json
{
  "id": "session_01",
  "mode": "practice",
  "conceptId": "resistance-and-ohms-law",
  "status": "active",
  "phase": "feedback",
  "version": 2,
  "progress": {
    "answeredCount": 1,
    "targetQuestionCount": 1
  },
  "currentQuestion": {
    "id": "assigned_q01",
    "conceptId": "resistance-and-ohms-law",
    "format": "free_response",
    "prompt": "If voltage doubles while resistance stays constant, what happens to current? Explain why.",
    "difficulty": "easy",
    "hint": "Think about I = V/R."
  },
  "lastAttempt": {
    "attemptId": "attempt_01",
    "questionId": "assigned_q01",
    "clarificationOfAttemptId": null,
    "submittedAt": "2026-10-31T09:01:00.000Z",
    "finalAnswerText": "Current halves.",
    "reasoningText": "Current halves because higher voltage increases resistance.",
    "selectedOptionId": null,
    "status": "incorrect",
    "finalAnswerCorrect": false,
    "reasoningStatus": "misconception",
    "feedback": "Current doubles: I = V/R. Doubling V at fixed R doubles I. Resistance is fixed in this question.",
    "misconception": {
      "misconceptionCode": "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
      "label": "Assumes voltage increases the fixed resistance",
      "evidence": "higher voltage increases resistance"
    },
    "clarificationPrompt": null,
    "mastery": {
      "conceptId": "resistance-and-ohms-law",
      "before": null,
      "after": 0.25,
      "evidenceCount": 1
    },
    "nextReviewAt": "2026-11-01T09:01:00.000Z"
  },
  "summary": null,
  "endedAt": null,
  "updatedAt": "2026-10-31T09:01:00.000Z"
}
```

### 9. submitAttempt

`POST /api/v1/sessions/{sessionId}/attempts`

Scenario A1: graded wrong-answer branch (summary/history reads are after completion).

HTTP 200; include Idempotency-Key header. Keep the same key/body for a network retry.

Request JSON:

```json
{
  "sessionId": "session_01",
  "questionId": "assigned_q01",
  "expectedSessionVersion": 1,
  "finalAnswerText": "Current halves.",
  "reasoningText": "Current halves because higher voltage increases resistance."
}
```

Response JSON:

```json
{
  "attemptId": "attempt_01",
  "questionId": "assigned_q01",
  "clarificationOfAttemptId": null,
  "submittedAt": "2026-10-31T09:01:00.000Z",
  "finalAnswerText": "Current halves.",
  "reasoningText": "Current halves because higher voltage increases resistance.",
  "selectedOptionId": null,
  "status": "incorrect",
  "finalAnswerCorrect": false,
  "reasoningStatus": "misconception",
  "feedback": "Current doubles: I = V/R. Doubling V at fixed R doubles I. Resistance is fixed in this question.",
  "misconception": {
    "misconceptionCode": "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
    "label": "Assumes voltage increases the fixed resistance",
    "evidence": "higher voltage increases resistance"
  },
  "clarificationPrompt": null,
  "mastery": {
    "conceptId": "resistance-and-ohms-law",
    "before": null,
    "after": 0.25,
    "evidenceCount": 1
  },
  "nextReviewAt": "2026-11-01T09:01:00.000Z",
  "session": {
    "id": "session_01",
    "mode": "practice",
    "conceptId": "resistance-and-ohms-law",
    "status": "active",
    "phase": "feedback",
    "version": 2,
    "progress": {
      "answeredCount": 1,
      "targetQuestionCount": 1
    },
    "currentQuestion": {
      "id": "assigned_q01",
      "conceptId": "resistance-and-ohms-law",
      "format": "free_response",
      "prompt": "If voltage doubles while resistance stays constant, what happens to current? Explain why.",
      "difficulty": "easy",
      "hint": "Think about I = V/R."
    },
    "lastAttempt": {
      "attemptId": "attempt_01",
      "questionId": "assigned_q01",
      "clarificationOfAttemptId": null,
      "submittedAt": "2026-10-31T09:01:00.000Z",
      "finalAnswerText": "Current halves.",
      "reasoningText": "Current halves because higher voltage increases resistance.",
      "selectedOptionId": null,
      "status": "incorrect",
      "finalAnswerCorrect": false,
      "reasoningStatus": "misconception",
      "feedback": "Current doubles: I = V/R. Doubling V at fixed R doubles I. Resistance is fixed in this question.",
      "misconception": {
        "misconceptionCode": "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
        "label": "Assumes voltage increases the fixed resistance",
        "evidence": "higher voltage increases resistance"
      },
      "clarificationPrompt": null,
      "mastery": {
        "conceptId": "resistance-and-ohms-law",
        "before": null,
        "after": 0.25,
        "evidenceCount": 1
      },
      "nextReviewAt": "2026-11-01T09:01:00.000Z"
    },
    "summary": null,
    "endedAt": null,
    "updatedAt": "2026-10-31T09:01:00.000Z"
  },
  "rewards": {
    "account": null,
    "grants": []
  }
}
```

### 10. advanceSession

`POST /api/v1/sessions/{sessionId}/advance`

Scenario A1: graded wrong-answer branch (summary/history reads are after completion).

HTTP 200; include Idempotency-Key header. Keep the same key/body for a network retry.

Request JSON:

```json
{
  "sessionId": "session_01",
  "expectedSessionVersion": 2
}
```

Response JSON:

```json
{
  "id": "session_01",
  "mode": "practice",
  "conceptId": "resistance-and-ohms-law",
  "status": "completed",
  "phase": "completed",
  "version": 3,
  "progress": {
    "answeredCount": 1,
    "targetQuestionCount": 1
  },
  "currentQuestion": null,
  "lastAttempt": {
    "attemptId": "attempt_01",
    "questionId": "assigned_q01",
    "clarificationOfAttemptId": null,
    "submittedAt": "2026-10-31T09:01:00.000Z",
    "finalAnswerText": "Current halves.",
    "reasoningText": "Current halves because higher voltage increases resistance.",
    "selectedOptionId": null,
    "status": "incorrect",
    "finalAnswerCorrect": false,
    "reasoningStatus": "misconception",
    "feedback": "Current doubles: I = V/R. Doubling V at fixed R doubles I. Resistance is fixed in this question.",
    "misconception": {
      "misconceptionCode": "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
      "label": "Assumes voltage increases the fixed resistance",
      "evidence": "higher voltage increases resistance"
    },
    "clarificationPrompt": null,
    "mastery": {
      "conceptId": "resistance-and-ohms-law",
      "before": null,
      "after": 0.25,
      "evidenceCount": 1
    },
    "nextReviewAt": "2026-11-01T09:01:00.000Z"
  },
  "summary": {
    "sessionId": "session_01",
    "mode": "practice",
    "completedAt": "2026-10-31T09:02:00.000Z",
    "answeredCount": 1,
    "correctCount": 0,
    "partialCount": 0,
    "incorrectCount": 1,
    "conceptProgress": [
      {
        "conceptId": "electric-current-and-charge",
        "mastery": null,
        "state": "unassessed",
        "evidenceCount": 0,
        "lastAssessedAt": null,
        "nextReviewAt": null,
        "recentMisconceptions": []
      },
      {
        "conceptId": "potential-difference",
        "mastery": null,
        "state": "unassessed",
        "evidenceCount": 0,
        "lastAssessedAt": null,
        "nextReviewAt": null,
        "recentMisconceptions": []
      },
      {
        "conceptId": "resistance-and-ohms-law",
        "mastery": 0.25,
        "state": "needs_practice",
        "evidenceCount": 1,
        "lastAssessedAt": "2026-10-31T09:01:00.000Z",
        "nextReviewAt": "2026-11-01T09:01:00.000Z",
        "recentMisconceptions": [
          {
            "misconceptionCode": "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
            "label": "Assumes voltage increases the fixed resistance",
            "evidence": "higher voltage increases resistance",
            "observedAt": "2026-10-31T09:01:00.000Z"
          }
        ]
      },
      {
        "conceptId": "factors-affecting-resistance",
        "mastery": null,
        "state": "unassessed",
        "evidenceCount": 0,
        "lastAssessedAt": null,
        "nextReviewAt": null,
        "recentMisconceptions": []
      },
      {
        "conceptId": "resistors-in-series",
        "mastery": null,
        "state": "unassessed",
        "evidenceCount": 0,
        "lastAssessedAt": null,
        "nextReviewAt": null,
        "recentMisconceptions": []
      },
      {
        "conceptId": "resistors-in-parallel",
        "mastery": null,
        "state": "unassessed",
        "evidenceCount": 0,
        "lastAssessedAt": null,
        "nextReviewAt": null,
        "recentMisconceptions": []
      },
      {
        "conceptId": "electric-power",
        "mastery": null,
        "state": "unassessed",
        "evidenceCount": 0,
        "lastAssessedAt": null,
        "nextReviewAt": null,
        "recentMisconceptions": []
      },
      {
        "conceptId": "electrical-energy",
        "mastery": null,
        "state": "unassessed",
        "evidenceCount": 0,
        "lastAssessedAt": null,
        "nextReviewAt": null,
        "recentMisconceptions": []
      }
    ],
    "recommendedConceptIds": [
      "resistance-and-ohms-law"
    ],
    "feedback": "Practise fixed-resistance questions.",
    "rewards": {
      "account": null,
      "grants": []
    }
  },
  "endedAt": "2026-10-31T09:02:00.000Z",
  "updatedAt": "2026-10-31T09:02:00.000Z"
}
```

### 11. endSession

`POST /api/v1/sessions/{sessionId}/end`

Alternative A1 ending branch: abandon after feedback instead of completing via advanceSession.

HTTP 200; include Idempotency-Key header. Keep the same key/body for a network retry.

Request JSON:

```json
{
  "sessionId": "session_01",
  "expectedSessionVersion": 2
}
```

Response JSON:

```json
{
  "id": "session_01",
  "mode": "practice",
  "conceptId": "resistance-and-ohms-law",
  "status": "abandoned",
  "phase": "abandoned",
  "version": 3,
  "progress": {
    "answeredCount": 1,
    "targetQuestionCount": 1
  },
  "currentQuestion": null,
  "lastAttempt": {
    "attemptId": "attempt_01",
    "questionId": "assigned_q01",
    "clarificationOfAttemptId": null,
    "submittedAt": "2026-10-31T09:01:00.000Z",
    "finalAnswerText": "Current halves.",
    "reasoningText": "Current halves because higher voltage increases resistance.",
    "selectedOptionId": null,
    "status": "incorrect",
    "finalAnswerCorrect": false,
    "reasoningStatus": "misconception",
    "feedback": "Current doubles: I = V/R. Doubling V at fixed R doubles I. Resistance is fixed in this question.",
    "misconception": {
      "misconceptionCode": "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
      "label": "Assumes voltage increases the fixed resistance",
      "evidence": "higher voltage increases resistance"
    },
    "clarificationPrompt": null,
    "mastery": {
      "conceptId": "resistance-and-ohms-law",
      "before": null,
      "after": 0.25,
      "evidenceCount": 1
    },
    "nextReviewAt": "2026-11-01T09:01:00.000Z"
  },
  "summary": null,
  "endedAt": "2026-10-31T09:02:00.000Z",
  "updatedAt": "2026-10-31T09:02:00.000Z"
}
```

### 12. getRevisionQueue

`GET /api/v1/revision`

Scenario A1: graded wrong-answer branch (summary/history reads are after completion).

Request body: none.

Response JSON:

```json
{
  "generatedAt": "2026-10-31T09:02:00.000Z",
  "items": [
    {
      "id": "rev_after_wrong",
      "conceptId": "resistance-and-ohms-law",
      "status": "upcoming",
      "dueAt": "2026-11-01T09:01:00.000Z",
      "reason": "Review after the fixed-resistance misconception.",
      "completedAt": null,
      "completedSessionId": null
    }
  ]
}
```

### 13. getProgress

`GET /api/v1/progress`

Scenario A1: graded wrong-answer branch (summary/history reads are after completion).

Request body: none.

Response JSON:

```json
{
  "concepts": [
    {
      "conceptId": "electric-current-and-charge",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "potential-difference",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistance-and-ohms-law",
      "mastery": 0.25,
      "state": "needs_practice",
      "evidenceCount": 1,
      "lastAssessedAt": "2026-10-31T09:01:00.000Z",
      "nextReviewAt": "2026-11-01T09:01:00.000Z",
      "recentMisconceptions": [
        {
          "misconceptionCode": "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
          "label": "Assumes voltage increases the fixed resistance",
          "evidence": "higher voltage increases resistance",
          "observedAt": "2026-10-31T09:01:00.000Z"
        }
      ]
    },
    {
      "conceptId": "factors-affecting-resistance",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistors-in-series",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistors-in-parallel",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "electric-power",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "electrical-energy",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    }
  ],
  "sessions": {
    "items": [
      {
        "id": "session_01",
        "mode": "practice",
        "status": "completed",
        "answeredCount": 1,
        "updatedAt": "2026-10-31T09:02:00.000Z",
        "completedAt": "2026-10-31T09:02:00.000Z",
        "endedAt": "2026-10-31T09:02:00.000Z"
      }
    ],
    "nextCursor": null
  },
  "rewards": {
    "account": null,
    "grants": []
  }
}
```

### 14. getAttemptHistory

`GET /api/v1/attempts`

Scenario A1: graded wrong-answer branch (summary/history reads are after completion).

Request body: none.

Response JSON:

```json
{
  "items": [
    {
      "sessionId": "session_01",
      "conceptId": "resistance-and-ohms-law",
      "question": {
        "id": "assigned_q01",
        "conceptId": "resistance-and-ohms-law",
        "format": "free_response",
        "prompt": "If voltage doubles while resistance stays constant, what happens to current? Explain why.",
        "difficulty": "easy",
        "hint": "Think about I = V/R."
      },
      "feedback": {
        "attemptId": "attempt_01",
        "questionId": "assigned_q01",
        "clarificationOfAttemptId": null,
        "submittedAt": "2026-10-31T09:01:00.000Z",
        "finalAnswerText": "Current halves.",
        "reasoningText": "Current halves because higher voltage increases resistance.",
        "selectedOptionId": null,
        "status": "incorrect",
        "finalAnswerCorrect": false,
        "reasoningStatus": "misconception",
        "feedback": "Current doubles: I = V/R. Doubling V at fixed R doubles I. Resistance is fixed in this question.",
        "misconception": {
          "misconceptionCode": "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
          "label": "Assumes voltage increases the fixed resistance",
          "evidence": "higher voltage increases resistance"
        },
        "clarificationPrompt": null,
        "mastery": {
          "conceptId": "resistance-and-ohms-law",
          "before": null,
          "after": 0.25,
          "evidenceCount": 1
        },
        "nextReviewAt": "2026-11-01T09:01:00.000Z"
      }
    }
  ],
  "nextCursor": null
}
```

### 15. getClasses

`GET /api/v1/teacher/classes`

Scenario A1: graded wrong-answer branch (summary/history reads are after completion).

Request body: none.

Response JSON:

```json
[
  {
    "id": "class_10a",
    "name": "Class 10A (sample)",
    "studentCount": 1
  }
]
```

### 16. getClassDashboard

`GET /api/v1/teacher/classes/{classId}`

Scenario A1: graded wrong-answer branch (summary/history reads are after completion).

Request body: none.

Response JSON:

```json
{
  "class": {
    "id": "class_10a",
    "name": "Class 10A (sample)",
    "studentCount": 1
  },
  "generatedAt": "2026-10-31T09:02:00.000Z",
  "students": [
    {
      "id": "student_asha",
      "displayName": "Asha",
      "concepts": [
        {
          "conceptId": "electric-current-and-charge",
          "mastery": null,
          "state": "unassessed",
          "evidenceCount": 0,
          "lastAssessedAt": null,
          "nextReviewAt": null,
          "recentMisconceptions": []
        },
        {
          "conceptId": "potential-difference",
          "mastery": null,
          "state": "unassessed",
          "evidenceCount": 0,
          "lastAssessedAt": null,
          "nextReviewAt": null,
          "recentMisconceptions": []
        },
        {
          "conceptId": "resistance-and-ohms-law",
          "mastery": 0.25,
          "state": "needs_practice",
          "evidenceCount": 1,
          "lastAssessedAt": "2026-10-31T09:01:00.000Z",
          "nextReviewAt": "2026-11-01T09:01:00.000Z",
          "recentMisconceptions": [
            {
              "misconceptionCode": "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
              "label": "Assumes voltage increases the fixed resistance",
              "evidence": "higher voltage increases resistance",
              "observedAt": "2026-10-31T09:01:00.000Z"
            }
          ]
        },
        {
          "conceptId": "factors-affecting-resistance",
          "mastery": null,
          "state": "unassessed",
          "evidenceCount": 0,
          "lastAssessedAt": null,
          "nextReviewAt": null,
          "recentMisconceptions": []
        },
        {
          "conceptId": "resistors-in-series",
          "mastery": null,
          "state": "unassessed",
          "evidenceCount": 0,
          "lastAssessedAt": null,
          "nextReviewAt": null,
          "recentMisconceptions": []
        },
        {
          "conceptId": "resistors-in-parallel",
          "mastery": null,
          "state": "unassessed",
          "evidenceCount": 0,
          "lastAssessedAt": null,
          "nextReviewAt": null,
          "recentMisconceptions": []
        },
        {
          "conceptId": "electric-power",
          "mastery": null,
          "state": "unassessed",
          "evidenceCount": 0,
          "lastAssessedAt": null,
          "nextReviewAt": null,
          "recentMisconceptions": []
        },
        {
          "conceptId": "electrical-energy",
          "mastery": null,
          "state": "unassessed",
          "evidenceCount": 0,
          "lastAssessedAt": null,
          "nextReviewAt": null,
          "recentMisconceptions": []
        }
      ],
      "dueRevisionCount": 0,
      "lastActiveAt": "2026-10-31T09:02:00.000Z"
    }
  ],
  "commonMisconceptions": [
    {
      "conceptId": "resistance-and-ohms-law",
      "misconceptionCode": "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
      "label": "Assumes voltage increases the fixed resistance",
      "affectedStudentCount": 1
    }
  ],
  "revisionPriorities": [
    {
      "conceptId": "resistance-and-ohms-law",
      "affectedStudentCount": 1,
      "reason": "Needs fixed-resistance practice."
    }
  ]
}
```

### 17. getStudentDetail

`GET /api/v1/teacher/classes/{classId}/students/{studentId}`

Scenario A1: graded wrong-answer branch (summary/history reads are after completion).

Request body: none.

Response JSON:

```json
{
  "classId": "class_10a",
  "student": {
    "id": "student_asha",
    "displayName": "Asha",
    "concepts": [
      {
        "conceptId": "electric-current-and-charge",
        "mastery": null,
        "state": "unassessed",
        "evidenceCount": 0,
        "lastAssessedAt": null,
        "nextReviewAt": null,
        "recentMisconceptions": []
      },
      {
        "conceptId": "potential-difference",
        "mastery": null,
        "state": "unassessed",
        "evidenceCount": 0,
        "lastAssessedAt": null,
        "nextReviewAt": null,
        "recentMisconceptions": []
      },
      {
        "conceptId": "resistance-and-ohms-law",
        "mastery": 0.25,
        "state": "needs_practice",
        "evidenceCount": 1,
        "lastAssessedAt": "2026-10-31T09:01:00.000Z",
        "nextReviewAt": "2026-11-01T09:01:00.000Z",
        "recentMisconceptions": [
          {
            "misconceptionCode": "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
            "label": "Assumes voltage increases the fixed resistance",
            "evidence": "higher voltage increases resistance",
            "observedAt": "2026-10-31T09:01:00.000Z"
          }
        ]
      },
      {
        "conceptId": "factors-affecting-resistance",
        "mastery": null,
        "state": "unassessed",
        "evidenceCount": 0,
        "lastAssessedAt": null,
        "nextReviewAt": null,
        "recentMisconceptions": []
      },
      {
        "conceptId": "resistors-in-series",
        "mastery": null,
        "state": "unassessed",
        "evidenceCount": 0,
        "lastAssessedAt": null,
        "nextReviewAt": null,
        "recentMisconceptions": []
      },
      {
        "conceptId": "resistors-in-parallel",
        "mastery": null,
        "state": "unassessed",
        "evidenceCount": 0,
        "lastAssessedAt": null,
        "nextReviewAt": null,
        "recentMisconceptions": []
      },
      {
        "conceptId": "electric-power",
        "mastery": null,
        "state": "unassessed",
        "evidenceCount": 0,
        "lastAssessedAt": null,
        "nextReviewAt": null,
        "recentMisconceptions": []
      },
      {
        "conceptId": "electrical-energy",
        "mastery": null,
        "state": "unassessed",
        "evidenceCount": 0,
        "lastAssessedAt": null,
        "nextReviewAt": null,
        "recentMisconceptions": []
      }
    ],
    "dueRevisionCount": 0,
    "lastActiveAt": "2026-10-31T09:02:00.000Z"
  },
  "recentSessions": [
    {
      "id": "session_01",
      "mode": "practice",
      "status": "completed",
      "answeredCount": 1,
      "updatedAt": "2026-10-31T09:02:00.000Z",
      "completedAt": "2026-10-31T09:02:00.000Z",
      "endedAt": "2026-10-31T09:02:00.000Z"
    }
  ],
  "recentAttempts": [
    {
      "sessionId": "session_01",
      "conceptId": "resistance-and-ohms-law",
      "question": {
        "id": "assigned_q01",
        "conceptId": "resistance-and-ohms-law",
        "format": "free_response",
        "prompt": "If voltage doubles while resistance stays constant, what happens to current? Explain why.",
        "difficulty": "easy",
        "hint": "Think about I = V/R."
      },
      "feedback": {
        "attemptId": "attempt_01",
        "questionId": "assigned_q01",
        "clarificationOfAttemptId": null,
        "submittedAt": "2026-10-31T09:01:00.000Z",
        "finalAnswerText": "Current halves.",
        "reasoningText": "Current halves because higher voltage increases resistance.",
        "selectedOptionId": null,
        "status": "incorrect",
        "finalAnswerCorrect": false,
        "reasoningStatus": "misconception",
        "feedback": "Current doubles: I = V/R. Doubling V at fixed R doubles I. Resistance is fixed in this question.",
        "misconception": {
          "misconceptionCode": "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
          "label": "Assumes voltage increases the fixed resistance",
          "evidence": "higher voltage increases resistance"
        },
        "clarificationPrompt": null,
        "mastery": {
          "conceptId": "resistance-and-ohms-law",
          "before": null,
          "after": 0.25,
          "evidenceCount": 1
        },
        "nextReviewAt": "2026-11-01T09:01:00.000Z"
      }
    }
  ]
}
```

## Additional typed examples

C: clarificationNeeded/Request/Resolved form an ALTERNATIVE branch from initial A0, not after A1. Ambiguity changes no mastery/schedule/evidence. Resolve with a new key and clarificationOfAttemptId. Abandonment examples are alternative branches, not sequential actions on one already ended session. R: revisionScenarioR* is a SEPARATE older/imported learner snapshot (historical sessions omitted from the illustration); its due/upcoming/completed queue and matching dashboard must be used together. Ending its revision session leaves the queue unchanged. Multiple-choice and protocol-error examples illustrate separate validation/transport cases. Protocol-error objects are ADAPTER ERRORS, not HTTP response bodies; backend wire errors remain ApiErrorBody.

### anonymousAuth

```json
{
  "authenticated": false,
  "user": null,
  "studentProfile": null,
  "csrfToken": null,
  "expiresAt": null
}
```

### clarificationNeeded

```json
{
  "attemptId": "attempt_unclear",
  "questionId": "assigned_q01",
  "clarificationOfAttemptId": null,
  "submittedAt": "2026-10-31T09:01:00.000Z",
  "finalAnswerText": "It changes.",
  "reasoningText": "It could double or halve.",
  "selectedOptionId": null,
  "status": "needs_clarification",
  "finalAnswerCorrect": null,
  "reasoningStatus": "unclear",
  "feedback": "Please clarify your reasoning.",
  "misconception": null,
  "clarificationPrompt": "With R fixed, does doubling V double or halve I?",
  "mastery": {
    "conceptId": "resistance-and-ohms-law",
    "before": null,
    "after": null,
    "evidenceCount": 0
  },
  "nextReviewAt": null,
  "session": {
    "id": "session_01",
    "mode": "practice",
    "conceptId": "resistance-and-ohms-law",
    "status": "active",
    "phase": "clarification",
    "version": 2,
    "progress": {
      "answeredCount": 0,
      "targetQuestionCount": 1
    },
    "currentQuestion": {
      "id": "assigned_q01",
      "conceptId": "resistance-and-ohms-law",
      "format": "free_response",
      "prompt": "If voltage doubles while resistance stays constant, what happens to current? Explain why.",
      "difficulty": "easy",
      "hint": "Think about I = V/R."
    },
    "lastAttempt": {
      "attemptId": "attempt_unclear",
      "questionId": "assigned_q01",
      "clarificationOfAttemptId": null,
      "submittedAt": "2026-10-31T09:01:00.000Z",
      "finalAnswerText": "It changes.",
      "reasoningText": "It could double or halve.",
      "selectedOptionId": null,
      "status": "needs_clarification",
      "finalAnswerCorrect": null,
      "reasoningStatus": "unclear",
      "feedback": "Please clarify your reasoning.",
      "misconception": null,
      "clarificationPrompt": "With R fixed, does doubling V double or halve I?",
      "mastery": {
        "conceptId": "resistance-and-ohms-law",
        "before": null,
        "after": null,
        "evidenceCount": 0
      },
      "nextReviewAt": null
    },
    "summary": null,
    "endedAt": null,
    "updatedAt": "2026-10-31T09:01:00.000Z"
  },
  "rewards": {
    "account": null,
    "grants": []
  }
}
```

### clarificationRequest

```json
{
  "sessionId": "session_01",
  "questionId": "assigned_q01",
  "expectedSessionVersion": 2,
  "finalAnswerText": "Current doubles.",
  "reasoningText": "I = V/R. R is fixed, so doubling V doubles I.",
  "clarificationOfAttemptId": "attempt_unclear"
}
```

### clarificationResolved

```json
{
  "attemptId": "attempt_resolved",
  "questionId": "assigned_q01",
  "clarificationOfAttemptId": "attempt_unclear",
  "submittedAt": "2026-10-31T09:01:00.000Z",
  "finalAnswerText": "Current doubles.",
  "reasoningText": "I = V/R. R is fixed, so doubling V doubles I.",
  "selectedOptionId": null,
  "status": "correct",
  "finalAnswerCorrect": true,
  "reasoningStatus": "sound",
  "feedback": "Correct: current doubles at fixed resistance.",
  "misconception": null,
  "clarificationPrompt": null,
  "mastery": {
    "conceptId": "resistance-and-ohms-law",
    "before": null,
    "after": 0.6,
    "evidenceCount": 1
  },
  "nextReviewAt": "2026-11-01T09:01:00.000Z",
  "session": {
    "id": "session_01",
    "mode": "practice",
    "conceptId": "resistance-and-ohms-law",
    "status": "active",
    "phase": "feedback",
    "version": 3,
    "progress": {
      "answeredCount": 1,
      "targetQuestionCount": 1
    },
    "currentQuestion": {
      "id": "assigned_q01",
      "conceptId": "resistance-and-ohms-law",
      "format": "free_response",
      "prompt": "If voltage doubles while resistance stays constant, what happens to current? Explain why.",
      "difficulty": "easy",
      "hint": "Think about I = V/R."
    },
    "lastAttempt": {
      "attemptId": "attempt_resolved",
      "questionId": "assigned_q01",
      "clarificationOfAttemptId": "attempt_unclear",
      "submittedAt": "2026-10-31T09:01:00.000Z",
      "finalAnswerText": "Current doubles.",
      "reasoningText": "I = V/R. R is fixed, so doubling V doubles I.",
      "selectedOptionId": null,
      "status": "correct",
      "finalAnswerCorrect": true,
      "reasoningStatus": "sound",
      "feedback": "Correct: current doubles at fixed resistance.",
      "misconception": null,
      "clarificationPrompt": null,
      "mastery": {
        "conceptId": "resistance-and-ohms-law",
        "before": null,
        "after": 0.6,
        "evidenceCount": 1
      },
      "nextReviewAt": "2026-11-01T09:01:00.000Z"
    },
    "summary": null,
    "endedAt": null,
    "updatedAt": "2026-10-31T09:01:00.000Z"
  },
  "rewards": {
    "account": null,
    "grants": []
  }
}
```

### abandonedFromAnswering

```json
{
  "id": "session_01",
  "mode": "practice",
  "conceptId": "resistance-and-ohms-law",
  "status": "abandoned",
  "phase": "abandoned",
  "version": 2,
  "progress": {
    "answeredCount": 0,
    "targetQuestionCount": 1
  },
  "currentQuestion": null,
  "lastAttempt": null,
  "summary": null,
  "endedAt": "2026-10-31T09:00:30.000Z",
  "updatedAt": "2026-10-31T09:00:30.000Z"
}
```

### abandonedFromClarification

```json
{
  "id": "session_01",
  "mode": "practice",
  "conceptId": "resistance-and-ohms-law",
  "status": "abandoned",
  "phase": "abandoned",
  "version": 3,
  "progress": {
    "answeredCount": 0,
    "targetQuestionCount": 1
  },
  "currentQuestion": null,
  "lastAttempt": {
    "attemptId": "attempt_unclear",
    "questionId": "assigned_q01",
    "clarificationOfAttemptId": null,
    "submittedAt": "2026-10-31T09:01:00.000Z",
    "finalAnswerText": "It changes.",
    "reasoningText": "It could double or halve.",
    "selectedOptionId": null,
    "status": "needs_clarification",
    "finalAnswerCorrect": null,
    "reasoningStatus": "unclear",
    "feedback": "Please clarify your reasoning.",
    "misconception": null,
    "clarificationPrompt": "With R fixed, does doubling V double or halve I?",
    "mastery": {
      "conceptId": "resistance-and-ohms-law",
      "before": null,
      "after": null,
      "evidenceCount": 0
    },
    "nextReviewAt": null
  },
  "summary": null,
  "endedAt": "2026-10-31T09:02:00.000Z",
  "updatedAt": "2026-10-31T09:02:00.000Z"
}
```

### afterEndDashboard

```json
{
  "profile": {
    "displayName": "Asha",
    "chapterId": "class-10-physics-electricity",
    "examDate": null,
    "timeZone": "Asia/Calcutta",
    "onboardingComplete": true
  },
  "activeSession": null,
  "dueRevisionCount": 0,
  "recommendedConceptId": "resistance-and-ohms-law",
  "concepts": [
    {
      "conceptId": "electric-current-and-charge",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "potential-difference",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistance-and-ohms-law",
      "mastery": 0.25,
      "state": "needs_practice",
      "evidenceCount": 1,
      "lastAssessedAt": "2026-10-31T09:01:00.000Z",
      "nextReviewAt": "2026-11-01T09:01:00.000Z",
      "recentMisconceptions": [
        {
          "misconceptionCode": "OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE",
          "label": "Assumes voltage increases the fixed resistance",
          "evidence": "higher voltage increases resistance",
          "observedAt": "2026-10-31T09:01:00.000Z"
        }
      ]
    },
    {
      "conceptId": "factors-affecting-resistance",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistors-in-series",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistors-in-parallel",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "electric-power",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "electrical-energy",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    }
  ],
  "recentSessions": [
    {
      "id": "session_01",
      "mode": "practice",
      "status": "abandoned",
      "answeredCount": 1,
      "updatedAt": "2026-10-31T09:02:00.000Z",
      "completedAt": null,
      "endedAt": "2026-10-31T09:02:00.000Z"
    }
  ],
  "rewards": {
    "account": null,
    "grants": []
  }
}
```

### newSessionAfterEnd

```json
{
  "id": "session_after_abandon",
  "mode": "practice",
  "conceptId": "resistance-and-ohms-law",
  "status": "active",
  "phase": "answering",
  "version": 1,
  "progress": {
    "answeredCount": 0,
    "targetQuestionCount": 1
  },
  "currentQuestion": {
    "id": "assigned_q01",
    "conceptId": "resistance-and-ohms-law",
    "format": "free_response",
    "prompt": "If voltage doubles while resistance stays constant, what happens to current? Explain why.",
    "difficulty": "easy",
    "hint": "Think about I = V/R."
  },
  "lastAttempt": null,
  "summary": null,
  "endedAt": null,
  "updatedAt": "2026-10-31T09:03:00.000Z"
}
```

### multipleChoiceQuestion

```json
{
  "id": "assigned_mc01",
  "conceptId": "resistance-and-ohms-law",
  "format": "multiple_choice",
  "prompt": "If voltage doubles while resistance stays constant, what happens to current? Explain why.",
  "difficulty": "easy",
  "hint": "Think about I = V/R.",
  "options": [
    {
      "id": "double",
      "text": "Current doubles."
    },
    {
      "id": "half",
      "text": "Current halves."
    }
  ]
}
```

### multipleChoiceSubmission

```json
{
  "sessionId": "session_mc",
  "questionId": "assigned_mc01",
  "expectedSessionVersion": 1,
  "finalAnswerText": "",
  "selectedOptionId": "double",
  "reasoningText": "I = V/R, so current doubles at fixed resistance."
}
```

### nonJsonProtocolError

```json
{
  "name": "TutorProtocolError",
  "message": "Expected JSON but received an HTML response.",
  "kind": "protocol",
  "reason": "non_json_response",
  "status": 502,
  "retryable": false,
  "outcome": "unknown",
  "requestId": null
}
```

### invalidSuccessProtocolError

```json
{
  "name": "TutorProtocolError",
  "message": "Success response does not match the agreed contract.",
  "kind": "protocol",
  "reason": "invalid_success_payload",
  "status": 200,
  "retryable": false,
  "outcome": "unknown",
  "requestId": null
}
```

### revisionScenarioRQueue

```json
{
  "generatedAt": "2026-10-31T09:02:00.000Z",
  "items": [
    {
      "id": "rev_due",
      "conceptId": "resistance-and-ohms-law",
      "status": "due",
      "dueAt": "2026-10-30T09:00:00.000Z",
      "reason": "Scheduled retrieval practice.",
      "completedAt": null,
      "completedSessionId": null
    },
    {
      "id": "rev_upcoming",
      "conceptId": "electric-power",
      "status": "upcoming",
      "dueAt": "2026-11-02T09:00:00.000Z",
      "reason": "Scheduled retrieval practice.",
      "completedAt": null,
      "completedSessionId": null
    },
    {
      "id": "rev_done",
      "conceptId": "potential-difference",
      "status": "completed",
      "dueAt": "2026-10-29T09:00:00.000Z",
      "reason": "Completed revision.",
      "completedAt": "2026-10-29T10:00:00.000Z",
      "completedSessionId": "old_revision"
    },
    {
      "id": "rev_potential_future",
      "conceptId": "potential-difference",
      "status": "upcoming",
      "dueAt": "2026-11-05T09:00:00.000Z",
      "reason": "Next retrieval after completed review.",
      "completedAt": null,
      "completedSessionId": null
    }
  ]
}
```

### revisionScenarioRDashboard

```json
{
  "profile": {
    "displayName": "Asha",
    "chapterId": "class-10-physics-electricity",
    "examDate": null,
    "timeZone": "Asia/Calcutta",
    "onboardingComplete": true
  },
  "activeSession": null,
  "dueRevisionCount": 1,
  "recommendedConceptId": "resistance-and-ohms-law",
  "concepts": [
    {
      "conceptId": "electric-current-and-charge",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "potential-difference",
      "mastery": 0.55,
      "state": "developing",
      "evidenceCount": 3,
      "lastAssessedAt": "2026-10-29T10:00:00.000Z",
      "nextReviewAt": "2026-11-05T09:00:00.000Z",
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistance-and-ohms-law",
      "mastery": 0.55,
      "state": "developing",
      "evidenceCount": 3,
      "lastAssessedAt": "2026-10-29T10:00:00.000Z",
      "nextReviewAt": "2026-10-30T09:00:00.000Z",
      "recentMisconceptions": []
    },
    {
      "conceptId": "factors-affecting-resistance",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistors-in-series",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "resistors-in-parallel",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    },
    {
      "conceptId": "electric-power",
      "mastery": 0.55,
      "state": "developing",
      "evidenceCount": 3,
      "lastAssessedAt": "2026-10-29T10:00:00.000Z",
      "nextReviewAt": "2026-11-02T09:00:00.000Z",
      "recentMisconceptions": []
    },
    {
      "conceptId": "electrical-energy",
      "mastery": null,
      "state": "unassessed",
      "evidenceCount": 0,
      "lastAssessedAt": null,
      "nextReviewAt": null,
      "recentMisconceptions": []
    }
  ],
  "recentSessions": [],
  "rewards": {
    "account": null,
    "grants": []
  }
}
```

### revisionScenarioREnded

```json
{
  "id": "revision_session_abandoned",
  "mode": "revision",
  "conceptId": "resistance-and-ohms-law",
  "status": "abandoned",
  "phase": "abandoned",
  "version": 2,
  "progress": {
    "answeredCount": 0,
    "targetQuestionCount": 1
  },
  "currentQuestion": null,
  "lastAttempt": null,
  "summary": null,
  "endedAt": "2026-10-31T09:02:00.000Z",
  "updatedAt": "2026-10-31T09:02:00.000Z"
}
```

### revisionScenarioRQueueAfterEnd

```json
{
  "generatedAt": "2026-10-31T09:02:00.000Z",
  "items": [
    {
      "id": "rev_due",
      "conceptId": "resistance-and-ohms-law",
      "status": "due",
      "dueAt": "2026-10-30T09:00:00.000Z",
      "reason": "Scheduled retrieval practice.",
      "completedAt": null,
      "completedSessionId": null
    },
    {
      "id": "rev_upcoming",
      "conceptId": "electric-power",
      "status": "upcoming",
      "dueAt": "2026-11-02T09:00:00.000Z",
      "reason": "Scheduled retrieval practice.",
      "completedAt": null,
      "completedSessionId": null
    },
    {
      "id": "rev_done",
      "conceptId": "potential-difference",
      "status": "completed",
      "dueAt": "2026-10-29T09:00:00.000Z",
      "reason": "Completed revision.",
      "completedAt": "2026-10-29T10:00:00.000Z",
      "completedSessionId": "old_revision"
    },
    {
      "id": "rev_potential_future",
      "conceptId": "potential-difference",
      "status": "upcoming",
      "dueAt": "2026-11-05T09:00:00.000Z",
      "reason": "Next retrieval after completed review.",
      "completedAt": null,
      "completedSessionId": null
    }
  ]
}
```

## Session lifecycle and refresh

| Before | Operation | After |
|---|---|---|
| No active session | startSession | active/answering, version=1, question present, lastAttempt=null |
| answering | gradeable submitAttempt | active/feedback, version+1, same question, feedback in lastAttempt |
| answering or clarification | ambiguous submitAttempt | active/clarification, version+1, same question, clarificationPrompt provided |
| clarification | submitAttempt with clarificationOfAttemptId | clarification again OR feedback; new attempt/key |
| feedback | advanceSession | next answering question with lastAttempt=null OR completed with summary |
| answering, feedback or clarification | endSession | abandoned/abandoned, version+1, endedAt set; no unresolved grading or completion side effects |
| Any | getSession | Same persisted state; no grading/advance/new reward |

Accept one mutation per current session version. Initial attempts only in answering; clarification only for the latest unresolved attempt on the same current question. Do not edit already graded feedback/completed questions in this MVP; assign another practice question. Reject advance from answering/clarification.

Completed means status=completed, phase=completed, currentQuestion=null, summary non-null and endedAt=summary.completedAt. Abandoned means status=abandoned, phase=abandoned, currentQuestion=null, summary=null and endedAt non-null; preserve lastAttempt even if it requested clarification. Active means summary=null and endedAt=null. In feedback/clarification lastAttempt.questionId matches currentQuestion.id. Top-level submit feedback MUST equal session.lastAttempt. A completed GET includes the summary, including diagnostic results. History completedAt stays null for abandoned sessions; endedAt records either terminal transition.

endSession JSON contains sessionId and expectedSessionVersion, with Idempotency-Key header. It is allowed from all three active phases, even feedback after the target number of questions is answered. Ending is NOT completing. Preserve all previously graded evidence, mastery, review dates, progress counts and attempt history exactly; do not evaluate unsent drafts or unresolved explanations, add evidence, create completion summaries, grant completion rewards, complete selected revision items or perform completion-only rescheduling. Existing revision rows stay due/upcoming as applicable and remain available to a new revision session. Grading that committed BEFORE endSession remains preserved.

Only the version and terminal session fields change on end: status/phase, currentQuestion=null, endedAt and updatedAt. Release the active-session slot atomically. The student can immediately start a new session with a new start key. An unchanged end replay returns the original abandoned snapshot, even after a new session starts; it must not end that new session. For a new key, validate expectedSessionVersion before phase: a stale version returns SESSION_VERSION_CONFLICT; a matching version on a terminal session returns INVALID_SESSION_STATE. Concurrent end/submit/advance serialize on the same session version: one succeeds, the others get SESSION_VERSION_CONFLICT (after replay lookup), with no duplicate grading or completion. Resolve an unknown submission outcome before issuing a competing end action.

answeredCount counts graded assignments, not clarification messages. Summary correctCount+partialCount+incorrectCount=answeredCount. Backend selects length/adaptive questions. targetQuestionCount may be null; UI must not invent progress percentages.

Diagnostic start JSON is {"mode":"diagnostic"}; session conceptId=null. Use normal submit/advance loop. Persisted final summary contains all eight conceptProgress rows, recommendedConceptIds and feedback. No separate diagnostic-result endpoint.

Revision start JSON is {"mode":"revision","revisionItemIds":["rev_due"]}. Backend completes selected rows atomically when session completes and creates NEW IDs for future reviews. Frontend refreshes queue/dashboard/concepts/progress. Backend owns dueAt/status/nextReviewAt; frontend only formats/groups them. Queue returns all active items and completed items from the last 30 days.

New-student dashboard: no active session, zero due items, recentSessions=[], eight unassessed concepts. Teacher detail returns newest 10 sessions/20 attempts. Classes contain all enrolled students, including unassessed. Small class arrays are not paginated for this MVP.

Every misconception contains a nonempty stable misconceptionCode from a backend-controlled catalog (uppercase letters/digits/underscores). The initial shared sample code is OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE. Assign codes from that catalog, not new LLM-generated codes or hashes of label wording. Labels may be rewritten/localized without changing identity. Teacher commonMisconceptions groups by the exact tuple (conceptId, misconceptionCode), counting each affected student once, however many matching attempts they have. Different codes never merge merely because labels match. recentMisconceptions includes code, label, evidence and observedAt for detected recent mistakes; teacher rows and student progress must reflect the same observations. Catalog additions must be coordinated; never repurpose a code.

At a single scenario timestamp, ConceptProgress.nextReviewAt is the earliest dueAt among that concept's non-completed revision items, or null if none. dueRevisionCount equals the number of queue rows whose server-provided status is due; completed items never count. Server sets due when dueAt <= generatedAt and upcoming otherwise. A1 examples have one upcoming Ohm's-law item and zero due items. R examples are a separate older learner state with one due item. Do not splice R's queue into A1's dashboard.

Compared with the original sketch: answerText is split into finalAnswerText/reasoningText. Transient nextQuestion/sessionComplete fields are replaced by explicit advanceSession and persisted SessionSnapshot. This preserves feedback on refresh and prevents accidental progression. Both teammates must use this agreed contract consistently.

## Voice and reasoning

### Authoritative answer by format

- multiple_choice: Question.options is a nonempty array of unique IDs. Require selectedOptionId matching one option AND finalAnswerText="" (exact empty string). Grade that selected option; reasoningText is separate evidence, not an alternate selection. Nonempty finalAnswerText is VALIDATION_ERROR even if it repeats the selected label; never silently choose one field.
- free_response: options is absent. Require nonempty trimmed finalAnswerText and omit selectedOptionId entirely (null is also invalid). Grade finalAnswerText; reasoningText remains separate. A supplied selectedOptionId is VALIDATION_ERROR even if finalAnswerText is otherwise valid.
- Reject missing/invalid format, inconsistent options, conflicting/missing authoritative fields or a selection not belonging to the assigned question before grading. Return 400 with fieldErrors, without changing mastery, evidence or session version. Question format comes from the server's stored assignment, not a client override. The server validates generated question payloads before publication.
- Persist finalAnswerText/selectedOptionId exactly according to these rules in AttemptFeedback. For MC the stored finalAnswerText is empty and selectedOptionId non-null; resolve display text from the assigned Question.options. No new answer-format field is accepted in SubmitAttemptInput.

Wispr Flow types into a normal focused explanation field. Student reviews/edits and explicitly submits finalAnswerText/reasoningText. Typed fallback is identical. No simulated recorder, microphone SDK, audio upload or transcript-normalization endpoint. No raw audio/secondary transcript is sent; confirmed text is evidence.

Correct final answer can have wrong reasoning: finalAnswerCorrect=true, reasoningStatus=misconception, overall partial. Do not let a lucky answer mask a supported misconception. If insufficient evidence, misconception=null or ask clarification. Evidence must be an exact substring of reasoningText, never an invented quote.

needs_clarification requires nonempty clarificationPrompt, mastery.after=before (including null), unchanged evidenceCount/nextReviewAt. Misconception normally null. Resolve with a new submission/key referencing the latest ambiguous attempt; repeated ambiguity can remain clarification.

Unanswered Question never includes answers, rubrics, hidden notes, provider prompts or bank IDs. Hints remain hints. Backend validates generated content/numerical answers. Difficulty/mastery are prototype estimates, not validated psychometric calibration.

## Rewards remain disabled

All v1.1.0 responses (including mocks, nested summaries and terminal sessions) return exactly {"account":null,"grants":[]}. No fake XP/streaks, grants or reward effects. The Rewards type enforces this. RewardAccount/RewardGrant declarations are reserved for a future coordinated version, not permission to enable rewards now.

Any future reward proposal must keep XP separate from mastery and use immutable replay-stable event IDs. No frontend adapter/reward implementation changes before a later contract version is agreed.

## Draft persistence

Store unsent drafts and immutable pending payload/key together in frontend state keyed by user/session/question. Real drafts may use per-tab sessionStorage; clear on sign-out/account switch/completion. Real progress lives on backend. Server restores submitted answers, not text never received. Never use global cross-user draft keys.

## Idempotency, concurrency, retry

1. Generate opaque random key (UUID recommended) BEFORE learning mutation; save exact payload/key and prevent duplicate clicks.
2. Backend scopes key by principal, operation and path. Retain successful results at least 24 hours.
3. Same key/payload returns original success status/body/IDs/version/events. Replay lookup BEFORE active-session/version validation.
4. Same key/different payload: 409 IDEMPOTENCY_CONFLICT. Edited payload, clarification or new action uses new key.
5. Concurrent identical requests wait or get 409 REQUEST_IN_PROGRESS with retry delay. Never grade twice.
6. Commit evidence, session mutation and replay result atomically. Lost post-commit response is replayable. Transient failures must not finalize a key as success or block safe retries.
7. Different key with stale expectedSessionVersion: 409 SESSION_VERSION_CONFLICT. Fetch/reconcile; do not automatically resubmit as new evidence.
8. Network/timeout/429/retryable 409/5xx: retain SAME key/body and back off using retryAfterSeconds. Protocol failures with unknown mutation outcome also preserve the same pending key/body, but are not automatically retried in a loop. Unknown outcome is not permission for a new key, an edited replacement or another competing mutation.
9. Definitive validation failure preserves editable input. Changed payload gets new key. Never fabricate success or silently switch to mocks.

## Errors

A conforming server returns ApiErrorBody for every non-2xx response. A proxy, timeout page or broken server may violate that; those responses are protocol failures, not invented ApiErrorBody objects:

```json
{"error":{"code":"SESSION_VERSION_CONFLICT","message":"Session changed. Reload before submitting.","retryable":false,"requestId":"request_example_01"}}
```

| HTTP | code | retryable | Behavior |
|---|---|---|---|
| 400 | VALIDATION_ERROR | false | Show fieldErrors, preserve input. |
| 401 | AUTH_REQUIRED / INVALID_CREDENTIALS | false | Sign in/correct credentials. |
| 403 | FORBIDDEN | false | Access/CSRF denial; no blind retry. |
| 404 | NOT_FOUND | false | Missing/inaccessible resource. |
| 409 | ONBOARDING_REQUIRED | false | Save profile. |
| 409 | ACTIVE_SESSION_EXISTS | false | Include activeSessionId; resume. |
| 409 | SESSION_VERSION_CONFLICT | false | Fetch and reconcile. |
| 409 | INVALID_SESSION_STATE | false | Fetch and show allowed actions. |
| 409 | IDEMPOTENCY_CONFLICT | false | Same key/different content; fix client. |
| 409 | REQUEST_IN_PROGRESS | true | Retry unchanged with original key after delay. |
| 429 | RATE_LIMITED | true | Delay, retry unchanged/key preserved. |
| 503 | AI_UNAVAILABLE | true | Preserve input, retry unchanged. |
| 500 | INTERNAL_ERROR | server supplied | Retry only when marked retryable. |

Set retryAfterSeconds when known; optionally matching Retry-After header. Never expose provider secrets/stack traces. HttpTutorApi rejects HTTP failures as TutorApiError (kind=http). Network/timeout uses TutorNetworkError (kind=network), no fabricated HTTP body/status. Mock simulates both.

### Unexpected/protocol responses

TutorProtocolError is adapter-created (kind=protocol), not an ApiErrorCode. It records actual HTTP status, a safe requestId or null, retryable=false and outcome=unknown for mutating requests or not_applicable for GET. Do not expose raw HTML/error bodies in UI/logs.

| reason | Classification |
|---|---|
| non_json_response | Expected JSON but response media type is not application/json or application/*+json; applies to success AND failure. |
| malformed_json | JSON media type with body that cannot be parsed as JSON. |
| invalid_success_payload | Valid JSON/expected success status but fields, types, enums or documented invariants fail runtime validation. |
| invalid_error_payload | Non-2xx JSON does not match ApiErrorBody. |
| unexpected_status | A received 2xx status is not allowed for that operation (signOut expects 204; start expects 201; other successes 200). |

signOut's conforming 204 requires no JSON/body and is not a protocol error. Check unexpected success status first, then media type/JSON/schema as applicable. A start-session replay returns its original 201. Runtime validation includes question format, session terminal invariants, finite mastery ranges and disabled reward shape.

For any protocol failure on start/submit/advance/end, the mutation may already have committed. Keep pending draft, immutable payload and ORIGINAL idempotency key. Do not show graded feedback, clear the draft, advance, make a new key, assume failure or silently switch to mocks. Stop automatic retries and offer an explicit retry with the exact original key/body once the protocol problem is fixed. Fetching the session can inform reconciliation but cannot by itself justify a new submission key; replay the original request for its authoritative result. Retain/replay results must span these failures. Authentication credentials are never persisted as a pending submission.

## Mock and HTTP adapters

One selection point implements TutorApi. Mock personas: student-new, student-returning, teacher. Clearly label sample data. Keep all demo localStorage, deterministic outcomes, latency/errors and reset inside MockTutorApi. Persist session/feedback/replay results so mock refresh genuinely resumes.

HttpTutorApi calls documented endpoints, includes credentials/CSRF, translates keys to headers, validates success payloads at runtime and normalizes errors. No browser Groq/Supabase secrets. Real errors never trigger mock fallback. Backend enforces permission regardless of visible routes.

## Verification and implementation acceptance

Acceptance scenarios, NOT claims of a running backend:

- Diagnostic: auth/profile → diagnostic → submit/review/advance → persisted recommendations.
- Wrong reasoning: fixed-resistance sample cites exact mistaken assumption and explains I=V/R.
- Correct answer/wrong reasoning: not unqualified correct reasoning feedback.
- Clarification: ambiguity changes no mastery/evidence/schedule; resolution counts question once.
- Refresh: restores feedback/clarification/summary without submit/advance/reward.
- End: answering/feedback/clarification → abandoned; no unresolved grading, progress loss, completion reward or unfinished revision completion; a new session can start.
- End retry/concurrency: exact replay stable, new-key terminal mutation rejected, version race safe.
- Answer formats: valid MC/free response accepted; conflicting or missing authoritative fields fail before grading.
- Protocol failure: non-JSON error page, malformed JSON and invalid success schema retain pending submission/key; no fake success or auto-loop.
- Samples: recent misconception appears in progress; queue dates, nextReviewAt and due counts agree per scenario.
- Misconception identity: identical code/different label groups together; different codes never merge by label; count distinct students.
- Retry/concurrency: one attempt/reward; changed-body/same-key rejected; lost response replayable.
- Revision: selected rows complete; future rows use new IDs.
- History: eight concepts, deterministic pages, misconceptions and subsequent attempts.
- Teacher: distinct-student counts, unassessed learners, authorized detail and protected data.
- Rewards are disabled in every sample and response shape.

Delivery checks syntax/types, endpoint coverage, JSON example type compatibility, graph and example state/count invariants. This contract does not itself run authentication, Groq, an app build, or validate pedagogy.

## Integration confirmations with backend owner

1. Implement this exact agreed v1.1.0 pair, eight concept IDs and 17 operations.
2. Cookie auth, pre-created accounts and same-origin `/api/v1` are agreed defaults. Exchange test-account credentials and confirm trusted development origins without committing secrets. If using token-based Supabase auth instead, revise BOTH files first.
3. Confirm backend diagnostic length, mastery thresholds, difficulty calibration and reasoning rubric. Frontend consumes results only.
4. A seeded class roster is the agreed MVP default; confirm the fixture names and IDs used in the shared development environment.
5. Rewards remain OFF for this version. Agree a separate version before enabling them.

This agreement supersedes local drafts with different concept IDs or incomplete operation coverage. Increment the version for any later behavioral change.
