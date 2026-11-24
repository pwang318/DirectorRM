alter table public.core_tracker_shared_state drop constraint core_tracker_shared_state_collection_check;
alter table public.core_tracker_shared_state add constraint core_tracker_shared_state_collection_check
check (collection in ('director-huddle','director-execution','director-forecast','director-comp-pacing','rm-weekly'));

create or replace function core_tracker_private.save_state(p_collection text, p_payload jsonb, p_revision bigint)
returns public.core_tracker_shared_state
language plpgsql security definer set search_path = ''
as $$
declare saved public.core_tracker_shared_state;
begin
  if auth.uid() is null or not exists (
    select 1 from public.agent_email_team_members m where lower(m.email) = lower(auth.jwt()->>'email')
  ) then raise exception 'Core Team membership required' using errcode = '42501'; end if;
  if p_collection not in ('director-huddle','director-execution','director-forecast','director-comp-pacing','rm-weekly')
    or p_payload is null
    or jsonb_typeof(p_payload) is distinct from (case when p_collection = 'rm-weekly' then 'array' else 'object' end)
  then raise exception 'Invalid tracker collection or payload'; end if;
  if p_revision = 0 then
    insert into public.core_tracker_shared_state(collection,payload)
      values (p_collection,p_payload) on conflict do nothing returning * into saved;
  else
    update public.core_tracker_shared_state
      set payload=p_payload, revision=revision+1, updated_at=now(), updated_by=auth.uid()
      where collection=p_collection and revision=p_revision returning * into saved;
  end if;
  if saved.collection is null then raise exception 'Shared record changed; refresh before publishing' using errcode = '40001'; end if;
  return saved;
end;
$$;
