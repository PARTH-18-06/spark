-- Short-lived mutation claims. Groq is never called while a database lock is held.
-- A claim token fences a late worker after its lease expires; the token is checked
-- again by the finalize RPC. Successful bodies are retained for replay.
alter table public.learning_idempotency
  add column if not exists claim_token uuid,
  add column if not exists claim_expires_at timestamptz;

create unique index if not exists learning_idempotency_claim_token_idx
  on public.learning_idempotency (claim_token)
  where claim_token is not null;

create or replace function public.spark_claim_learning_mutation(
  p_user_id uuid,
  p_operation text,
  p_request_path text,
  p_idempotency_key text,
  p_payload_hash text,
  p_lease_seconds integer default 30
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  row public.learning_idempotency;
  token uuid;
begin
  if p_lease_seconds < 1 or p_lease_seconds > 300 then raise exception 'invalid lease'; end if;
  select * into row from public.learning_idempotency
    where user_id = p_user_id and operation = p_operation and request_path = p_request_path and idempotency_key = p_idempotency_key
    for update;
  if found and row.payload_hash <> p_payload_hash then
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
  end if;
  if found and row.state = 'succeeded' then
    return jsonb_build_object('kind','replay','token',row.claim_token,'status',row.response_status,'body',row.response_body);
  end if;
  if found and row.claim_expires_at is not null and row.claim_expires_at > now() then
    return jsonb_build_object('kind','in_progress','token',null);
  end if;
  token := gen_random_uuid();
  if found then
    update public.learning_idempotency set claim_token = token, claim_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now() where user_id = p_user_id and operation = p_operation and request_path = p_request_path and idempotency_key = p_idempotency_key;
  else
    insert into public.learning_idempotency(user_id,operation,request_path,idempotency_key,payload_hash,state,claim_token,claim_expires_at)
      values (p_user_id,p_operation,p_request_path,p_idempotency_key,p_payload_hash,'in_progress',token,now() + make_interval(secs => p_lease_seconds));
  end if;
  return jsonb_build_object('kind','new','token',token);
end;
$$;

create or replace function public.spark_complete_learning_mutation(
  p_claim_token uuid,
  p_response_status integer,
  p_response_body jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.learning_idempotency
     set state = 'succeeded', response_status = p_response_status, response_body = p_response_body,
         updated_at = now(), expires_at = greatest(expires_at, now() + interval '24 hours')
   where claim_token = p_claim_token and state = 'in_progress';
  if not found and not exists (select 1 from public.learning_idempotency where claim_token = p_claim_token and state = 'succeeded' and response_status = p_response_status and response_body is not distinct from p_response_body) then
    raise exception using errcode = 'P0001', message = 'REQUEST_IN_PROGRESS';
  end if;
end;
$$;

create or replace function public.spark_release_learning_claim(
  p_user_id uuid,
  p_operation text,
  p_request_path text,
  p_idempotency_key text,
  p_claim_token uuid
) returns void
language sql security definer set search_path = public
as $$
  update public.learning_idempotency
     set claim_expires_at = now(), updated_at = now()
   where user_id = p_user_id and operation = p_operation and request_path = p_request_path
     and idempotency_key = p_idempotency_key and claim_token = p_claim_token and state = 'in_progress';
$$;

revoke all on function public.spark_claim_learning_mutation(uuid,text,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.spark_complete_learning_mutation(uuid,integer,jsonb) from public, anon, authenticated;
revoke all on function public.spark_release_learning_claim(uuid,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.spark_claim_learning_mutation(uuid,text,text,text,text,integer) to service_role;
grant execute on function public.spark_complete_learning_mutation(uuid,integer,jsonb) to service_role;
grant execute on function public.spark_release_learning_claim(uuid,text,text,text,uuid) to service_role;

