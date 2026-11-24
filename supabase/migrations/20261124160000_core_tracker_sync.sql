create schema if not exists core_tracker_private;
revoke all on schema core_tracker_private from public;
grant usage on schema core_tracker_private to authenticated;

create table public.core_tracker_shared_state (
  collection text primary key check (collection in ('director-huddle', 'director-execution', 'rm-weekly')),
  payload jsonb not null check (pg_column_size(payload) <= 1048576),
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid()
);
alter table public.core_tracker_shared_state enable row level security;
revoke all on public.core_tracker_shared_state from public, anon, authenticated;
grant select on public.core_tracker_shared_state to authenticated;
create policy "Core team reads shared tracker records" on public.core_tracker_shared_state
for select to authenticated using (
  exists (select 1 from public.agent_email_team_members m where lower(m.email) = lower((select auth.jwt()->>'email')))
);

create function core_tracker_private.save_state(p_collection text, p_payload jsonb, p_revision bigint)
returns public.core_tracker_shared_state
language plpgsql security definer set search_path = ''
as $$
declare saved public.core_tracker_shared_state;
begin
  if auth.uid() is null or not exists (
    select 1 from public.agent_email_team_members m where lower(m.email) = lower(auth.jwt()->>'email')
  ) then raise exception 'Core Team membership required' using errcode = '42501'; end if;
  if p_collection not in ('director-huddle','director-execution','rm-weekly')
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
revoke all on function core_tracker_private.save_state(text,jsonb,bigint) from public, anon;
grant execute on function core_tracker_private.save_state(text,jsonb,bigint) to authenticated;

create function public.core_tracker_save_state(p_collection text,p_payload jsonb,p_revision bigint)
returns public.core_tracker_shared_state
language sql security invoker set search_path = ''
as $$ select core_tracker_private.save_state(p_collection,p_payload,p_revision); $$;
revoke all on function public.core_tracker_save_state(text,jsonb,bigint) from public, anon;
grant execute on function public.core_tracker_save_state(text,jsonb,bigint) to authenticated;

create function core_tracker_private.source_report(p_as_of date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare report jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.agent_email_team_members m where lower(m.email) = lower(auth.jwt()->>'email')
  ) then raise exception 'Core Team membership required' using errcode = '42501'; end if;
  if p_as_of is null or p_as_of > (now() at time zone 'America/New_York')::date
     or p_as_of < (now() at time zone 'America/New_York')::date
  then raise exception 'Use today’s Eastern reporting date'; end if;
  select jsonb_build_object(
    'asOf', p_as_of,
    'pipelineImport', (select to_jsonb(i) from (
      select imported_at, status from public.core_import_runs where kind='pipeline'
      and imported_at < ((p_as_of + 1)::timestamp at time zone 'America/New_York')
      order by imported_at desc limit 1) i),
    'fundedImport', (select to_jsonb(i) from (
      select imported_at, status from public.core_import_runs where kind='funded_units'
      and imported_at < ((p_as_of + 1)::timestamp at time zone 'America/New_York')
      order by imported_at desc limit 1) i),
    'yearFunded', (select count(*) from public.core_loans where funding_verified and closed_date between date_trunc('year',p_as_of)::date and p_as_of),
    'forecast', (select jsonb_agg(x order by x.days) from (
      select horizons.days, count(l.loan_number) scheduled from (values (30),(60),(90)) horizons(days)
      left join public.core_loans l on l.pipeline_status='active' and l.last_seen_pipeline_at < ((p_as_of+1)::timestamp at time zone 'America/New_York')
        and l.est_closing_date between p_as_of and p_as_of+horizons.days
      group by horizons.days) x),
    'slipped', (select count(*) from public.core_loans where pipeline_status='active' and est_closing_date<p_as_of
      and last_seen_pipeline_at < ((p_as_of+1)::timestamp at time zone 'America/New_York')),
    'crm', (select to_jsonb(c) from (
      select max(left(date_added,10)) latest, count(distinct nullif(lead_key,'')) unique_keys,
        array_agg(distinct lead_source order by lead_source) categories
      from public.velocify_leads where date_added ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        and left(date_added,10) between date_trunc('quarter',p_as_of)::date::text and p_as_of::text
    ) c),
    'powerBiReceipt', (select max(imported_at) from public.powerbi_import_log where source_app like 'core-team-tracker%'
      and imported_at < ((p_as_of + 1)::timestamp at time zone 'America/New_York'))
  ) into report;
  return report;
end;
$$;
revoke all on function core_tracker_private.source_report(date) from public, anon;
grant execute on function core_tracker_private.source_report(date) to authenticated;

create function public.core_tracker_source_report(p_as_of date)
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select core_tracker_private.source_report(p_as_of); $$;
revoke all on function public.core_tracker_source_report(date) from public, anon;
grant execute on function public.core_tracker_source_report(date) to authenticated;
