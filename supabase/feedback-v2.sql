-- Future feedback v2 migration for existing installations.
-- Existing v1 rows remain readable; all new rows are validated by the Worker.

alter table public.feedback
  add column if not exists completion_status text,
  add column if not exists app_version text,
  add column if not exists device_type text;

alter table public.feedback
  drop constraint if exists feedback_feedback_type_check;

alter table public.feedback
  add constraint feedback_feedback_type_check check (feedback_type in (
    'feature_broken',
    'cannot_find',
    'unclear_next_step',
    'cumbersome',
    'other',
    -- Kept only so historical v1 rows remain valid.
    'previous_tool_better'
  ));

alter table public.feedback
  drop constraint if exists feedback_completion_status_check;
alter table public.feedback
  add constraint feedback_completion_status_check check (
    completion_status is null or completion_status in (
      'completed',
      'completed_with_effort',
      'not_completed'
    )
  );

alter table public.feedback
  drop constraint if exists feedback_app_version_check;
alter table public.feedback
  add constraint feedback_app_version_check check (
    app_version is null or char_length(app_version) between 1 and 40
  );

alter table public.feedback
  drop constraint if exists feedback_device_type_check;
alter table public.feedback
  add constraint feedback_device_type_check check (
    device_type is null or device_type in ('mobile', 'tablet', 'desktop', 'unknown')
  );

create index if not exists feedback_completion_idx
  on public.feedback (completion_status, created_at desc);

drop view if exists public.feedback_weekly_summary;
create view public.feedback_weekly_summary
with (security_invoker = true)
as
select
  feedback_type,
  page_name,
  completion_status,
  count(*)::bigint as report_count,
  count(distinct anonymous_test_id)::bigint as unique_testers
from public.feedback
where created_at >= now() - interval '7 days'
group by feedback_type, page_name, completion_status
order by report_count desc, feedback_type, page_name, completion_status;

revoke all on table public.feedback_weekly_summary from anon, authenticated;
grant select on table public.feedback_weekly_summary to service_role;
