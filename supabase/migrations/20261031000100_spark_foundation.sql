-- Spark backend foundation for the reviewed PROPOSED tutor contract v1.1.0.
-- Auth identities live in auth.users; application passwords are never stored here.

create type public.spark_app_role as enum ('student', 'teacher');
create type public.spark_question_format as enum ('multiple_choice', 'free_response');
create type public.spark_difficulty as enum ('easy', 'medium', 'hard');
create type public.spark_session_mode as enum ('diagnostic', 'practice', 'revision');
create type public.spark_session_status as enum ('active', 'completed', 'abandoned');
create type public.spark_session_phase as enum ('answering', 'feedback', 'clarification', 'completed', 'abandoned');
create type public.spark_evaluation_status as enum ('correct', 'partial', 'incorrect', 'needs_clarification');
create type public.spark_reasoning_status as enum ('sound', 'misconception', 'unclear', 'not_provided');
create type public.spark_revision_status as enum ('due', 'upcoming', 'completed');
create type public.spark_idempotency_state as enum ('in_progress', 'succeeded');

create table public.student_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  chapter_id text not null default 'class-10-physics-electricity'
    check (chapter_id = 'class-10-physics-electricity'),
  exam_date date,
  time_zone text not null check (char_length(btrim(time_zone)) between 1 and 100),
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.spark_app_role not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  stable_code text not null unique check (stable_code ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_teachers (
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, teacher_user_id)
);

create table public.class_students (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, student_user_id)
);

create index class_teachers_teacher_idx on public.class_teachers (teacher_user_id, class_id);
create index class_students_student_idx on public.class_students (student_user_id, class_id);

create table public.concepts (
  id text primary key,
  chapter_id text not null check (chapter_id = 'class-10-physics-electricity'),
  title text not null check (char_length(btrim(title)) > 0),
  description text not null check (char_length(btrim(description)) > 0),
  sort_order smallint not null unique check (sort_order between 1 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.concept_prerequisites (
  concept_id text not null references public.concepts(id) on delete cascade,
  prerequisite_concept_id text not null references public.concepts(id) on delete restrict,
  primary key (concept_id, prerequisite_concept_id),
  check (concept_id <> prerequisite_concept_id)
);

create table public.misconception_catalog (
  code text primary key check (code ~ '^[A-Z][A-Z0-9_]*$'),
  concept_id text not null references public.concepts(id) on delete restrict,
  label text not null check (char_length(btrim(label)) > 0),
  description text not null check (char_length(btrim(description)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.question_bank (
  id text primary key check (id ~ '^electricity_[a-z0-9_]+$'),
  concept_id text not null references public.concepts(id) on delete restrict,
  format public.spark_question_format not null,
  difficulty public.spark_difficulty not null,
  public_prompt text not null check (char_length(btrim(public_prompt)) > 0),
  hint text check (hint is null or char_length(btrim(hint)) > 0),
  expected_unit text check (expected_unit is null or char_length(btrim(expected_unit)) > 0),
  options jsonb,
  content_version integer not null default 1 check (content_version > 0),
  source_reference text not null check (char_length(btrim(source_reference)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (format = 'multiple_choice' and jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2)
    or (format = 'free_response' and options is null)
  ),
  unique (id, content_version)
);

create index question_bank_selection_idx
  on public.question_bank (concept_id, difficulty, format)
  where is_active;

create table public.question_rubrics (
  question_id text not null references public.question_bank(id) on delete cascade,
  rubric_version integer not null check (rubric_version > 0),
  correct_answer jsonb not null check (jsonb_typeof(correct_answer) = 'object'),
  worked_solution text not null check (char_length(btrim(worked_solution)) > 0),
  reasoning_rubric jsonb not null check (jsonb_typeof(reasoning_rubric) = 'object'),
  numeric_answer numeric,
  numeric_tolerance numeric check (numeric_tolerance is null or numeric_tolerance >= 0),
  expected_unit text check (expected_unit is null or char_length(btrim(expected_unit)) > 0),
  created_at timestamptz not null default now(),
  primary key (question_id, rubric_version),
  check ((numeric_answer is null and numeric_tolerance is null) or numeric_answer is not null)
);

create table public.question_misconceptions (
  question_id text not null references public.question_bank(id) on delete cascade,
  misconception_code text not null references public.misconception_catalog(code) on delete restrict,
  primary key (question_id, misconception_code)
);

create table public.backend_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_token_hash text not null unique check (session_token_hash ~ '^[0-9a-f]{64}$'),
  csrf_token_hash text not null check (csrf_token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index backend_auth_sessions_user_idx on public.backend_auth_sessions (user_id, expires_at desc);

create table public.tutor_sessions (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references auth.users(id) on delete cascade,
  mode public.spark_session_mode not null,
  concept_id text references public.concepts(id) on delete restrict,
  status public.spark_session_status not null default 'active',
  phase public.spark_session_phase not null default 'answering',
  version integer not null default 1 check (version > 0),
  answered_count integer not null default 0 check (answered_count >= 0),
  target_question_count integer check (target_question_count is null or target_question_count >= 0),
  current_assignment_id uuid,
  last_attempt_id uuid,
  summary_snapshot jsonb,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, student_user_id),
  check (
    (status = 'active' and phase in ('answering', 'feedback', 'clarification')
      and summary_snapshot is null and ended_at is null)
    or (status = 'completed' and phase = 'completed'
      and current_assignment_id is null and summary_snapshot is not null and ended_at is not null)
    or (status = 'abandoned' and phase = 'abandoned'
      and current_assignment_id is null and summary_snapshot is null and ended_at is not null)
  ),
  check ((mode = 'diagnostic' and concept_id is null) or mode <> 'diagnostic')
);

create unique index tutor_sessions_one_active_per_student
  on public.tutor_sessions (student_user_id)
  where status = 'active';
create index tutor_sessions_student_history_idx
  on public.tutor_sessions (student_user_id, updated_at desc, id desc);

create table public.session_question_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.tutor_sessions(id) on delete cascade,
  question_bank_id text references public.question_bank(id) on delete set null,
  question_content_version integer not null check (question_content_version > 0),
  rubric_version integer not null check (rubric_version > 0),
  ordinal integer not null check (ordinal > 0),
  concept_id text not null references public.concepts(id) on delete restrict,
  format public.spark_question_format not null,
  difficulty public.spark_difficulty not null,
  public_prompt text not null check (char_length(btrim(public_prompt)) > 0),
  hint text check (hint is null or char_length(btrim(hint)) > 0),
  expected_unit text check (expected_unit is null or char_length(btrim(expected_unit)) > 0),
  options_snapshot jsonb,
  assigned_at timestamptz not null default now(),
  unique (session_id, ordinal),
  unique (id, session_id),
  unique (id, session_id, concept_id),
  check (
    (format = 'multiple_choice' and jsonb_typeof(options_snapshot) = 'array'
      and jsonb_array_length(options_snapshot) >= 2)
    or (format = 'free_response' and options_snapshot is null)
  )
);

create table public.session_question_rubrics (
  assignment_id uuid primary key references public.session_question_assignments(id) on delete cascade,
  correct_answer_snapshot jsonb not null check (jsonb_typeof(correct_answer_snapshot) = 'object'),
  worked_solution_snapshot text not null check (char_length(btrim(worked_solution_snapshot)) > 0),
  reasoning_rubric_snapshot jsonb not null check (jsonb_typeof(reasoning_rubric_snapshot) = 'object'),
  numeric_answer numeric,
  numeric_tolerance numeric check (numeric_tolerance is null or numeric_tolerance >= 0),
  expected_unit text check (expected_unit is null or char_length(btrim(expected_unit)) > 0),
  created_at timestamptz not null default now(),
  check ((numeric_answer is null and numeric_tolerance is null) or numeric_answer is not null)
);

alter table public.tutor_sessions
  add constraint tutor_sessions_current_assignment_fk
  foreign key (current_assignment_id, id)
  references public.session_question_assignments(id, session_id)
  deferrable initially deferred;

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  assignment_id uuid not null,
  student_user_id uuid not null,
  concept_id text not null,
  clarification_of_attempt_id uuid,
  submitted_at timestamptz not null default now(),
  final_answer_text text not null check (char_length(final_answer_text) <= 2000),
  reasoning_text text not null check (char_length(reasoning_text) <= 8000),
  selected_option_id text,
  status public.spark_evaluation_status not null,
  final_answer_correct boolean,
  reasoning_status public.spark_reasoning_status not null,
  feedback text not null check (char_length(btrim(feedback)) > 0),
  misconception_code text references public.misconception_catalog(code) on delete restrict,
  misconception_label text,
  misconception_evidence text,
  clarification_prompt text,
  mastery_before numeric check (mastery_before is null or mastery_before between 0 and 1),
  mastery_after numeric check (mastery_after is null or mastery_after between 0 and 1),
  evidence_count_before integer not null check (evidence_count_before >= 0),
  evidence_count_after integer not null check (evidence_count_after >= 0),
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, assignment_id),
  unique (id, session_id),
  unique (id, student_user_id, concept_id),
  foreign key (session_id, student_user_id)
    references public.tutor_sessions(id, student_user_id) on delete cascade,
  foreign key (assignment_id, session_id, concept_id)
    references public.session_question_assignments(id, session_id, concept_id) on delete restrict,
  foreign key (clarification_of_attempt_id, assignment_id)
    references public.attempts(id, assignment_id) on delete restrict,
  check (
    (status = 'needs_clarification' and final_answer_correct is null
      and clarification_prompt is not null and char_length(btrim(clarification_prompt)) > 0
      and mastery_after is not distinct from mastery_before
      and evidence_count_after = evidence_count_before)
    or (status <> 'needs_clarification' and final_answer_correct is not null
      and clarification_prompt is null and evidence_count_after >= evidence_count_before)
  ),
  check (
    (misconception_code is null and misconception_label is null and misconception_evidence is null)
    or (misconception_code is not null and misconception_label is not null)
  ),
  check (
    misconception_evidence is null
    or position(misconception_evidence in reasoning_text) > 0
  )
);

create index attempts_session_submitted_idx on public.attempts (session_id, submitted_at desc, id desc);
create index attempts_student_submitted_idx on public.attempts (student_user_id, submitted_at desc, id desc);

alter table public.tutor_sessions
  add constraint tutor_sessions_last_attempt_fk
  foreign key (last_attempt_id, id)
  references public.attempts(id, session_id)
  deferrable initially deferred;

create table public.concept_mastery (
  student_user_id uuid not null references auth.users(id) on delete cascade,
  concept_id text not null references public.concepts(id) on delete cascade,
  mastery numeric check (mastery is null or mastery between 0 and 1),
  learning_state text not null check (learning_state in ('unassessed', 'needs_practice', 'developing', 'strong')),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  last_assessed_at timestamptz,
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (student_user_id, concept_id),
  check ((mastery is null) = (learning_state = 'unassessed')),
  check ((evidence_count = 0 and last_assessed_at is null) or evidence_count > 0)
);

create table public.misconception_observations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  student_user_id uuid not null,
  concept_id text not null,
  misconception_code text not null references public.misconception_catalog(code) on delete restrict,
  label_snapshot text not null check (char_length(btrim(label_snapshot)) > 0),
  evidence text check (evidence is null or char_length(evidence) > 0),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (attempt_id, misconception_code),
  foreign key (attempt_id, student_user_id, concept_id)
    references public.attempts(id, student_user_id, concept_id) on delete cascade
);

create index misconception_observations_recent_idx
  on public.misconception_observations (student_user_id, concept_id, observed_at desc);

create table public.revision_items (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references auth.users(id) on delete cascade,
  concept_id text not null references public.concepts(id) on delete restrict,
  status public.spark_revision_status not null,
  due_at timestamptz not null,
  reason text not null check (char_length(btrim(reason)) > 0),
  completed_at timestamptz,
  completed_session_id uuid references public.tutor_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, student_user_id),
  check (
    (status = 'completed' and completed_at is not null and completed_session_id is not null)
    or (status <> 'completed' and completed_at is null and completed_session_id is null)
  )
);

create index revision_items_queue_idx
  on public.revision_items (student_user_id, status, due_at, id);

create table public.session_revision_items (
  session_id uuid not null,
  revision_item_id uuid not null,
  student_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (session_id, revision_item_id),
  unique (revision_item_id),
  foreign key (session_id, student_user_id)
    references public.tutor_sessions(id, student_user_id) on delete cascade,
  foreign key (revision_item_id, student_user_id)
    references public.revision_items(id, student_user_id) on delete restrict
);

create table public.learning_idempotency (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('startSession', 'submitAttempt', 'advanceSession', 'endSession')),
  request_path text not null check (request_path like '/api/v1/%'),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 200),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  state public.spark_idempotency_state not null default 'in_progress',
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  primary key (user_id, operation, request_path, idempotency_key),
  check (expires_at >= created_at + interval '24 hours'),
  check (
    (state = 'in_progress' and response_status is null and response_body is null)
    or (state = 'succeeded' and response_status between 200 and 299
      and (response_status = 204 or response_body is not null))
  )
);

create index learning_idempotency_expiry_idx on public.learning_idempotency (expires_at);
