/*
# Create product_colorways table and add colorway support

## Purpose
Introduces a normalized colorway system so product images and variants can be
assigned to specific colorways (e.g. "Black", "Camo"). Previously color was
stored only as free-text inside product_variants.options->>'color' with no
stable ID, making it impossible to reliably associate images with colors.

## New Tables
- `product_colorways`
  - `id` uuid PK
  - `product_id` uuid FK → products(id) ON DELETE CASCADE
  - `name` text NOT NULL (display name, e.g. "Black")
  - `slug` text NOT NULL (URL-safe identifier, unique per product)
  - `hex_color` text (optional, e.g. "#000000")
  - `sort_order` int NOT NULL DEFAULT 0
  - `is_active` boolean NOT NULL DEFAULT true
  - `created_at` timestamptz DEFAULT now()
  - `updated_at` timestamptz DEFAULT now()
  - Unique constraint on (product_id, slug)

## Columns Added
- `product_variants.colorway_id` uuid nullable FK → product_colorways(id) ON DELETE SET NULL
- `product_images.colorway_id` uuid nullable FK → product_colorways(id) ON DELETE SET NULL
  - NULL means "All colorways" (general image)
- `product_images.is_primary` boolean NOT NULL DEFAULT false
  - Marks the primary image for a colorway (or general primary if colorway_id is NULL)
- `order_items.colorway_id` text nullable (snapshot of colorway UUID at order time)
- `order_items.colorway_name` text nullable (snapshot of colorway display name)
- `order_items.colorway_image_url` text nullable (snapshot of thumbnail URL)

## Data Migration
1. For each product with color variants, create a product_colorways row per
   distinct options->>'color' value.
2. Link each variant's colorway_id to the matching colorway.
3. Existing product_images get colorway_id = NULL (All colorways) and
   is_primary = false — no change to their R2 keys or URLs.
4. The first image per product (position 0) is marked as general primary
   (is_primary = true, colorway_id = NULL) so storefronts without colorways
   keep showing a primary image.

## Security
- RLS enabled on product_colorways.
- Public SELECT: anon+authenticated can read colorways for products with
  visibility = public or unlisted (mirrors existing product_images policy).
- Authenticated SELECT: full access (for admin).
- Authenticated INSERT/UPDATE/DELETE: full access (admin only, matches
  existing product_variants pattern).

## Important Notes
1. Existing products without color variants are unaffected — no colorways
   are created for them and their variants' colorway_id stays NULL.
2. No existing data is deleted or modified destructively.
3. The migration is idempotent — safe to re-run.
*/

-- 1. Create product_colorways table
CREATE TABLE IF NOT EXISTS product_colorways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  hex_color text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_product_colorways_product_id ON product_colorways(product_id);
CREATE INDEX IF NOT EXISTS idx_product_colorways_sort ON product_colorways(product_id, sort_order);

-- 2. Add colorway_id to product_variants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'colorway_id'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN colorway_id uuid REFERENCES product_colorways(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Add colorway_id and is_primary to product_images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_images' AND column_name = 'colorway_id'
  ) THEN
    ALTER TABLE product_images ADD COLUMN colorway_id uuid REFERENCES product_colorways(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_images' AND column_name = 'is_primary'
  ) THEN
    ALTER TABLE product_images ADD COLUMN is_primary boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_images_colorway ON product_images(product_id, colorway_id);

-- 4. Add colorway snapshot columns to order_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'colorway_id'
  ) THEN
    ALTER TABLE order_items ADD COLUMN colorway_id text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'colorway_name'
  ) THEN
    ALTER TABLE order_items ADD COLUMN colorway_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'colorway_image_url'
  ) THEN
    ALTER TABLE order_items ADD COLUMN colorway_image_url text;
  END IF;
END $$;

-- 5. Enable RLS on product_colorways
ALTER TABLE product_colorways ENABLE ROW LEVEL SECURITY;

-- Public SELECT: colorways for visible products only
DROP POLICY IF EXISTS "anon_select_visible_colorways" ON product_colorways;
CREATE POLICY "anon_select_visible_colorways" ON product_colorways FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_colorways.product_id
      AND products.visibility = ANY (ARRAY['public', 'unlisted'])
    )
  );

-- Authenticated SELECT: all colorways (admin)
DROP POLICY IF EXISTS "auth_select_all_colorways" ON product_colorways;
CREATE POLICY "auth_select_all_colorways" ON product_colorways FOR SELECT
  TO authenticated USING (true);

-- Authenticated INSERT (admin)
DROP POLICY IF EXISTS "auth_insert_colorways" ON product_colorways;
CREATE POLICY "auth_insert_colorways" ON product_colorways FOR INSERT
  TO authenticated WITH CHECK (true);

-- Authenticated UPDATE (admin)
DROP POLICY IF EXISTS "auth_update_colorways" ON product_colorways;
CREATE POLICY "auth_update_colorways" ON product_colorways FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Authenticated DELETE (admin)
DROP POLICY IF EXISTS "auth_delete_colorways" ON product_colorways;
CREATE POLICY "auth_delete_colorways" ON product_colorways FOR DELETE
  TO authenticated USING (true);

-- 6. Migrate existing color variants → colorways
-- Only create colorways for products that have variants with a non-empty color option
INSERT INTO product_colorways (product_id, name, slug, sort_order, is_active)
SELECT DISTINCT ON (pv.product_id, pv.options->>'color')
  pv.product_id,
  TRIM(pv.options->>'color') AS name,
  lower(regexp_replace(TRIM(pv.options->>'color'), '[^a-z0-9]+', '-', 'g')) AS slug,
  0 AS sort_order,
  true AS is_active
FROM product_variants pv
WHERE pv.options->>'color' IS NOT NULL
  AND TRIM(pv.options->>'color') <> ''
  AND pv.colorway_id IS NULL
ON CONFLICT (product_id, slug) DO NOTHING;

-- 7. Link variants to their colorways
UPDATE product_variants pv
SET colorway_id = pc.id
FROM product_colorways pc
WHERE pv.product_id = pc.product_id
  AND TRIM(pv.options->>'color') = pc.name
  AND pv.colorway_id IS NULL;

-- 8. Mark the first image per product as general primary (only if no primary exists yet)
-- This ensures products without colorways still have a primary image.
UPDATE product_images pi
SET is_primary = true
WHERE pi.id IN (
  SELECT DISTINCT ON (pi2.product_id) pi2.id
  FROM product_images pi2
  WHERE pi2.colorway_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM product_images pi3
      WHERE pi3.product_id = pi2.product_id
        AND pi3.is_primary = true
        AND pi3.colorway_id IS NULL
    )
  ORDER BY pi2.product_id, pi2.position ASC
);

-- 9. Add updated_at trigger for product_colorways
CREATE OR REPLACE FUNCTION update_product_colorways_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_colorways_updated_at ON product_colorways;
CREATE TRIGGER trg_product_colorways_updated_at
  BEFORE UPDATE ON product_colorways
  FOR EACH ROW
  EXECUTE FUNCTION update_product_colorways_updated_at();
