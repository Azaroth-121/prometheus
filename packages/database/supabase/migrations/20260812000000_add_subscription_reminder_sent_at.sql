-- Tracks whether the current paid period already had its expiry-reminder
-- email sent, so the daily cron doesn't re-send on every run.
alter table public.subscriptions add column reminder_sent_at timestamptz;
