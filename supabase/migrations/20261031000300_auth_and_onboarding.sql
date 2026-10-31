-- Backend-managed Supabase Auth sessions and onboarding support.

alter table public.backend_auth_sessions
  add column provider_access_token_ciphertext text not null,
  add column provider_refresh_token_ciphertext text not null,
  add column csrf_token_ciphertext text not null,
  add column provider_expires_at timestamptz not null,
  add column last_refreshed_at timestamptz not null default now();

alter table public.backend_auth_sessions
  add constraint backend_auth_sessions_provider_expiry_check
  check (provider_expires_at > created_at - interval '5 minutes');

create table public.user_directory (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_directory (user_id, display_name)
select user_id, display_name from public.student_profiles
on conflict (user_id) do update set display_name = excluded.display_name;

create trigger user_directory_touch_updated_at
before update on public.user_directory
for each row execute function app_private.touch_updated_at();

alter table public.user_directory enable row level security;
revoke all on table public.user_directory from anon, authenticated;
grant all privileges on table public.user_directory to service_role;

create function public.save_student_profile(
  target_user_id uuid,
  new_display_name text,
  new_chapter_id text,
  new_exam_date date,
  new_time_zone text
)
returns public.student_profiles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  saved_profile public.student_profiles;
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = target_user_id and role = 'student'
  ) then
    raise exception 'Only provisioned students can save a student profile'
      using errcode = '42501';
  end if;

  if new_chapter_id <> 'class-10-physics-electricity' then
    raise exception 'Unsupported chapter' using errcode = '23514';
  end if;

  insert into public.user_directory (user_id, display_name)
  values (target_user_id, btrim(new_display_name))
  on conflict (user_id) do update set display_name = excluded.display_name;

  insert into public.student_profiles
    (user_id, display_name, chapter_id, exam_date, time_zone, onboarding_complete)
  values
    (target_user_id, btrim(new_display_name), new_chapter_id, new_exam_date,
     new_time_zone, true)
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    chapter_id = excluded.chapter_id,
    exam_date = excluded.exam_date,
    time_zone = excluded.time_zone,
    onboarding_complete = true
  returning * into saved_profile;

  return saved_profile;
end;
$$;

revoke all on function public.save_student_profile(uuid, text, text, date, text) from public, anon, authenticated;
grant execute on function public.save_student_profile(uuid, text, text, date, text) to service_role;

create table public.auth_login_rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.auth_login_rate_limits enable row level security;
revoke all on table public.auth_login_rate_limits from anon, authenticated;
grant all privileges on table public.auth_login_rate_limits to service_role;

create function public.consume_auth_login_attempt(
  login_key_hash text,
  maximum_attempts integer,
  window_seconds integer,
  block_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_row public.auth_login_rate_limits;
  now_at timestamptz := now();
begin
  if login_key_hash !~ '^[0-9a-f]{64}$'
    or maximum_attempts < 1 or window_seconds < 1 or block_seconds < 1 then
    raise exception 'Invalid login rate-limit arguments' using errcode = '22023';
  end if;

  insert into public.auth_login_rate_limits
    (key_hash, window_started_at, attempt_count, updated_at)
  values (login_key_hash, now_at, 0, now_at)
  on conflict (key_hash) do nothing;

  select * into current_row
  from public.auth_login_rate_limits
  where key_hash = login_key_hash
  for update;

  if current_row.blocked_until is not null and current_row.blocked_until > now_at then
    return query select false,
      greatest(1, ceil(extract(epoch from current_row.blocked_until - now_at))::integer);
    return;
  end if;

  if current_row.window_started_at <= now_at - make_interval(secs => window_seconds) then
    update public.auth_login_rate_limits
    set window_started_at = now_at,
        attempt_count = 1,
        blocked_until = null,
        updated_at = now_at
    where key_hash = login_key_hash;
    return query select true, 0;
    return;
  end if;

  if current_row.attempt_count >= maximum_attempts then
    update public.auth_login_rate_limits
    set blocked_until = now_at + make_interval(secs => block_seconds),
        updated_at = now_at
    where key_hash = login_key_hash;
    return query select false, block_seconds;
    return;
  end if;

  update public.auth_login_rate_limits
  set attempt_count = attempt_count + 1,
      blocked_until = null,
      updated_at = now_at
  where key_hash = login_key_hash;
  return query select true, 0;
end;
$$;

create function public.clear_auth_login_attempt(login_key_hash text)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  delete from public.auth_login_rate_limits where key_hash = $1;
$$;

revoke all on function public.consume_auth_login_attempt(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.clear_auth_login_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_auth_login_attempt(text, integer, integer, integer) to service_role;
grant execute on function public.clear_auth_login_attempt(text) to service_role;
