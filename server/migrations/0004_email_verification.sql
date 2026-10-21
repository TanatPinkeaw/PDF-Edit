-- Email verification: a six-digit code proves the member controls the mailbox
-- before the wallet can be spent. Only the code's hash is stored, and each row
-- records how many guesses the current code has already used up.

create table email_verification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user (id) on delete cascade,
  -- sha256 of `<user id>:<code>`; the code itself never reaches the database.
  code_hash text not null,
  attempts int not null default 0 check (attempts >= 0),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

-- The newest uncancelled code is the only one that can be confirmed.
create index email_verification_user_idx on email_verification (user_id, created_at desc);
-- Backs the "one open code per account" lookup and the resend cooldown.
create index email_verification_pending_idx
  on email_verification (user_id)
  where consumed_at is null;
