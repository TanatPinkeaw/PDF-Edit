-- History is kept for HISTORY_TTL_DAYS (30 by default) and older runs are
-- pruned by age across every workspace, which needs an index on started_at.
-- Output files never reach this table: they stay in the browser.

create index job_run_started_idx on job_run (started_at);
