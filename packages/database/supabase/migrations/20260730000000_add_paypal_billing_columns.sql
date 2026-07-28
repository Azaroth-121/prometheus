-- Section 9 of the plan doc specced Stripe; the actual build is using
-- PayPal instead. plans needs a place to store the PayPal-side billing
-- plan id, and subscriptions.provider was hardcoded to 'stripe' only.
alter table public.plans add column provider_plan_id text;

alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions alter column provider set default 'paypal';
alter table public.subscriptions add constraint subscriptions_provider_check
  check (provider in ('stripe', 'paypal'));
