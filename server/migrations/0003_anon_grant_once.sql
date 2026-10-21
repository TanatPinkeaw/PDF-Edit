-- The anonymous allowance is granted once per browser workspace, forever.
-- Without this flag a member could sign out, get a fresh 3-credit wallet for
-- the same workspace, sign in again and repeat — farming credits.
alter table workspace add column anon_granted_at timestamptz;

-- Workspaces that already have a wallet have had their allowance: mark them so
-- a later merge cannot hand out a second one.
update workspace w
   set anon_granted_at = now()
 where w.user_id is not null
    or exists (select 1 from credit_wallet cw where cw.workspace_id = w.id);
