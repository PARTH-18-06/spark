# Spark database setup

This guide covers the database foundation and learning-mutation claim boundary
for the reviewed PROPOSED tutor contract v1.1.0. Groq is called only outside a
short claim transaction; hosted session lifecycle RPCs remain a deployment
configuration step.

## Files and responsibilities

- `supabase/migrations/20261031000100_spark_foundation.sql` creates the schema,
  constraints, foreign keys, indexes, immutable snapshots, and replay store.
- `supabase/migrations/20261031000200_security_and_invariants.sql` adds
  cross-row triggers, immutable-history enforcement, grants, safe helper
  functions, and RLS policies.
- `supabase/migrations/20261031000300_auth_and_onboarding.sql` adds encrypted
  backend-session fields, the display-name directory, atomic onboarding RPC,
  and the database-backed login limiter.
- `supabase/migrations/20261031000400_learning_engine_invariants.sql` prevents
  duplicate graded evidence and duplicate source-attempt revision items.
- `supabase/migrations/20261031000500_learning_idempotency_claims.sql` adds
  expiring, token-fenced learning mutation claims and replay-body completion.
- `supabase/migrations/20261031000600_learning_session_rpc.sql` implements the
  production session reads, creation, finalization, advancement, abandonment,
  snapshot reconstruction, and service-role grants.
- `supabase/migrations/20261031000700_read_models_rpc.sql` implements the
  dashboard, revision, progress, attempt-history, and teacher read RPCs with
  repeated class/roster authorization checks and service-role grants.
- `supabase/seed.sql` contains only the eight-concept graph, misconception
  catalog, and 24 reviewed questions/rubrics. It never creates Auth users or
  simulated progress.
- `scripts/provision-dev-accounts.mjs` uses the server-only Supabase Auth Admin
  API to create or reuse a synthetic Class 10A roster without invitations.
- `tests/database.test.ts` executes the migrations and seed in an isolated
  PostgreSQL-compatible PGlite database and checks constraints, RLS/grants,
  seed repeatability, contract payloads, options, and calculations.

The session service calls the named `spark_*` RPC boundary for production
reads/writes. Applying this migration is necessary before enabling those
routes against Supabase; the local handler tests use an injected repository and
do not claim hosted PostgREST execution.

Migration 005 was already present in the local migration chain before the
read-model work and is replayed by the PGlite tests. No hosted Supabase project
or applied migration history is available on this workstation.

## Local validation without Supabase

```powershell
pnpm db:test
```

This is fast and isolated. It validates PostgreSQL behavior used by the
migrations, including role switching and RLS. It is not a substitute for the
final Supabase CLI/PostgREST/Auth integration test.

## Full local Supabase workflow

Install the Supabase CLI and Docker-compatible container runtime first. Then,
from this repository:

```powershell
supabase init
supabase start
supabase db reset --local
supabase db lint --local --fail-on error
```

`supabase db reset --local` destroys only the local development database,
replays migrations, then applies `supabase/seed.sql`. Do not add `--linked` or
`--db-url` unless destructive remote reset is explicitly intended and approved.

The default Supabase seed location is `supabase/seed.sql`; seeds run after all
migrations. See the official [migration guide](https://supabase.com/docs/guides/local-development/database-migrations)
and [seeding guide](https://supabase.com/docs/guides/local-development/seeding-your-database).

## Inspecting and applying to a remote development project

Do not push before identifying the target and checking its migration history:

```powershell
supabase projects list
supabase link --project-ref <development-project-ref>
supabase migration list --linked
supabase db push --dry-run
```

For a confirmed empty development/staging target only:

```powershell
supabase db push --include-seed
```

Never use `--include-seed` or a linked reset casually on production. The seed
upserts stable catalog IDs and synchronizes contract-owned graph mappings, but
it intentionally does not modify learner profiles, sessions, attempts,
mastery, revision items, or idempotency records.

## Synthetic account and roster provisioning

Content seeding and account creation are separate. Set these values in
`.env.local` (loaded by the script) or the current shell; do not commit
passwords:

```powershell
$env:SUPABASE_URL = '<development-project-url>'
$env:SUPABASE_SERVICE_ROLE_KEY = '<development-secret-or-service-role-key>'
$env:SPARK_ENVIRONMENT_NAME = 'local'
$env:SPARK_ALLOW_DEV_PROVISIONING = 'true'
$env:DEV_TEACHER_EMAIL = 'teacher@example.test'
$env:DEV_TEACHER_PASSWORD = '<local-password>'
$env:DEV_TEACHER_UNASSIGNED_EMAIL = 'teacher-unassigned@example.test'
$env:DEV_TEACHER_UNASSIGNED_PASSWORD = '<local-password>'
$env:DEV_STUDENT_NEW_EMAIL = 'new.student@example.test'
$env:DEV_STUDENT_NEW_PASSWORD = '<local-password>'
$env:DEV_STUDENT_RETURNING_EMAIL = 'returning.student@example.test'
$env:DEV_STUDENT_RETURNING_PASSWORD = '<local-password>'
pnpm db:provision:dev
```

The script uses `auth.admin.createUser` with confirmed synthetic emails and
sends no invitation. It is repeatable: existing emails are reused, and roles,
display-directory rows, profiles, class, teacher assignment, and enrolments are
upserted. It refuses to
run when the environment is named `prod` or `production`, and requires an
explicit enable flag. The returning account label does not create simulated
learning history; any such fixtures must live in a separate development-only
script.

The unassigned teacher receives the teacher role and directory row but is not
assigned to Class 10A. This fixture is used only for negative authorization
checks; account passwords and IDs must stay in the approved secret channel.

Supabase documents that Auth Admin methods are server-only and require a secret
key: [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
and [listUsers](https://supabase.com/docs/reference/javascript/auth-admin-listusers).

## Security model

- `auth.users.id` is the only identity foreign key. No application password is
  stored in public tables.
- Browser roles receive safe read grants only. Learning-state writes, role
  assignment, private rubrics, session-rubric snapshots, backend cookie-session
  hashes, and idempotency records have no `anon`/`authenticated` grants.
- Students can read only their own permitted rows. Assigned teachers can read
  roster students for their classes, but not students outside those classes.
- Teacher membership requires a server-controlled teacher role; student
  clients cannot insert or update `user_roles`.
- RLS helper functions are `SECURITY DEFINER`, have explicit safe
  `search_path`, and grant execution only where policies need it. Trigger-only
  functions are not client-executable.
- Assignment public content and private rubric snapshots are stored separately
  and made immutable, so later bank edits cannot alter an assigned question.
- A secret/service-role client bypasses RLS. Backend routes must still derive
  the authenticated principal and verify ownership, class assignment, and
  operation permissions before every privileged query. Supabase’s
  [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)
  explicitly warns that secret/service-role access bypasses policies.

## Curriculum references

The seed questions are original Spark questions. Scope, equations, units, and
worked calculations were checked against:

- [NCERT Class X Science, Chapter 11 — Electricity](https://www.ncert.nic.in/textbook/pdf/jesc111.pdf)
- [CBSE Science curriculum 2025–26, competency C-2.4](https://cbseacademic.nic.in/web_material/CurriculumMain26/Sec/Science_Sec_2025-26.pdf)

The automated tests independently recompute each stored numerical answer and
check that every multiple-choice correct option exists exactly once.

## Infrastructure still required

The approved test project is linked and all seven migrations plus the
repeatable seed are deployed. The CLI is available through `pnpm dlx`; Docker
is not installed, so only the shadow-database `supabase db diff --linked`
diagnostic remains unavailable. The live suite has verified hosted
Auth/PostgREST behavior and permissions. Do not use `supabase db reset`.
