/*
# Webhook event tracking + fulfillment records for Stripe checkout

## Tables

### processed_webhook_events
- id (uuid, PK)
- stripe_event_id (text, unique) — the Stripe event ID, used for idempotency
- event_type (text) — e.g. 'checkout.session.completed'
- processed_at (timestamptz, default now())

### fulfillments
- id (uuid, PK)
- order_id (uuid, FK to orders, ON DELETE CASCADE)
- source (text) — 'printify' or 'manual' — which fulfillment channel
- status (text) — 'pending', 'submitted', 'completed', 'failed', 'test_pending', 'awaiting_fulfillment'
- printify_order_id (text, nullable) — Printify order ID once submitted
- line_item_ids (uuid[]) — array of order_items IDs included in this fulfillment group
- error_message (text, nullable) — if submission failed
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

### orders (altered)
- fulfillment_status (text, nullable) — 'pending', 'fulfillment_test_pending', 'awaiting_fulfillment', 'fulfilled', 'failed'
- paid_at (timestamptz, nullable) — when payment was confirmed

## Security
- RLS enabled on both new tables.
- Only authenticated (admin) users can read — the edge function uses the service role key.
- No public access.
*/

-- processed_webhook_events table
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_webhook_events" ON processed_webhook_events;
CREATE POLICY "auth_select_webhook_events"
  ON processed_webhook_events FOR SELECT TO authenticated USING (true);

-- fulfillments table
CREATE TABLE IF NOT EXISTS fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('printify', 'manual')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'completed', 'failed', 'test_pending', 'awaiting_fulfillment')),
  printify_order_id text,
  line_item_ids uuid[] NOT NULL DEFAULT '{}',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fulfillments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_fulfillments" ON fulfillments;
CREATE POLICY "auth_select_fulfillments"
  ON fulfillments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_update_fulfillments" ON fulfillments;
CREATE POLICY "auth_update_fulfillments"
  ON fulfillments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS fulfillments_order_id_idx ON fulfillments (order_id);
CREATE INDEX IF NOT EXISTS fulfillments_status_idx ON fulfillments (status);

-- Auto-update updated_at on fulfillments
CREATE OR REPLACE FUNCTION update_fulfillment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fulfillments_updated_at ON fulfillments;
CREATE TRIGGER fulfillments_updated_at
  BEFORE UPDATE ON fulfillments
  FOR EACH ROW
  EXECUTE FUNCTION update_fulfillment_timestamp();

-- Add fulfillment_status and paid_at columns to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
