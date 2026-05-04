/*
  # Create archive_items table

  Stores R2-hosted audio archive entries for the combined R2 + Mixcloud archive page.

  ## New Table: archive_items
  - id (uuid, pk)
  - title (text) — show/episode title
  - host_name (text, nullable) — display name of the host
  - resident (text, nullable) — resident slug or name
  - description (text, nullable)
  - tracklist (text, nullable)
  - tags (text[]) — searchable tag array
  - audio_url (text, nullable) — R2 audio file URL
  - artwork_url (text, nullable)
  - mixcloud_url (text, nullable) — optional Mixcloud link
  - aired_at (timestamptz, nullable) — full timestamp of air date
  - aired_date (date, nullable) — date-only fallback
  - duration_seconds (int, nullable)
  - is_published (boolean, default false) — controls public visibility
  - processing_status (text, default 'pending') — 'pending' | 'processed' | 'failed'
  - created_at, updated_at

  ## Security
  - RLS enabled
  - Anon/public users can SELECT rows where is_published=true and processing_status='processed'
  - No insert/update/delete for anon
*/

CREATE TABLE IF NOT EXISTS archive_items (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text        NOT NULL DEFAULT '',
  host_name          text,
  resident           text,
  description        text,
  tracklist          text,
  tags               text[]      NOT NULL DEFAULT '{}',
  audio_url          text,
  artwork_url        text,
  mixcloud_url       text,
  aired_at           timestamptz,
  aired_date         date,
  duration_seconds   integer,
  is_published       boolean     NOT NULL DEFAULT false,
  processing_status  text        NOT NULL DEFAULT 'pending',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS archive_items_is_published_idx       ON archive_items (is_published);
CREATE INDEX IF NOT EXISTS archive_items_processing_status_idx  ON archive_items (processing_status);
CREATE INDEX IF NOT EXISTS archive_items_aired_at_idx           ON archive_items (aired_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS archive_items_aired_date_idx         ON archive_items (aired_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS archive_items_tags_gin_idx           ON archive_items USING gin (tags);

ALTER TABLE archive_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published processed archive items"
  ON archive_items
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true AND processing_status = 'processed');
