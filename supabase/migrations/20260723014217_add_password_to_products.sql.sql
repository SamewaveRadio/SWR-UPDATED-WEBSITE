-- Add optional password protection to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS password text DEFAULT NULL;

COMMENT ON COLUMN products.password IS 'Optional password gate for unlisted products. NULL = no password required. Stored in plaintext (gate only, not a security boundary).';
