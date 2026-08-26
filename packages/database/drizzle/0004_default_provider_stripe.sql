-- Flips the default payment provider back to Stripe (it was always a valid
-- enum value -- see 0000_init.sql's own check constraint -- PayPal was a
-- fallback because PayPal Subscriptions needed a capability the account
-- couldn't self-enable). 'paypal' stays in the enum as a historical value
-- for rows already written; nothing writes it going forward.
alter table subscriptions alter column provider set default 'stripe';
