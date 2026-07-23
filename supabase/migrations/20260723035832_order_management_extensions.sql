/*
# Order Management extensions

## Purpose
Adds the columns and tables required by the admin Order Management section
WITHOUT replacing any existing order, fulfillment, inventory, webhook, or
Stripe structures. All changes are additive and idempotent.

## Changes to `orders`
- payment_status (text, default 'pending') — dedicated payment lifecycle,
  separate from fulfillment. One of pending | paid | failed | cancelled |
  partially_refunded | refunded. Backfilled from the existing `status`.
- stripe_payment_intent_id (text, nullable) — Stripe Payment Intent ID.
- amount_refunded_cents (integer, default 0) — total refunded so far.
- tax_cents (integer, default 0) — tax collected by Stripe at checkout.
- discount_cents (integer, default 0) — discount applied at checkout.
- customer_phone (text, nullable) — phone captured by Stripe, when present.
- customer_note (text, nullable) — customer-facing note.
The existing `status` column is left intact for backward compatibility with
the Stripe webhook and checkout flow.

## Changes to `fulfillments`
- carrier (text, nullable)
- tracking_number (text, nullable)
- tracking_url (text, nullable)
- submitted_at (timestamptz, nullable) — when submitted to a provider.
- shipped_at (timestamptz, nullable)
- delivered_at (timestamptz, nullable)
- notes (text, nullable) — internal fulfillment notes.
The status CHECK constraint is widened to also allow: processing, shipped,
delivered, cancelled (existing values retained).

## New table `order_notes`
Internal, admin-only timestamped notes on an order.
- id (uuid, PK)
- order_id (uuid, FK -> orders, cascade)
- note (text)
- created_by (uuid, FK -> auth.users)
- created_by_email (text) — snapshot of the author email
- created_at / updated_at (timestamptz)

## New table `order_events`
Chronological audit timeline for an order.
- id (uuid, PK)
- order_id (uuid, FK -> orders, cascade)
- event_type (text) — e.g. 'order_created', 'payment_completed', 'order_shipped'
- event_source (text) — 'system' | 'stripe' | 'printify' | 'admin'
- message (text)
- metadata_json (jsonb) — non-secret contextual data only
- created_by (uuid, nullable) — admin who triggered it, when applicable
- created_at (timestamptz)

## Security
- RLS enabled on both new tables.
- order_notes: authenticated admins may SELECT/INSERT/UPDATE/DELETE. UPDATE and
  DELETE are restricted to the note's author (created_by = auth.uid()).
- order_events: authenticated admins may SELECT and INSERT. No UPDATE/DELETE —
  the timeline is append-only. Privileged writes happen via the service role
  in the order-admin edge function.

## Notes
1. No data is dropped, renamed, or retyped.
2. No secret values are ever stored in order_events.
*/

-- orders: additive columns
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS amount_refunded_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS customer_note text;

-- payment_status CHECK
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending','paid','failed','cancelled','partially_refunded','refunded'));

-- Backfill payment_status from legacy status once (only rows still at default 'pending')
UPDATE orders SET payment_status = 'paid'
  WHERE status IN ('paid','fulfilled') AND payment_status = 'pending';
UPDATE orders SET payment_status = 'cancelled'
  WHERE status = 'cancelled' AND payment_status = 'pending';

-- fulfillments: additive columns
ALTER TABLE fulfillments
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

-- widen fulfillments.status CHECK
ALTER TABLE fulfillments DROP CONSTRAINT IF EXISTS fulfillments_status_check;
ALTER TABLE fulfillments
  ADD CONSTRAINT fulfillments_status_check
  CHECK (status IN ('pending','submitted','completed','failed','test_pending','awaiting_fulfillment','processing','shipped','delivered','cancelled'));

-- order_notes
CREATE TABLE IF NOT EXISTS order_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_order_notes" ON order_notes;
CREATE POLICY "auth_select_order_notes" ON order_notes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_order_notes" ON order_notes;
CREATE POLICY "auth_insert_order_notes" ON order_notes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "auth_update_own_order_notes" ON order_notes;
CREATE POLICY "auth_update_own_order_notes" ON order_notes FOR UPDATE
  TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "auth_delete_own_order_notes" ON order_notes;
CREATE POLICY "auth_delete_own_order_notes" ON order_notes FOR DELETE
  TO authenticated USING (auth.uid() = created_by);

CREATE INDEX IF NOT EXISTS order_notes_order_id_idx ON order_notes (order_id);

-- order_events
CREATE TABLE IF NOT EXISTS order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_source text NOT NULL DEFAULT 'system',
  message text NOT NULL DEFAULT '',
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_order_events" ON order_events;
CREATE POLICY "auth_select_order_events" ON order_events FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_order_events" ON order_events;
CREATE POLICY "auth_insert_order_events" ON order_events FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS order_events_order_id_idx ON order_events (order_id);
CREATE INDEX IF NOT EXISTS order_events_created_at_idx ON order_events (created_at);

-- keep order_notes.updated_at fresh
CREATE OR REPLACE FUNCTION update_order_note_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_notes_updated_at ON order_notes;
CREATE TRIGGER order_notes_updated_at
  BEFORE UPDATE ON order_notes
  FOR EACH ROW EXECUTE FUNCTION update_order_note_timestamp();
