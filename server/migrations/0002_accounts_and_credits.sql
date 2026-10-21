-- Email/password members and the credit wallet that replaces the anonymous
-- 24h quota. Only hashes are stored for passwords, sessions and redeem codes.

alter table app_user alter column google_sub drop not null;
alter table app_user add column password_hash text;

-- One account per email address, case-insensitive. Google accounts created
-- before this migration share the same namespace, which is what makes
-- "sign up with the email I already used for Google" a conflict instead of a
-- silent duplicate account.
create unique index app_user_email_lower_key on app_user (lower(email));

create table credit_wallet (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one owner: a member (survives browsers) or an anonymous workspace.
  user_id uuid references app_user (id) on delete cascade,
  workspace_id uuid references workspace (id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_wallet_one_owner check (num_nonnulls(user_id, workspace_id) = 1)
);

create unique index credit_wallet_user_key on credit_wallet (user_id) where user_id is not null;
create unique index credit_wallet_workspace_key on credit_wallet (workspace_id) where workspace_id is not null;

-- The wallet a run paid from, so a refund goes back where it came from even
-- after the browser signs in and starts using a member wallet.
alter table job_run add column credit_wallet_id uuid references credit_wallet (id) on delete set null;

create table credit_entry (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references credit_wallet (id) on delete cascade,
  delta int not null,
  reason text not null check (
    reason in ('anon_grant', 'signup_bonus', 'run', 'refund', 'redeem', 'admin', 'merge')
  ),
  job_run_id uuid references job_run (id) on delete set null,
  note text,
  balance_after int not null,
  created_at timestamptz not null default now()
);

create index credit_entry_wallet_idx on credit_entry (wallet_id, created_at desc);

-- A run is charged at most once and refunded at most once, even when two
-- requests race or the client retries a PATCH.
create unique index credit_entry_charge_once on credit_entry (job_run_id) where reason = 'run';
create unique index credit_entry_refund_once on credit_entry (job_run_id) where reason = 'refund';

create table redeem_code (
  id uuid primary key default gen_random_uuid(),
  -- sha256 of the normalised code; the printed code itself is never stored.
  code_hash text not null unique,
  credits int not null check (credits > 0),
  max_uses int not null default 1 check (max_uses > 0),
  used_count int not null default 0 check (used_count >= 0 and used_count <= max_uses),
  note text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table redeem_use (
  code_id uuid not null references redeem_code (id) on delete cascade,
  wallet_id uuid not null references credit_wallet (id) on delete cascade,
  credits int not null,
  used_at timestamptz not null default now(),
  primary key (code_id, wallet_id)
);

create index redeem_use_wallet_idx on redeem_use (wallet_id, used_at desc);
