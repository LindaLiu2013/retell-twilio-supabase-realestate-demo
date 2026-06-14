alter table public.leads
add column if not exists handoff_summary text;

alter table public.leads
add column if not exists qualification_reason text;
