/*
# Create unified product schema for Printify + manual products

## Purpose
Supports a unified product data model with two product sources (printify, manual)
and four visibility levels (public, unlisted, draft, archived). Manual products
are stored in the database; Printify products continue to be fetched live from
the Printify API and are not duplicated here.

## New Tables

### products
- id (uuid, PK)
- slug (text, unique, not null) — URL-friendly identifier, editable by admin
- title (text, not null)
- description (text)
- source (text, not null) — 'printify' or 'manual'
- printify_product_id (bigint, nullable, unique) — links to Printify product when source='printify'
- base_price_cents (integer, not null, default 0) — base price in cents
- currency (text, not null, default 'USD')
- sku (text) — base SKU
- category (text)
- tags (text[], default '{}')
- shipping_class (text, default 'standard')
- visibility (text, not null, default 'draft') — 'public', 'unlisted', 'draft', 'archived'
- track_inventory (boolean, not null, default false)
- allow_backorders (boolean, not null, default false)
- is_published (boolean, not null, default false) — true only when visibility='public'
- created_by (uuid, references auth.users) — admin who created the product
- updated_by (uuid, references auth.users) — admin who last updated
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

### product_variants
- id (uuid, PK)
- product_id (uuid, FK to products, ON DELETE CASCADE)
- printify_variant_id (bigint, nullable) — links to Printify variant when source='printify'
- sku (text) — variant-specific SKU
- title (text, not null) — variant display name
- options (jsonb, default '{}') — e.g. {"color":"Black","size":"M"}
- price_cents (integer, not null, default 0) — variant-specific price override
- position (integer, default 0) — sort order
- is_enabled (boolean, not null, default true)
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

### product_images
- id (uuid, PK)
- product_id (uuid, FK to products, ON DELETE CASCADE)
- src (text, not null) — image URL
- alt (text)
- position (integer, default 0) — sort order, position 0 = primary image
- created_at (timestamptz, default now())

### inventory_transactions
- id (uuid, PK)
- product_id (uuid, FK to products, ON DELETE CASCADE)
- variant_id (uuid, FK to product_variants, ON DELETE CASCADE)
- quantity (integer, not null) — positive for stock-in, negative for stock-out
- reason (text) — e.g. 'initial', 'restock', 'order', 'adjustment', 'return'
- reference (text) — optional order ID or note
- created_by (uuid, references auth.users)
- created_at (timestamptz, default now())

## Security
- RLS enabled on all four tables.
- products: authenticated users can SELECT all; only authenticated can INSERT/UPDATE/DELETE.
  Public (anon) users can SELECT only rows where visibility='public' OR visibility='unlisted'.
  Draft and archived rows are invisible to anon.
- product_variants, product_images: anon can SELECT rows that belong to public/unlisted products.
  Authenticated users can SELECT/INSERT/UPDATE/DELETE all.
- inventory_transactions: authenticated-only full CRUD. Anon cannot see inventory data.

## Indexes
- products.slug (unique)
- products.printify_product_id (unique, partial where not null)
- products.visibility
- products.source
- product_variants.product_id
- product_images.product_id
- inventory_transactions.product_id
- inventory_transactions.variant_id

## Notes
1. updated_at triggers auto-update on row modification for products and product_variants.
2. is_published is a denormalized flag set to true only when visibility='public'. This is
   maintained by a trigger so queries can filter cheaply without re-evaluating visibility.
3. Inventory stock level is computed as SUM(quantity) from inventory_transactions per variant.
4. Printify products are NOT stored here — they continue to be fetched live from the Printify API.
   The printify_product_id and printify_variant_id columns exist for future sync use but are
   not populated by default.
*/

-- products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  source text NOT NULL CHECK (source IN ('printify', 'manual')),
  printify_product_id bigint UNIQUE,
  base_price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  sku text,
  category text,
  tags text[] DEFAULT '{}',
  shipping_class text NOT NULL DEFAULT 'standard',
  visibility text NOT NULL DEFAULT 'draft' CHECK (visibility IN ('public', 'unlisted', 'draft', 'archived')),
  track_inventory boolean NOT NULL DEFAULT false,
  allow_backorders boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at and is_published on products
CREATE OR REPLACE FUNCTION update_product_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.is_published = (NEW.visibility = 'public');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_product_timestamp();

DROP TRIGGER IF EXISTS products_set_published ON products;
CREATE TRIGGER products_set_published
  BEFORE INSERT OR UPDATE OF visibility ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_product_timestamp();

-- product_variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  printify_variant_id bigint,
  sku text,
  title text NOT NULL,
  options jsonb NOT NULL DEFAULT '{}',
  price_cents integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION update_variant_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_variants_updated_at ON product_variants;
CREATE TRIGGER product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_variant_timestamp();

-- product_images table
CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  src text NOT NULL,
  alt text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

-- inventory_transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity integer NOT NULL,
  reason text,
  reference text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_idx ON products (slug);
CREATE UNIQUE INDEX IF NOT EXISTS products_printify_product_id_idx ON products (printify_product_id) WHERE printify_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_visibility_idx ON products (visibility);
CREATE INDEX IF NOT EXISTS products_source_idx ON products (source);
CREATE INDEX IF NOT EXISTS products_is_published_idx ON products (is_published);
CREATE INDEX IF NOT EXISTS product_variants_product_id_idx ON product_variants (product_id);
CREATE INDEX IF NOT EXISTS product_images_product_id_idx ON product_images (product_id);
CREATE INDEX IF NOT EXISTS inventory_transactions_product_id_idx ON inventory_transactions (product_id);
CREATE INDEX IF NOT EXISTS inventory_transactions_variant_id_idx ON inventory_transactions (variant_id);

-- RLS Policies for products
-- Anon can see public and unlisted products (unlisted = direct link only, but still purchasable)
DROP POLICY IF EXISTS "anon_select_visible_products" ON products;
CREATE POLICY "anon_select_visible_products"
  ON products FOR SELECT
  TO anon, authenticated
  USING (visibility IN ('public', 'unlisted'));

-- Authenticated users can see ALL products (including draft and archived)
DROP POLICY IF EXISTS "auth_select_all_products" ON products;
CREATE POLICY "auth_select_all_products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

-- Only authenticated users can insert/update/delete products
DROP POLICY IF EXISTS "auth_insert_products" ON products;
CREATE POLICY "auth_insert_products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_products" ON products;
CREATE POLICY "auth_update_products"
  ON products FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_products" ON products;
CREATE POLICY "auth_delete_products"
  ON products FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for product_variants
-- Anon can see variants for public/unlisted products only
DROP POLICY IF EXISTS "anon_select_visible_variants" ON product_variants;
CREATE POLICY "anon_select_visible_variants"
  ON product_variants FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_variants.product_id
      AND products.visibility IN ('public', 'unlisted')
    )
  );

-- Authenticated can see all variants
DROP POLICY IF EXISTS "auth_select_all_variants" ON product_variants;
CREATE POLICY "auth_select_all_variants"
  ON product_variants FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "auth_insert_variants" ON product_variants;
CREATE POLICY "auth_insert_variants"
  ON product_variants FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_variants" ON product_variants;
CREATE POLICY "auth_update_variants"
  ON product_variants FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_variants" ON product_variants;
CREATE POLICY "auth_delete_variants"
  ON product_variants FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for product_images
-- Anon can see images for public/unlisted products only
DROP POLICY IF EXISTS "anon_select_visible_images" ON product_images;
CREATE POLICY "anon_select_visible_images"
  ON product_images FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_images.product_id
      AND products.visibility IN ('public', 'unlisted')
    )
  );

-- Authenticated can see all images
DROP POLICY IF EXISTS "auth_select_all_images" ON product_images;
CREATE POLICY "auth_select_all_images"
  ON product_images FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "auth_insert_images" ON product_images;
CREATE POLICY "auth_insert_images"
  ON product_images FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_images" ON product_images;
CREATE POLICY "auth_update_images"
  ON product_images FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_images" ON product_images;
CREATE POLICY "auth_delete_images"
  ON product_images FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for inventory_transactions
-- Only authenticated users can access inventory data
DROP POLICY IF EXISTS "auth_select_inventory" ON inventory_transactions;
CREATE POLICY "auth_select_inventory"
  ON inventory_transactions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "auth_insert_inventory" ON inventory_transactions;
CREATE POLICY "auth_insert_inventory"
  ON inventory_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_inventory" ON inventory_transactions;
CREATE POLICY "auth_update_inventory"
  ON inventory_transactions FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_inventory" ON inventory_transactions;
CREATE POLICY "auth_delete_inventory"
  ON inventory_transactions FOR DELETE
  TO authenticated
  USING (true);
