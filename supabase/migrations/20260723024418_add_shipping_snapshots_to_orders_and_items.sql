/*
# Add shipping-rule snapshots to orders and order_items

## Purpose
Store the authoritative shipping calculation and per-item shipping class
on the order at checkout time so historical orders remain understandable
even if product settings change later. The Stripe webhook validates
Stripe totals against these snapshots instead of recalculating shipping.

## Changes to `orders`
- shipping_rule_applied text — which rule produced the shipping charge
  (printify_flat_rate | manual_free_class | manual_threshold_free | manual_flat_rate)
- has_printify_items boolean — snapshot of whether any Printify item was present
- all_manual_items_free boolean — snapshot: all items manual + all shipping_class='free'
- free_shipping_applied boolean — snapshot: shipping was $0 due to threshold or free class
- free_shipping_threshold_snapshot_cents integer — $12500 threshold at checkout time
- flat_shipping_rate_snapshot_cents integer — $700 flat rate at checkout time
- printify_fulfillment_cost_cents integer — actual Printify shipping cost (stored separately)

## Changes to `order_items`
- shipping_class_snapshot text — per-item shipping class at checkout time

## Constraint
- products.shipping_class CHECK constraint restricted to 'standard' and 'free'

## Security
- No RLS policy changes — existing policies already cover the new columns.
*/

-- orders: add shipping snapshot columns
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_rule_applied text,
  ADD COLUMN IF NOT EXISTS has_printify_items boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS all_manual_items_free boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_shipping_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_shipping_threshold_snapshot_cents integer NOT NULL DEFAULT 12500,
  ADD COLUMN IF NOT EXISTS flat_shipping_rate_snapshot_cents integer NOT NULL DEFAULT 700,
  ADD COLUMN IF NOT EXISTS printify_fulfillment_cost_cents integer NOT NULL DEFAULT 0;

-- order_items: add per-item shipping class snapshot
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS shipping_class_snapshot text;

-- Restrict products.shipping_class to supported values
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_shipping_class_check;
ALTER TABLE products
  ADD CONSTRAINT products_shipping_class_check
  CHECK (shipping_class IN ('standard', 'free'));

-- Migrate any existing manual products with invalid shipping_class to 'standard'
UPDATE products
  SET shipping_class = 'standard'
  WHERE source = 'manual'
    AND shipping_class IS NOT NULL
    AND shipping_class NOT IN ('standard', 'free');

-- Also handle NULL shipping_class on manual products
UPDATE products
  SET shipping_class = 'standard'
  WHERE source = 'manual'
    AND shipping_class IS NULL;

-- Now make shipping_class NOT NULL (it already has a default, but enforce)
ALTER TABLE products ALTER COLUMN shipping_class SET NOT NULL;