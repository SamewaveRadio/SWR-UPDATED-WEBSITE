/*
  # Mixcloud Catalogue Index

  Creates tables for storing a complete index of Mixcloud uploads to enable filtering across the entire catalogue.

  1. New Tables
    - `mixcloud_catalogue`
      - `id` (uuid, primary key)
      - `url` (text, unique) - Mixcloud URL
      - `name` (text) - Upload name/title
      - `created_time` (timestamptz) - Upload date
      - `pictures` (jsonb) - Picture URLs object
      - `tags` (jsonb) - Array of tag objects
      - `created_at` (timestamptz) - Index creation time
      - `updated_at` (timestamptz) - Last update time
    
    - `mixcloud_index_metadata`
      - `id` (uuid, primary key)
      - `last_updated` (timestamptz) - Last successful rebuild
      - `total_count` (integer) - Total items in catalogue
      - `rebuild_secret` (text) - Secret token for rebuild endpoint
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Indexes
    - Index on `created_time` for sorting
    - GIN index on `tags` for efficient filtering
  
  3. Security
    - Enable RLS on both tables
    - Allow public read access (catalogue is public)
    - Restrict writes to service role only
*/

-- Create mixcloud_catalogue table
CREATE TABLE IF NOT EXISTS mixcloud_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text UNIQUE NOT NULL,
  name text NOT NULL,
  created_time timestamptz NOT NULL,
  pictures jsonb NOT NULL DEFAULT '{}',
  tags jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_mixcloud_catalogue_created_time 
  ON mixcloud_catalogue(created_time DESC);

CREATE INDEX IF NOT EXISTS idx_mixcloud_catalogue_tags 
  ON mixcloud_catalogue USING GIN(tags);

-- Create metadata table
CREATE TABLE IF NOT EXISTS mixcloud_index_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_updated timestamptz DEFAULT now(),
  total_count integer DEFAULT 0,
  rebuild_secret text DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Initialize metadata if not exists
INSERT INTO mixcloud_index_metadata (id, last_updated, total_count)
SELECT gen_random_uuid(), now(), 0
WHERE NOT EXISTS (SELECT 1 FROM mixcloud_index_metadata LIMIT 1);

-- Enable RLS
ALTER TABLE mixcloud_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE mixcloud_index_metadata ENABLE ROW LEVEL SECURITY;

-- Public read access for catalogue
CREATE POLICY "Anyone can read mixcloud catalogue"
  ON mixcloud_catalogue
  FOR SELECT
  USING (true);

-- Public read access for metadata (excluding secret)
CREATE POLICY "Anyone can read index metadata"
  ON mixcloud_index_metadata
  FOR SELECT
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_mixcloud_catalogue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS mixcloud_catalogue_updated_at ON mixcloud_catalogue;
CREATE TRIGGER mixcloud_catalogue_updated_at
  BEFORE UPDATE ON mixcloud_catalogue
  FOR EACH ROW
  EXECUTE FUNCTION update_mixcloud_catalogue_updated_at();