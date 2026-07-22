/*
# Add R2 object key to product_images

## Purpose
Supports Cloudflare R2 image uploads for manual products. The existing `src`
column stores the final public URL. A new `r2_key` column stores the R2 object
key (e.g. `shop/products/{productId}/{randomId}.jpg`) so images can be deleted
from R2 when removed from a product. Printify product images are unaffected —
they have no `r2_key` and are never deleted through this flow.

## Changes
### product_images (modified)
- `r2_key` (text, nullable) — R2 object key for images uploaded via the admin
  panel. NULL for Printify-sourced images and legacy manual URL-only images.

## Security
- No RLS policy changes. Existing policies remain intact.
- The `r2_key` column is only written by the admin-products edge function
  (service role) and read by admin code. It is never exposed to anon users
  through any public API.
*/

ALTER TABLE product_images
  ADD COLUMN IF NOT EXISTS r2_key text;
