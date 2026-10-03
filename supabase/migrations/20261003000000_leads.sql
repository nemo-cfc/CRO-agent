-- Lead backup table. Written only by the web app's server with the
-- service_role / secret key, which bypasses row-level security. RLS is on
-- with no policies, so the public (anon) key can neither read nor write it.
create table if not exists public.leads (
  id uuid primary key,
  created_at timestamptz not null default now(),
  source text not null check (source in ('landing', 'report_unlock')),
  report_id uuid,
  store_url text not null,
  name text not null,
  email text not null,
  phone text,
  strategy_session boolean,
  intent text,
  gmv text,
  budget text,
  urgency text,
  route text,
  privacy_notice_version text,
  zoho_lead_id text,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

alter table public.leads enable row level security;

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_idx on public.leads (lower(email));
