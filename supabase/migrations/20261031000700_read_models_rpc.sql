-- Read models for the remaining v1.1.0 operations. These functions are
-- service_role-only because the backend-managed auth layer is the principal
-- boundary; every teacher function repeats class/roster authorization.

create or replace function app_private.session_history_json(p_session public.tutor_sessions)
returns jsonb language sql stable security definer set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', p_session.id::text, 'mode', p_session.mode::text, 'status', p_session.status::text,
    'answeredCount', p_session.answered_count, 'updatedAt', p_session.updated_at,
    'completedAt', case when p_session.status = 'completed' then p_session.summary_snapshot->>'completedAt' else null end,
    'endedAt', p_session.ended_at
  );
$$;

create or replace function app_private.attempt_history_json(p_attempt public.attempts)
returns jsonb language sql stable security definer set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'sessionId', p_attempt.session_id::text, 'conceptId', p_attempt.concept_id,
    'question', app_private.question_json(p_attempt.assignment_id),
    'feedback', app_private.attempt_feedback_json(p_attempt.id)
  );
$$;

create or replace function app_private.teacher_student_row_json(p_student_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', p_student_id::text,
    'displayName', coalesce(sp.display_name, ud.display_name, p_student_id::text),
    'concepts', app_private.concept_progress_json(p_student_id),
    'dueRevisionCount', (select count(*) from public.revision_items r where r.student_user_id = p_student_id and r.status <> 'completed' and r.due_at <= now()),
    'lastActiveAt', (select max(s.updated_at) from public.tutor_sessions s where s.student_user_id = p_student_id)
  )
  from (select p_student_id as id) x
  left join public.student_profiles sp on sp.user_id = x.id
  left join public.user_directory ud on ud.user_id = x.id;
$$;

create or replace function public.spark_get_revision_queue(p_student_id uuid)
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'generatedAt', now(),
    'items', coalesce((select jsonb_agg(app_private.revision_item_json(r) order by r.due_at, r.id)
      from public.revision_items r where r.student_user_id = p_student_id
        and (r.status <> 'completed' or r.completed_at >= now() - interval '30 days')), '[]'::jsonb)
  );
$$;

create or replace function public.spark_get_progress(p_student_id uuid, p_offset integer default 0, p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare rows jsonb; next_cursor text;
begin
  if p_offset < 0 or p_limit < 1 or p_limit > 50 then raise exception 'Invalid page arguments' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(app_private.session_history_json(s) order by s.updated_at desc, s.id desc), '[]'::jsonb)
    into rows from (select * from public.tutor_sessions where student_user_id = p_student_id order by updated_at desc, id desc offset p_offset limit p_limit + 1) s;
  if jsonb_array_length(rows) > p_limit then next_cursor := (p_offset + p_limit)::text; rows := (select jsonb_agg(value order by ord) from jsonb_array_elements(rows) with ordinality e(value, ord) where ord <= p_limit); end if;
  return jsonb_build_object('concepts', app_private.concept_progress_json(p_student_id), 'sessions', jsonb_build_object('items', rows, 'nextCursor', next_cursor), 'rewards', app_private.rewards_json());
end;
$$;

create or replace function public.spark_get_attempt_history(p_student_id uuid, p_offset integer default 0, p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare rows jsonb; next_cursor text;
begin
  if p_offset < 0 or p_limit < 1 or p_limit > 50 then raise exception 'Invalid page arguments' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(app_private.attempt_history_json(a) order by a.submitted_at desc, a.id desc), '[]'::jsonb)
    into rows from (select * from public.attempts where student_user_id = p_student_id order by submitted_at desc, id desc offset p_offset limit p_limit + 1) a;
  if jsonb_array_length(rows) > p_limit then next_cursor := (p_offset + p_limit)::text; rows := (select jsonb_agg(value order by ord) from jsonb_array_elements(rows) with ordinality e(value, ord) where ord <= p_limit); end if;
  return jsonb_build_object('items', rows, 'nextCursor', next_cursor);
end;
$$;

create or replace function public.spark_get_student_dashboard(p_student_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare profile jsonb; concepts jsonb; active jsonb; recommended text; recent jsonb;
begin
  select jsonb_build_object('displayName', display_name, 'chapterId', chapter_id, 'examDate', exam_date, 'timeZone', time_zone, 'onboardingComplete', onboarding_complete) into profile from public.student_profiles where user_id = p_student_id;
  if profile is null then raise exception 'ONBOARDING_REQUIRED' using errcode = 'P0001'; end if;
  concepts := app_private.concept_progress_json(p_student_id);
  select c.id into recommended from public.concepts c left join public.concept_mastery m on m.concept_id = c.id and m.student_user_id = p_student_id order by case when m.mastery is null then 1 else 0 end, m.mastery nulls last, m.evidence_count nulls first, c.sort_order limit 1;
  select app_private.session_history_json(s) into active from public.tutor_sessions s where s.student_user_id = p_student_id and s.status = 'active' order by s.updated_at desc limit 1;
  select coalesce(jsonb_agg(app_private.session_history_json(s) order by s.updated_at desc, s.id desc), '[]'::jsonb) into recent from (select * from public.tutor_sessions where student_user_id = p_student_id order by updated_at desc, id desc limit 5) s;
  return jsonb_build_object('profile', profile, 'activeSession', active, 'dueRevisionCount', (select count(*) from public.revision_items r where r.student_user_id = p_student_id and r.status <> 'completed' and r.due_at <= now()), 'recommendedConceptId', recommended, 'concepts', concepts, 'recentSessions', recent, 'rewards', app_private.rewards_json());
end;
$$;

create or replace function public.spark_get_teacher_classes(p_teacher_id uuid)
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id::text, 'name', c.name, 'studentCount', (select count(*) from public.class_students cs where cs.class_id = c.id)) order by c.name, c.id), '[]'::jsonb)
  from public.classes c join public.class_teachers ct on ct.class_id = c.id and ct.teacher_user_id = p_teacher_id;
$$;

create or replace function public.spark_get_class_dashboard(p_teacher_id uuid, p_class_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare class_row jsonb; students jsonb; misconceptions jsonb; priorities jsonb;
begin
  if not exists (select 1 from public.class_teachers where class_id = p_class_id and teacher_user_id = p_teacher_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select jsonb_build_object('id', c.id::text, 'name', c.name, 'studentCount', (select count(*) from public.class_students where class_id = c.id)) into class_row from public.classes c where c.id = p_class_id;
  select coalesce(jsonb_agg(app_private.teacher_student_row_json(cs.student_user_id) order by coalesce(ud.display_name, sp.display_name, cs.student_user_id::text), cs.student_user_id), '[]'::jsonb) into students from public.class_students cs left join public.user_directory ud on ud.user_id = cs.student_user_id left join public.student_profiles sp on sp.user_id = cs.student_user_id where cs.class_id = p_class_id;
  select coalesce(jsonb_agg(jsonb_build_object('conceptId', x.concept_id, 'misconceptionCode', x.misconception_code, 'label', x.label, 'affectedStudentCount', x.affected_student_count) order by x.concept_id, x.misconception_code), '[]'::jsonb) into misconceptions from (select o.concept_id, o.misconception_code, max(o.label_snapshot) as label, count(distinct o.student_user_id) as affected_student_count from public.misconception_observations o join public.class_students cs on cs.student_user_id = o.student_user_id and cs.class_id = p_class_id group by o.concept_id, o.misconception_code) x;
  select coalesce(jsonb_agg(jsonb_build_object('conceptId', x.concept_id, 'affectedStudentCount', x.affected_student_count, 'reason', 'Due revision item') order by x.concept_id), '[]'::jsonb) into priorities from (select r.concept_id, count(distinct r.student_user_id) as affected_student_count from public.revision_items r join public.class_students cs on cs.student_user_id = r.student_user_id and cs.class_id = p_class_id where r.status <> 'completed' and r.due_at <= now() group by r.concept_id) x;
  return jsonb_build_object('class', class_row, 'generatedAt', now(), 'students', students, 'commonMisconceptions', misconceptions, 'revisionPriorities', priorities);
end;
$$;

create or replace function public.spark_get_student_detail(p_teacher_id uuid, p_class_id uuid, p_student_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare student jsonb; sessions jsonb; attempts jsonb;
begin
  if not exists (select 1 from public.class_teachers where class_id = p_class_id and teacher_user_id = p_teacher_id) or not exists (select 1 from public.class_students where class_id = p_class_id and student_user_id = p_student_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  student := app_private.teacher_student_row_json(p_student_id);
  select coalesce(jsonb_agg(app_private.session_history_json(s) order by s.updated_at desc, s.id desc), '[]'::jsonb) into sessions from (select * from public.tutor_sessions where student_user_id = p_student_id order by updated_at desc, id desc limit 10) s;
  select coalesce(jsonb_agg(app_private.attempt_history_json(a) order by a.submitted_at desc, a.id desc), '[]'::jsonb) into attempts from (select * from public.attempts where student_user_id = p_student_id order by submitted_at desc, id desc limit 20) a;
  return jsonb_build_object('classId', p_class_id::text, 'student', student, 'recentSessions', sessions, 'recentAttempts', attempts);
end;
$$;

revoke all on function public.spark_get_revision_queue(uuid) from public, anon, authenticated;
revoke all on function public.spark_get_progress(uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.spark_get_attempt_history(uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.spark_get_student_dashboard(uuid) from public, anon, authenticated;
revoke all on function public.spark_get_teacher_classes(uuid) from public, anon, authenticated;
revoke all on function public.spark_get_class_dashboard(uuid,uuid) from public, anon, authenticated;
revoke all on function public.spark_get_student_detail(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.spark_get_revision_queue(uuid) to service_role;
grant execute on function public.spark_get_progress(uuid,integer,integer) to service_role;
grant execute on function public.spark_get_attempt_history(uuid,integer,integer) to service_role;
grant execute on function public.spark_get_student_dashboard(uuid) to service_role;
grant execute on function public.spark_get_teacher_classes(uuid) to service_role;
grant execute on function public.spark_get_class_dashboard(uuid,uuid) to service_role;
grant execute on function public.spark_get_student_detail(uuid,uuid,uuid) to service_role;

