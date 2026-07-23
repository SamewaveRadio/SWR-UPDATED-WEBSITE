/*
# Add stripe_livemode snapshot to orders and processed_webhook_events

## Purpose
Records whether each order and webhook event was processed in Stripe live
or test mode. The webhook handler rejects events whose livemode does not
match the mode recorded for the corresponding Checkout Session / order,
preventing test-mode events from affecting live orders and vice versa.

## Changes to `orders`
- stripe_livemode (boolean, nullable) — snapshot of session.livemode at
  checkout creation time

## Changes to `processed_webhook_events`
- stripe_livemode (boolean, nullable) — the event.livemode value from the
  Stripe event

## Security
- No RLS policy changes. Existing policies remain intact.
*/

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_livemode boolean;

ALTER TABLE processed_webhook_events
  ADD COLUMN IF NOT EXISTS stripe_livemode boolean;
