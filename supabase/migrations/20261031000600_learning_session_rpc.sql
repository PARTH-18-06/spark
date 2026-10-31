-- Production learning-session persistence for the v1.1.0 contract.
-- Every function is SECURITY DEFINER, service_role-only, and performs its
-- ownership/version/claim checks inside the same transaction as its writes.

-- v1.1.0 permits repeated clarification requests for the same assignment;
-- only one graded evidence row is unique. The earlier open-clarification
-- index would incorrectly reject that contract branch.
drop index if exists public.attempts_one_open_clarification_per_assignment;

create or replace function app_private.rewards_json()
returns jsonb language sql immutable set search_path = pg_catalog
as $$ select '{"account":null,"grants":[]}'::jsonb $$;

create or replace function app_private.question_json(p_assignment_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public
as $$
  select case when a.format = 'multiple_choice' then jsonb_strip_nulls(jsonb_build_object(
    'id', a.id::text, 'conceptId', a.concept_id, 'format', a.format::text,
    'prompt', a.public_prompt, 'difficulty', a.difficulty::text,
    'hint', a.hint, 'expectedUnit', a.expected_unit, 'options', a.options_snapshot
  )) else jsonb_strip_nulls(jsonb_build_object(
    'id', a.id::text, 'conceptId', a.concept_id, 'format', a.format::text,
    'prompt', a.public_prompt, 'difficulty', a.difficulty::text,
    'hint', a.hint, 'expectedUnit', a.expected_unit
  )) end
  from public.session_question_assignments a where a.id = p_assignment_id;
$$;

create or replace function app_private.concept_progress_json(p_student_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'conceptId', c.id,
    'mastery', m.mastery,
    'state', coalesce(m.learning_state, 'unassessed'),
    'evidenceCount', coalesce(m.evidence_count, 0),
    'lastAssessedAt', m.last_assessed_at,
    'nextReviewAt', (select min(r.due_at) from public.revision_items r where r.student_user_id = p_student_id and r.concept_id = c.id and r.status <> 'completed'),
    'recentMisconceptions', coalesce((select jsonb_agg(jsonb_build_object(
      'misconceptionCode', o.misconception_code, 'label', o.label_snapshot,
      'evidence', o.evidence, 'observedAt', o.observed_at
    ) order by o.observed_at desc) from public.misconception_observations o
      where o.student_user_id = p_student_id and o.concept_id = c.id), '[]'::jsonb)
  ) order by c.sort_order), '[]'::jsonb)
  from public.concepts c left join public.concept_mastery m
    on m.student_user_id = p_student_id and m.concept_id = c.id;
$$;

create or replace function app_private.revision_item_json(p_item public.revision_items)
returns jsonb language sql stable security definer set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', p_item.id::text, 'conceptId', p_item.concept_id,
    'status', case when p_item.status = 'completed' then 'completed' when p_item.due_at <= now() then 'due' else 'upcoming' end,
    'dueAt', p_item.due_at, 'reason', p_item.reason,
    'completedAt', p_item.completed_at, 'completedSessionId', p_item.completed_session_id::text
  );
$$;

create or replace function app_private.attempt_feedback_json(p_attempt_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'attemptId', a.id::text, 'questionId', a.assignment_id::text,
    'clarificationOfAttemptId', a.clarification_of_attempt_id::text,
    'submittedAt', a.submitted_at, 'finalAnswerText', a.final_answer_text,
    'reasoningText', a.reasoning_text, 'selectedOptionId', a.selected_option_id,
    'status', a.status::text, 'finalAnswerCorrect', a.final_answer_correct,
    'reasoningStatus', a.reasoning_status::text, 'feedback', a.feedback,
    'misconception', case when a.misconception_code is null then null else jsonb_build_object(
      'misconceptionCode', a.misconception_code, 'label', a.misconception_label, 'evidence', a.misconception_evidence) end,
    'clarificationPrompt', a.clarification_prompt,
    'mastery', jsonb_build_object('conceptId', a.concept_id, 'before', a.mastery_before, 'after', a.mastery_after, 'evidenceCount', a.evidence_count_after),
    'nextReviewAt', a.next_review_at
  ) from public.attempts a where a.id = p_attempt_id;
$$;

create or replace function app_private.session_snapshot_json(p_session_id uuid, p_student_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', s.id::text, 'mode', s.mode::text, 'conceptId', s.concept_id,
    'status', s.status::text, 'phase', s.phase::text, 'version', s.version,
    'progress', jsonb_build_object('answeredCount', s.answered_count, 'targetQuestionCount', s.target_question_count),
    'currentQuestion', case when s.current_assignment_id is null then null else app_private.question_json(s.current_assignment_id) end,
    'lastAttempt', case when s.last_attempt_id is null then null else app_private.attempt_feedback_json(s.last_attempt_id) end,
    'summary', s.summary_snapshot, 'endedAt', s.ended_at, 'updatedAt', s.updated_at
  ) from public.tutor_sessions s where s.id = p_session_id and s.student_user_id = p_student_id;
$$;

create or replace function app_private.assert_learning_claim(p_claim_token uuid)
returns public.learning_idempotency
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare claim public.learning_idempotency;
begin
  select * into claim from public.learning_idempotency where claim_token = p_claim_token for update;
  if not found or claim.state <> 'in_progress' or claim.claim_expires_at is null or claim.claim_expires_at <= now() then
    raise exception 'REQUEST_IN_PROGRESS' using errcode = 'P0001';
  end if;
  return claim;
end;
$$;

create or replace function public.spark_get_concept_progress(p_student_id uuid)
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$ select app_private.concept_progress_json(p_student_id) $$;

create or replace function public.spark_get_session_start_context(p_student_id uuid)
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'progress', app_private.concept_progress_json(p_student_id),
    'activeSessionId', (select id::text from public.tutor_sessions where student_user_id = p_student_id and status = 'active' limit 1),
    'revisionItems', coalesce((select jsonb_agg(app_private.revision_item_json(r) order by r.due_at, r.id) from public.revision_items r where r.student_user_id = p_student_id), '[]'::jsonb),
    'previouslyAssignedBankIds', coalesce((select jsonb_agg(distinct a.question_bank_id) from public.session_question_assignments a join public.tutor_sessions s on s.id = a.session_id where s.student_user_id = p_student_id and a.question_bank_id is not null), '[]'::jsonb)
  )
$$;

create or replace function public.spark_get_session_snapshot(p_student_id uuid, p_session_id uuid)
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$ select app_private.session_snapshot_json(p_session_id, p_student_id) $$;

create or replace function public.spark_get_session_assignment(p_student_id uuid, p_session_id uuid, p_assignment_id uuid)
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', a.id::text,
    'question', app_private.question_json(a.id),
    'rubric', jsonb_build_object(
      'questionId', a.id::text, 'rubricVersion', a.rubric_version,
      'correctAnswer', r.correct_answer_snapshot, 'workedSolution', r.worked_solution_snapshot,
      'reasoningRubric', r.reasoning_rubric_snapshot, 'numericAnswer', r.numeric_answer,
      'numericTolerance', r.numeric_tolerance, 'expectedUnit', r.expected_unit,
      'supportedMisconceptionCodes', coalesce((select jsonb_agg(qm.misconception_code) from public.question_misconceptions qm where qm.question_id = a.question_bank_id), '[]'::jsonb)
    ),
    'revisionItemId', null
  )
  from public.session_question_assignments a
  join public.tutor_sessions s on s.id = a.session_id and s.student_user_id = p_student_id
  join public.session_question_rubrics r on r.assignment_id = a.id
  where a.session_id = p_session_id and a.id = p_assignment_id;
$$;

create or replace function public.spark_start_learning_session(
  p_student_id uuid, p_mode public.spark_session_mode, p_concept_id text,
  p_assignments jsonb, p_revision_item_ids jsonb, p_claim_token uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  claim public.learning_idempotency;
  session_id uuid := gen_random_uuid();
  first_assignment uuid;
  item jsonb;
  ordinal integer := 0;
begin
  claim := app_private.assert_learning_claim(p_claim_token);
  if claim.user_id is distinct from p_student_id or claim.operation <> 'startSession' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_student_id and role = 'student') or not exists (select 1 from public.student_profiles where user_id = p_student_id and onboarding_complete) then raise exception 'ONBOARDING_REQUIRED' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments) = 0 then raise exception 'No assignments' using errcode = '22023'; end if;
  if p_mode = 'revision' and (jsonb_typeof(p_revision_item_ids) <> 'array' or jsonb_array_length(p_revision_item_ids) = 0) then raise exception 'Revision selection requires items' using errcode = '22023'; end if;
  if p_mode = 'diagnostic' and p_concept_id is not null then raise exception 'Diagnostic sessions cannot specify a concept' using errcode = '22023'; end if;
  if exists (select 1 from public.tutor_sessions where student_user_id = p_student_id and status = 'active') then raise exception 'ACTIVE_SESSION_EXISTS' using errcode = 'P0001'; end if;

  -- The foundation checks require active/answering to already have an assignment.
  -- Insert a terminal placeholder, add immutable assignments, then atomically
  -- transition the row to its real active state before commit.
  insert into public.tutor_sessions(id, student_user_id, mode, concept_id, status, phase, version, target_question_count, ended_at)
    values (session_id, p_student_id, p_mode, p_concept_id, 'abandoned', 'abandoned', 1, jsonb_array_length(p_assignments), now());
  for item in select value from jsonb_array_elements(p_assignments)
  loop
    ordinal := ordinal + 1;
    if first_assignment is null then first_assignment := (item->>'id')::uuid; end if;
    insert into public.session_question_assignments(id, session_id, question_bank_id, question_content_version, rubric_version, ordinal, concept_id, format, difficulty, public_prompt, hint, expected_unit, options_snapshot)
    values ((item->>'id')::uuid, session_id, nullif(item->>'bankQuestionId',''), 1, coalesce((item->'rubric'->>'rubricVersion')::integer, 1), ordinal,
      item->'question'->>'conceptId', (item->'question'->>'format')::public.spark_question_format, (item->'question'->>'difficulty')::public.spark_difficulty,
      item->'question'->>'prompt', item->'question'->>'hint', item->'question'->>'expectedUnit', item->'question'->'options');
    insert into public.session_question_rubrics(assignment_id, correct_answer_snapshot, worked_solution_snapshot, reasoning_rubric_snapshot, numeric_answer, numeric_tolerance, expected_unit)
    values ((item->>'id')::uuid, item->'rubric'->'correctAnswer', item->'rubric'->>'workedSolution', item->'rubric'->'reasoningRubric', (item->'rubric'->>'numericAnswer')::numeric, (item->'rubric'->>'numericTolerance')::numeric, item->'rubric'->>'expectedUnit');
    if item ? 'revisionItemId' then
      if not exists (select 1 from public.revision_items r where r.id = (item->>'revisionItemId')::uuid and r.student_user_id = p_student_id and r.status <> 'completed' and r.due_at <= now()) then
        raise exception 'Revision item is not owned or due' using errcode = '22023';
      end if;
      insert into public.session_revision_items(session_id, revision_item_id, student_user_id)
      values (session_id, (item->>'revisionItemId')::uuid, p_student_id);
    end if;
  end loop;
  update public.tutor_sessions set status = 'active', phase = 'answering', current_assignment_id = first_assignment, ended_at = null, updated_at = now() where id = session_id;
  update public.learning_idempotency set state = 'succeeded', response_status = 201, response_body = app_private.session_snapshot_json(session_id, p_student_id), claim_expires_at = null, expires_at = greatest(expires_at, now() + interval '24 hours') where claim_token = p_claim_token;
  return app_private.session_snapshot_json(session_id, p_student_id);
end;
$$;

create or replace function public.spark_finalize_learning_attempt(
  p_student_id uuid, p_session_id uuid, p_expected_version integer,
  p_assignment jsonb, p_answer jsonb, p_evaluation jsonb, p_submitted_at timestamptz, p_claim_token uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  claim public.learning_idempotency;
  session_row public.tutor_sessions;
  assignment_id uuid := (p_assignment->>'id')::uuid;
  attempt_id uuid := gen_random_uuid();
  concept text := p_assignment->'question'->>'conceptId';
  eval_status public.spark_evaluation_status := (p_evaluation->>'status')::public.spark_evaluation_status;
  reasoning_status public.spark_reasoning_status := (p_evaluation->>'reasoningStatus')::public.spark_reasoning_status;
  old_mastery numeric; old_count integer; new_mastery numeric; new_count integer; credit numeric; review_at timestamptz;
  misconception_code text := nullif(p_evaluation->'misconception'->>'misconceptionCode','');
  clarification_id uuid := nullif(p_answer->>'clarificationOfAttemptId','')::uuid;
  feedback jsonb; snapshot jsonb; next_item uuid;
begin
  claim := app_private.assert_learning_claim(p_claim_token);
  if claim.user_id is distinct from p_student_id or claim.operation <> 'submitAttempt' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into session_row from public.tutor_sessions where id = p_session_id and student_user_id = p_student_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if session_row.version <> p_expected_version then raise exception 'SESSION_VERSION_CONFLICT' using errcode = 'P0001'; end if;
  if session_row.status <> 'active' or session_row.phase = 'feedback' or session_row.current_assignment_id <> assignment_id then raise exception 'INVALID_SESSION_STATE' using errcode = 'P0001'; end if;
  if session_row.phase = 'clarification' and (session_row.last_attempt_id is null or clarification_id is distinct from session_row.last_attempt_id) then raise exception 'INVALID_SESSION_STATE' using errcode = 'P0001'; end if;
  if eval_status = 'needs_clarification' and p_evaluation->>'clarificationPrompt' is null then raise exception 'Invalid clarification' using errcode = '22023'; end if;
  if eval_status = 'correct' and (p_evaluation->>'finalAnswerCorrect')::boolean is distinct from true then raise exception 'Invalid correct evaluation' using errcode = '22023'; end if;
  if eval_status = 'incorrect' and (p_evaluation->>'finalAnswerCorrect')::boolean is distinct from false then raise exception 'Invalid incorrect evaluation' using errcode = '22023'; end if;
  if misconception_code is not null and not exists (select 1 from public.misconception_catalog m where m.code = misconception_code and m.concept_id = concept and m.label = p_evaluation->'misconception'->>'label' and (p_evaluation->'misconception'->>'evidence' is null or position(p_evaluation->'misconception'->>'evidence' in p_answer->>'reasoningText') > 0)) then raise exception 'Invalid misconception' using errcode = '22023'; end if;

  if eval_status <> 'needs_clarification' then
    insert into public.concept_mastery(student_user_id, concept_id, mastery, learning_state, evidence_count)
      values (p_student_id, concept, null, 'unassessed', 0) on conflict do nothing;
  end if;
  select mastery, evidence_count into old_mastery, old_count from public.concept_mastery where student_user_id = p_student_id and concept_id = concept for update;
  old_count := coalesce(old_count, 0);
  new_count := old_count; new_mastery := old_mastery; review_at := null;
  if eval_status <> 'needs_clarification' then
    credit := case when eval_status = 'correct' and reasoning_status = 'sound' then 1 when eval_status = 'correct' and reasoning_status = 'misconception' then .65 when eval_status = 'correct' and reasoning_status = 'unclear' then .75 when eval_status = 'correct' then .7 when eval_status = 'partial' and reasoning_status = 'sound' then .55 when eval_status = 'partial' and reasoning_status = 'misconception' then .35 when eval_status = 'partial' then .4 when reasoning_status = 'sound' then .1 else .05 end;
    new_mastery := least(1, greatest(0, coalesce(old_mastery, 0) * .7 + credit * .3));
    new_count := old_count + 1;
    review_at := case when eval_status = 'incorrect' then p_submitted_at + interval '1 hour' when eval_status = 'partial' then p_submitted_at + interval '12 hours' when new_count = 1 then p_submitted_at + interval '1 day' when new_count = 2 then p_submitted_at + interval '3 days' when new_count = 3 then p_submitted_at + interval '7 days' else p_submitted_at + interval '14 days' end;
  end if;
  insert into public.attempts(id, session_id, assignment_id, student_user_id, concept_id, clarification_of_attempt_id, submitted_at, final_answer_text, reasoning_text, selected_option_id, status, final_answer_correct, reasoning_status, feedback, misconception_code, misconception_label, misconception_evidence, clarification_prompt, mastery_before, mastery_after, evidence_count_before, evidence_count_after, next_review_at)
  values (attempt_id, p_session_id, assignment_id, p_student_id, concept, clarification_id, p_submitted_at, p_answer->>'finalAnswerText', p_answer->>'reasoningText', nullif(p_answer->>'selectedOptionId',''), eval_status, (p_evaluation->>'finalAnswerCorrect')::boolean, reasoning_status, p_evaluation->>'feedback', misconception_code, nullif(p_evaluation->'misconception'->>'label',''), nullif(p_evaluation->'misconception'->>'evidence',''), nullif(p_evaluation->>'clarificationPrompt',''), old_mastery, new_mastery, old_count, new_count, review_at);
  if eval_status <> 'needs_clarification' then
    update public.concept_mastery set mastery = new_mastery, learning_state = case when new_mastery < .4 then 'needs_practice' when new_mastery < .75 or new_count < 3 then 'developing' else 'strong' end, evidence_count = new_count, last_assessed_at = p_submitted_at, next_review_at = review_at where student_user_id = p_student_id and concept_id = concept;
    if misconception_code is not null then insert into public.misconception_observations(attempt_id, student_user_id, concept_id, misconception_code, label_snapshot, evidence, observed_at) values (attempt_id, p_student_id, concept, misconception_code, p_evaluation->'misconception'->>'label', nullif(p_evaluation->'misconception'->>'evidence',''), p_submitted_at); end if;
    insert into public.revision_items(student_user_id, concept_id, status, due_at, reason, source_attempt_id) values (p_student_id, concept, 'upcoming', review_at, case when eval_status = 'incorrect' then 'Review the missed concept' else 'Spaced practice' end, attempt_id) on conflict do nothing;
  end if;
  update public.tutor_sessions set phase = (case when eval_status = 'needs_clarification' then 'clarification' else 'feedback' end)::public.spark_session_phase, version = version + 1, answered_count = answered_count + case when eval_status = 'needs_clarification' then 0 else 1 end, last_attempt_id = attempt_id, updated_at = now() where id = p_session_id;
  feedback := app_private.attempt_feedback_json(attempt_id); snapshot := app_private.session_snapshot_json(p_session_id, p_student_id);
  update public.learning_idempotency set state = 'succeeded', response_status = 200, response_body = feedback || jsonb_build_object('session', snapshot, 'rewards', app_private.rewards_json()), claim_expires_at = null, expires_at = greatest(expires_at, now() + interval '24 hours') where claim_token = p_claim_token;
  return feedback || jsonb_build_object('session', snapshot, 'rewards', app_private.rewards_json());
end;
$$;

create or replace function public.spark_advance_learning_session(p_student_id uuid, p_session_id uuid, p_expected_version integer, p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare claim public.learning_idempotency; s public.tutor_sessions; next_id uuid; now_at timestamptz := now(); summary jsonb; snapshot jsonb;
begin
  claim := app_private.assert_learning_claim(p_claim_token);
  if claim.user_id is distinct from p_student_id or claim.operation <> 'advanceSession' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into s from public.tutor_sessions where id = p_session_id and student_user_id = p_student_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if s.version <> p_expected_version then raise exception 'SESSION_VERSION_CONFLICT' using errcode = 'P0001'; end if;
  if s.status <> 'active' or s.phase <> 'feedback' then raise exception 'INVALID_SESSION_STATE' using errcode = 'P0001'; end if;
  select a.id into next_id from public.session_question_assignments a where a.session_id = p_session_id and a.ordinal = (select ordinal + 1 from public.session_question_assignments where id = s.current_assignment_id) limit 1;
  if next_id is not null then update public.tutor_sessions set current_assignment_id = next_id, last_attempt_id = null, phase = 'answering', version = version + 1, updated_at = now_at where id = p_session_id;
  else
    update public.revision_items r set status = 'completed', completed_at = now_at, completed_session_id = s.id, updated_at = now_at where r.id in (select revision_item_id from public.session_revision_items where session_id = s.id) and r.status <> 'completed';
    select jsonb_build_object('sessionId', s.id::text, 'mode', s.mode::text, 'completedAt', now_at, 'answeredCount', s.answered_count, 'correctCount', (select count(*) from public.attempts where session_id = s.id and status = 'correct'), 'partialCount', (select count(*) from public.attempts where session_id = s.id and status = 'partial'), 'incorrectCount', (select count(*) from public.attempts where session_id = s.id and status = 'incorrect'), 'conceptProgress', app_private.concept_progress_json(p_student_id), 'recommendedConceptIds', '[]'::jsonb, 'feedback', 'Keep practising the concepts that need the most evidence.', 'rewards', app_private.rewards_json()) into summary;
    update public.tutor_sessions set status = 'completed', phase = 'completed', current_assignment_id = null, summary_snapshot = summary, ended_at = now_at, version = version + 1, updated_at = now_at where id = p_session_id;
  end if;
  snapshot := app_private.session_snapshot_json(p_session_id, p_student_id);
  update public.learning_idempotency set state = 'succeeded', response_status = 200, response_body = snapshot, claim_expires_at = null, expires_at = greatest(expires_at, now() + interval '24 hours') where claim_token = p_claim_token;
  return snapshot;
end;
$$;

create or replace function public.spark_end_learning_session(p_student_id uuid, p_session_id uuid, p_expected_version integer, p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare claim public.learning_idempotency; s public.tutor_sessions; snapshot jsonb; now_at timestamptz := now();
begin
  claim := app_private.assert_learning_claim(p_claim_token);
  if claim.user_id is distinct from p_student_id or claim.operation <> 'endSession' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into s from public.tutor_sessions where id = p_session_id and student_user_id = p_student_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if s.version <> p_expected_version then raise exception 'SESSION_VERSION_CONFLICT' using errcode = 'P0001'; end if;
  if s.status <> 'active' then raise exception 'INVALID_SESSION_STATE' using errcode = 'P0001'; end if;
  update public.tutor_sessions set status = 'abandoned', phase = 'abandoned', current_assignment_id = null, ended_at = now_at, version = version + 1, updated_at = now_at where id = p_session_id;
  snapshot := app_private.session_snapshot_json(p_session_id, p_student_id);
  update public.learning_idempotency set state = 'succeeded', response_status = 200, response_body = snapshot, claim_expires_at = null, expires_at = greatest(expires_at, now() + interval '24 hours') where claim_token = p_claim_token;
  return snapshot;
end;
$$;

revoke all on function public.spark_get_concept_progress(uuid) from public, anon, authenticated;
revoke all on function public.spark_get_session_start_context(uuid) from public, anon, authenticated;
revoke all on function public.spark_get_session_snapshot(uuid,uuid) from public, anon, authenticated;
revoke all on function public.spark_get_session_assignment(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.spark_start_learning_session(uuid,public.spark_session_mode,text,jsonb,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.spark_finalize_learning_attempt(uuid,uuid,integer,jsonb,jsonb,jsonb,timestamptz,uuid) from public, anon, authenticated;
revoke all on function public.spark_advance_learning_session(uuid,uuid,integer,uuid) from public, anon, authenticated;
revoke all on function public.spark_end_learning_session(uuid,uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.spark_get_concept_progress(uuid) to service_role;
grant execute on function public.spark_get_session_start_context(uuid) to service_role;
grant execute on function public.spark_get_session_snapshot(uuid,uuid) to service_role;
grant execute on function public.spark_get_session_assignment(uuid,uuid,uuid) to service_role;
grant execute on function public.spark_start_learning_session(uuid,public.spark_session_mode,text,jsonb,jsonb,uuid) to service_role;
grant execute on function public.spark_finalize_learning_attempt(uuid,uuid,integer,jsonb,jsonb,jsonb,timestamptz,uuid) to service_role;
grant execute on function public.spark_advance_learning_session(uuid,uuid,integer,uuid) to service_role;
grant execute on function public.spark_end_learning_session(uuid,uuid,integer,uuid) to service_role;
revoke all on function app_private.rewards_json() from public, anon, authenticated;
revoke all on function app_private.question_json(uuid) from public, anon, authenticated;
revoke all on function app_private.concept_progress_json(uuid) from public, anon, authenticated;
revoke all on function app_private.revision_item_json(public.revision_items) from public, anon, authenticated;
revoke all on function app_private.attempt_feedback_json(uuid) from public, anon, authenticated;
revoke all on function app_private.session_snapshot_json(uuid,uuid) from public, anon, authenticated;
revoke all on function app_private.assert_learning_claim(uuid) from public, anon, authenticated;

