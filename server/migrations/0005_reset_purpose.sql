-- Password reset reuses the same six-digit infrastructure, but a code may only
-- do what it was issued for: a "verify" code cannot reset a password and a
-- "reset" code cannot mark an email as verified.

alter table email_verification
  add column purpose text not null default 'verify'
  check (purpose in ('verify', 'reset'));

-- Only one open code per account per purpose.
drop index if exists email_verification_pending_idx;
create index email_verification_pending_idx
  on email_verification (user_id, purpose)
  where consumed_at is null;
