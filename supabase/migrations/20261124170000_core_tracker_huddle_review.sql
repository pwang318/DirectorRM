create function core_tracker_private.huddle_review()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare review_date date := (now() at time zone 'America/New_York')::date;
begin
  if auth.uid() is null or not exists (
    select 1 from public.agent_email_team_members m where lower(m.email) = lower(auth.jwt()->>'email')
  ) then raise exception 'Core Team membership required' using errcode = '42501'; end if;

  return jsonb_build_object(
    'date', review_date,
    'fundingExceptions', coalesce((select jsonb_agg(x) from (
      select loan_number as "reference", lp_owner as owner,
        case
          when funding_note = 'Milestone in Funded Units report: Completion' then 'Completion'
          when funding_note = 'Milestone in Funded Units report: Close Pkg Processed' then 'Close Pkg Processed'
          else 'Funding milestone unverified'
        end as milestone
      from public.core_loans
      where pipeline_status='funding_exception' and not funding_verified
      order by loan_number limit 100
    ) x), '[]'::jsonb),
    'slipped', coalesce((select jsonb_agg(x) from (
      select loan_number as "reference", lp_owner as owner, est_closing_date as "estimatedDate"
      from public.core_loans
      where pipeline_status='active' and est_closing_date < review_date
      order by est_closing_date, loan_number limit 100
    ) x), '[]'::jsonb),
    'accountsReady', (select count(*) from auth.users u
      join public.agent_email_team_members m on lower(m.email)=lower(u.email)
      where u.email_confirmed_at is not null)
  );
end;
$$;
revoke all on function core_tracker_private.huddle_review() from public, anon;
grant execute on function core_tracker_private.huddle_review() to authenticated;

create function public.core_tracker_huddle_review()
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select core_tracker_private.huddle_review(); $$;
revoke all on function public.core_tracker_huddle_review() from public, anon;
grant execute on function public.core_tracker_huddle_review() to authenticated;
