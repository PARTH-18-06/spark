-- Cross-row invariants, immutable snapshots, grants, and RLS for Spark.

create schema if not exists app_private;
revoke all on schema app_private from public;

create function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function app_private.touch_updated_at() from public;

create trigger student_profiles_touch_updated_at
before update on public.student_profiles
for each row execute function app_private.touch_updated_at();
create trigger classes_touch_updated_at
before update on public.classes
for each row execute function app_private.touch_updated_at();
create trigger concepts_touch_updated_at
before update on public.concepts
for each row execute function app_private.touch_updated_at();
create trigger misconception_catalog_touch_updated_at
before update on public.misconception_catalog
for each row execute function app_private.touch_updated_at();
create trigger question_bank_touch_updated_at
before update on public.question_bank
for each row execute function app_private.touch_updated_at();
create trigger tutor_sessions_touch_updated_at
before update on public.tutor_sessions
for each row execute function app_private.touch_updated_at();
create trigger concept_mastery_touch_updated_at
before update on public.concept_mastery
for each row execute function app_private.touch_updated_at();
create trigger revision_items_touch_updated_at
before update on public.revision_items
for each row execute function app_private.touch_updated_at();
create trigger learning_idempotency_touch_updated_at
before update on public.learning_idempotency
for each row execute function app_private.touch_updated_at();

alter table public.tutor_sessions
  add constraint tutor_sessions_phase_fields_check
  check (
    (status = 'active' and phase = 'answering'
      and current_assignment_id is not null and last_attempt_id is null)
    or (status = 'active' and phase in ('feedback', 'clarification')
      and current_assignment_id is not null and last_attempt_id is not null)
    or status in ('completed', 'abandoned')
  );

alter table public.tutor_sessions
  add constraint tutor_sessions_summary_object_check
  check (summary_snapshot is null or jsonb_typeof(summary_snapshot) = 'object');

create function app_private.enforce_roster_role()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  expected_role public.spark_app_role;
  member_id uuid;
begin
  if tg_table_name = 'class_teachers' then
    expected_role := 'teacher';
    member_id := new.teacher_user_id;
  elsif tg_table_name = 'class_students' then
    expected_role := 'student';
    member_id := new.student_user_id;
  else
    raise exception 'Unsupported roster table %', tg_table_name;
  end if;

  if not exists (
    select 1 from public.user_roles
    where user_id = member_id and role = expected_role
  ) then
    raise exception 'Roster member % does not have role %', member_id, expected_role
      using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_roster_role() from public;

create trigger class_teachers_require_teacher_role
before insert or update on public.class_teachers
for each row execute function app_private.enforce_roster_role();
create trigger class_students_require_student_role
before insert or update on public.class_students
for each row execute function app_private.enforce_roster_role();

create function app_private.validate_attempt_answer()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  assigned_format public.spark_question_format;
  assigned_options jsonb;
begin
  select format, options_snapshot
    into assigned_format, assigned_options
  from public.session_question_assignments
  where id = new.assignment_id and session_id = new.session_id;

  if not found then
    raise exception 'Assigned question does not belong to this session'
      using errcode = '23503';
  end if;

  if assigned_format = 'multiple_choice' then
    if new.final_answer_text <> '' or new.selected_option_id is null then
      raise exception 'Multiple-choice attempts require an empty final answer and selected option'
        using errcode = '23514';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(assigned_options) option
      where option ->> 'id' = new.selected_option_id
    ) then
      raise exception 'Selected option does not belong to the assigned question'
        using errcode = '23514';
    end if;
  else
    if char_length(btrim(new.final_answer_text)) = 0 or new.selected_option_id is not null then
      raise exception 'Free-response attempts require answer text and forbid selected options'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_attempt_answer() from public;

create trigger attempts_validate_answer_format
before insert on public.attempts
for each row execute function app_private.validate_attempt_answer();

create function app_private.reject_immutable_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception '% rows are immutable', tg_table_name using errcode = '55000';
end;
$$;

revoke all on function app_private.reject_immutable_change() from public;

create trigger attempts_are_immutable
before update or delete on public.attempts
for each row execute function app_private.reject_immutable_change();
create trigger assignments_are_immutable
before update or delete on public.session_question_assignments
for each row execute function app_private.reject_immutable_change();
create trigger assignment_rubrics_are_immutable
before update or delete on public.session_question_rubrics
for each row execute function app_private.reject_immutable_change();

create function app_private.current_user_has_role(required_role public.spark_app_role)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = required_role
  );
$$;

create function app_private.current_user_teaches_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.class_teachers
    where class_id = target_class_id and teacher_user_id = (select auth.uid())
  );
$$;

create function app_private.current_user_teaches_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.class_teachers teacher
    join public.class_students student using (class_id)
    where teacher.teacher_user_id = (select auth.uid())
      and student.student_user_id = target_student_id
  );
$$;

revoke all on function app_private.current_user_has_role(public.spark_app_role) from public;
revoke all on function app_private.current_user_teaches_class(uuid) from public;
revoke all on function app_private.current_user_teaches_student(uuid) from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.current_user_has_role(public.spark_app_role) to authenticated;
grant execute on function app_private.current_user_teaches_class(uuid) to authenticated;
grant execute on function app_private.current_user_teaches_student(uuid) to authenticated;

alter table public.student_profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.class_students enable row level security;
alter table public.concepts enable row level security;
alter table public.concept_prerequisites enable row level security;
alter table public.misconception_catalog enable row level security;
alter table public.question_bank enable row level security;
alter table public.question_rubrics enable row level security;
alter table public.question_misconceptions enable row level security;
alter table public.backend_auth_sessions enable row level security;
alter table public.tutor_sessions enable row level security;
alter table public.session_question_assignments enable row level security;
alter table public.session_question_rubrics enable row level security;
alter table public.attempts enable row level security;
alter table public.concept_mastery enable row level security;
alter table public.misconception_observations enable row level security;
alter table public.revision_items enable row level security;
alter table public.session_revision_items enable row level security;
alter table public.learning_idempotency enable row level security;

create policy student_profiles_read_permitted
on public.student_profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or app_private.current_user_teaches_student(user_id)
);

create policy user_roles_read_self
on public.user_roles for select to authenticated
using (user_id = (select auth.uid()));

create policy classes_read_membership
on public.classes for select to authenticated
using (
  app_private.current_user_teaches_class(id)
  or exists (
    select 1 from public.class_students
    where class_id = classes.id and student_user_id = (select auth.uid())
  )
);

create policy class_teachers_read_membership
on public.class_teachers for select to authenticated
using (
  app_private.current_user_teaches_class(class_id)
  or exists (
    select 1 from public.class_students
    where class_id = class_teachers.class_id and student_user_id = (select auth.uid())
  )
);

create policy class_students_read_self_or_teacher
on public.class_students for select to authenticated
using (
  student_user_id = (select auth.uid())
  or app_private.current_user_teaches_class(class_id)
);

create policy concepts_read_authenticated
on public.concepts for select to authenticated using (true);
create policy concept_prerequisites_read_authenticated
on public.concept_prerequisites for select to authenticated using (true);
create policy misconception_catalog_read_authenticated
on public.misconception_catalog for select to authenticated using (true);

create policy tutor_sessions_read_self_or_teacher
on public.tutor_sessions for select to authenticated
using (
  student_user_id = (select auth.uid())
  or app_private.current_user_teaches_student(student_user_id)
);

create policy assignments_read_self_or_teacher
on public.session_question_assignments for select to authenticated
using (
  exists (
    select 1 from public.tutor_sessions session
    where session.id = session_question_assignments.session_id
      and (
        session.student_user_id = (select auth.uid())
        or app_private.current_user_teaches_student(session.student_user_id)
      )
  )
);

create policy attempts_read_self_or_teacher
on public.attempts for select to authenticated
using (
  student_user_id = (select auth.uid())
  or app_private.current_user_teaches_student(student_user_id)
);

create policy mastery_read_self_or_teacher
on public.concept_mastery for select to authenticated
using (
  student_user_id = (select auth.uid())
  or app_private.current_user_teaches_student(student_user_id)
);

create policy observations_read_self_or_teacher
on public.misconception_observations for select to authenticated
using (
  student_user_id = (select auth.uid())
  or app_private.current_user_teaches_student(student_user_id)
);

create policy revision_items_read_self_or_teacher
on public.revision_items for select to authenticated
using (
  student_user_id = (select auth.uid())
  or app_private.current_user_teaches_student(student_user_id)
);

create policy session_revision_items_read_self_or_teacher
on public.session_revision_items for select to authenticated
using (
  student_user_id = (select auth.uid())
  or app_private.current_user_teaches_student(student_user_id)
);

-- Start from no browser privileges on every Spark table, then grant only safe reads.
revoke all on table
  public.student_profiles,
  public.user_roles,
  public.classes,
  public.class_teachers,
  public.class_students,
  public.concepts,
  public.concept_prerequisites,
  public.misconception_catalog,
  public.question_bank,
  public.question_rubrics,
  public.question_misconceptions,
  public.backend_auth_sessions,
  public.tutor_sessions,
  public.session_question_assignments,
  public.session_question_rubrics,
  public.attempts,
  public.concept_mastery,
  public.misconception_observations,
  public.revision_items,
  public.session_revision_items,
  public.learning_idempotency
from anon, authenticated;

grant select on table
  public.student_profiles,
  public.user_roles,
  public.classes,
  public.class_teachers,
  public.class_students,
  public.concepts,
  public.concept_prerequisites,
  public.misconception_catalog,
  public.tutor_sessions,
  public.attempts,
  public.concept_mastery,
  public.misconception_observations,
  public.revision_items,
  public.session_revision_items
to authenticated;

grant select (
  id,
  session_id,
  ordinal,
  concept_id,
  format,
  difficulty,
  public_prompt,
  hint,
  expected_unit,
  options_snapshot,
  assigned_at
) on public.session_question_assignments to authenticated;

-- The backend service role bypasses RLS in Supabase. Route code must still verify
-- ownership/teacher assignment before every privileged read or write.
grant all privileges on table
  public.student_profiles,
  public.user_roles,
  public.classes,
  public.class_teachers,
  public.class_students,
  public.concepts,
  public.concept_prerequisites,
  public.misconception_catalog,
  public.question_bank,
  public.question_rubrics,
  public.question_misconceptions,
  public.backend_auth_sessions,
  public.tutor_sessions,
  public.session_question_assignments,
  public.session_question_rubrics,
  public.attempts,
  public.concept_mastery,
  public.misconception_observations,
  public.revision_items,
  public.session_revision_items,
  public.learning_idempotency
to service_role;
