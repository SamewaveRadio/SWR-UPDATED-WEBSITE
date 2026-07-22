/*
# Orders and order_items tables for Stripe-hosted checkout

## Purpose
Stores pending orders created before redirecting to Stripe Checkout, and
the individual line items within each order. Inventory reservations are
recorded as inventory_transactions rows with reason='reserve' and a
reference to the order ID.

## Tables

### orders
- id (uuid, PK)
- stripe_checkout_session_id (text, unique, nullable) — set after Stripe session creation
- status (text, not null, default 'pending') — pending, paid, cancelled, fulfilled
- email (text, not null) — customer email collected from checkout form
- currency (text, not null, default 'USD')
- subtotal_cents (integer, not null) — sum of line item prices
- shipping_cents (integer, not null, default 0)
- total_cents (integer, not null) — subtotal + shipping
- shipping_name (text) — snapshot of shipping name
- shipping_address_line1 (text)
- shipping_address_line2 (text, nullable)
- shipping_city (text)
- shipping_state (text)
- shipping_postal_code (text)
- shipping_country (text)
- has_printify (boolean, default false) — whether order contains Printify items
- has_manual (boolean, default false) — whether order contains manual items
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

### order_items
- id (uuid, PK)
- order_id (uuid, FK to orders, ON DELETE CASCADE)
- product_source (text, not null) — 'printify' or 'manual'
- product_id (text, not null) — Printify product ID (as string) or Supabase product UUID
- variant_id (text, not null) — Printify variant ID (as string) or Supabase variant UUID
- product_title (text, not null) — snapshot
- variant_title (text, not null) — snapshot
- sku (text, nullable) — snapshot
- unit_price_cents (integer, not null) — snapshot of server-validated price
- quantity (integer, not null)
- created_at (timestamptz, default now())

## Security
- RLS enabled on both tables.
- anon can INSERT orders and order_items (needed for guest checkout via edge function
  using service role key — RLS policies still defined for defense in depth).
- authenticated (admin) can SELECT all orders and order_items.
- No public read access — the edge function uses the service role key which bypasses RLS.
*/

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_checkout_session_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'fulfilled')),
  email text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  subtotal_cents integer NOT NULL,
  shipping_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL,
  shipping_name text,
  shipping_address_line1 text,
  shipping_address_line2 text,
  shipping_city text,
  shipping_state text,
  shipping_postal_code text,
  shipping_country text,
  has_printify boolean NOT NULL DEFAULT false,
  has_manual boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Admin can read orders
DROP POLICY IF EXISTS "auth_select_orders" ON orders;
CREATE POLICY "auth_select_orders"
  ON orders FOR SELECT TO authenticated USING (true);

-- Admin can update orders (e.g. mark as fulfilled)
DROP POLICY IF EXISTS "auth_update_orders" ON orders;
CREATE POLICY "auth_update_orders"
  ON orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Edge function uses service role key (bypasses RLS) for inserts.
-- No anon INSERT policy — guests never write directly.

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_source text NOT NULL CHECK (product_source IN ('printify', 'manual')),
  product_id text NOT NULL,
  variant_id text NOT NULL,
  product_title text NOT NULL,
  variant_title text NOT NULL,
  sku text,
  unit_price_cents integer NOT NULL,
  quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Admin can read order items
DROP POLICY IF EXISTS "auth_select_order_items" ON order_items;
CREATE POLICY "auth_select_order_items"
  ON order_items FOR SELECT TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
CREATE INDEX IF NOT EXISTS orders_stripe_session_idx ON orders (stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);

-- Auto-update updated_at on orders
CREATE OR REPLACE FUNCTION update_order_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_order_timestamp();
