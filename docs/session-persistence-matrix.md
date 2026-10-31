# Production session persistence matrix

This matrix is for the reviewed PROPOSED v1.1.0 contract. All RPCs below are
defined in the versioned migrations and are granted only to `service_role`.
The route still authorizes the backend-managed cookie principal before calling
them; RPCs repeat ownership, claim, phase, and expected-version checks.

| Operation | Route | Production path | SQL functions/tables | Migration | Database-backed evidence |
|---|---|---|---|---|---|
| getConcepts | `GET /api/v1/concepts` | `getConceptProgress` | `spark_get_concept_progress`; concepts, concept_mastery, revision_items, misconception_observations | 006 | Progress helper exercised by session summaries; direct read path is covered by function installation and permissions |
| startSession | `POST /api/v1/sessions` | `start` | claim → `spark_start_learning_session`; tutor_sessions, assignments, rubric snapshots, session_revision_items, idempotency | 005 + 006 | PGlite start/reload test; active-session and due/ownership checks are enforced |
| getSession | `GET /api/v1/sessions/{sessionId}` | `session` | `spark_get_session_snapshot`; tutor_sessions, assignments, attempts, summary_snapshot | 006 | PGlite reload and cross-student ownership test |
| submitAttempt | `POST /api/v1/sessions/{sessionId}/attempts` | `submit` | claim → evaluator outside SQL → `spark_finalize_learning_attempt`; attempts, concept_mastery, misconception_observations, revision_items, tutor_sessions, idempotency | 005 + 006 | Graded and clarification finalization, replay, stale-version, rollback constraints |
| advanceSession | `POST /api/v1/sessions/{sessionId}/advance` | `advance` | claim → `spark_advance_learning_session`; tutor_sessions, attempts, revision_items, summary_snapshot, idempotency | 005 + 006 | Completion test verifies persisted summary and exactly one effect set |
| endSession | `POST /api/v1/sessions/{sessionId}/end` | `end` | claim → `spark_end_learning_session`; tutor_sessions, idempotency | 005 + 006 | Clarification abandonment test verifies no summary and preserved state |

## Claim and recovery functions

`spark_claim_learning_mutation`, `spark_complete_learning_mutation`, and
`spark_release_learning_claim` are defined in migration 005. Lifecycle RPCs
complete the idempotency row in their own transaction, so the replay body is
committed with the learning effects. An expired token is rejected by
`app_private.assert_learning_claim`; a later claim receives a new token and a
stale worker cannot finalize.

## Verification status

The local PGlite harness executes all six production session RPC paths and the
claim/recovery functions. It does not provide genuine concurrent PostgreSQL
workers, Supabase PostgREST, or Supabase Auth, so live concurrency and hosted
deployment remain unverified. No migration was applied to a hosted project.

## v1.1.0 read operations

The seven read operations are now also migration-backed in
`20261031000700_read_models_rpc.sql`:

| Operation | RPC | Authorization | Persisted sources |
|---|---|---|---|
| getStudentDashboard | `spark_get_student_dashboard` | authenticated onboarded student | profile, mastery, observations, revisions, sessions |
| getRevisionQueue | `spark_get_revision_queue` | authenticated onboarded student | revision_items |
| getProgress | `spark_get_progress` | authenticated onboarded student | concept progress and ordered session history |
| getAttemptHistory | `spark_get_attempt_history` | authenticated onboarded student | attempts, immutable assignments/rubrics mapped to public questions |
| getClasses | `spark_get_teacher_classes` | authenticated teacher | class_teachers and class_students |
| getClassDashboard | `spark_get_class_dashboard` | assigned teacher for class | roster, student progress, graded observations, due revisions |
| getStudentDetail | `spark_get_student_detail` | assigned teacher + roster student | bounded sessions and attempts with public question mapping |

The teacher RPCs repeat class/roster checks even though the route also uses the
verified auth-store guards. Browser roles cannot execute any of these RPCs.

