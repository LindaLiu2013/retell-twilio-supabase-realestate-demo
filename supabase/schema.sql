create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null default 'retell_ai_receptionist',
  project_name text not null,
  caller_name text not null,
  caller_phone text not null,
  budget text not null,
  matched_salesperson text,
  call_id text,
  twilio_call_sid text,
  transcript text,
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_project_name_idx on public.leads (project_name);
