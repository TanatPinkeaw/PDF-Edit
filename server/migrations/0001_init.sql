-- PDF Studio: workspaces, job history, presets, share links.
-- Everything the browser cannot keep (identity, quota, history) lives here;
-- PDF bytes only arrive when the user explicitly creates a share link.

create extension if not exists pgcrypto;

create table app_user (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null unique,
  email text not null,
  email_verified boolean not null default false,
  name text,
  picture_url text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table workspace (
  id uuid primary key default gen_random_uuid(),
  -- sha256 of the token kept in the browser; the token itself is never stored.
  token_hash text not null unique,
  user_id uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now()
);

create index workspace_user_idx on workspace (user_id);

create table auth_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index auth_session_expiry_idx on auth_session (expires_at);

create table job_run (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace (id) on delete cascade,
  tool text not null,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'canceled', 'abandoned')),
  input_name text,
  input_pages int,
  input_bytes bigint,
  params jsonb not null default '{}'::jsonb,
  output_name text,
  output_bytes bigint,
  error_code text,
  error_message text,
  duration_ms int,
  client_run_id text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (workspace_id, client_run_id)
);

create index job_run_workspace_started_idx on job_run (workspace_id, started_at desc);
create index job_run_running_idx on job_run (started_at) where status = 'running';

create table preset (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace (id) on delete cascade,
  tool text not null,
  name text not null,
  params jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, tool, name)
);

create table artifact (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace (id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null,
  sha256 text not null,
  content bytea not null,
  created_at timestamptz not null default now()
);

create table share_link (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace (id) on delete cascade,
  artifact_id uuid not null references artifact (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  download_count int not null default 0,
  created_at timestamptz not null default now()
);

create index share_link_expiry_idx on share_link (expires_at);
