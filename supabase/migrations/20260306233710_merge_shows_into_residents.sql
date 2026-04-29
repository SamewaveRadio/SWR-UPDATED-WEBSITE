/*
  # Merge Shows into Residents Table

  This migration consolidates the separate `shows` table into the `residents` table
  to simplify data management. Each resident will now have show information directly
  on their record.

  1. Schema Changes
    - Add `show_title` column to residents (the name of their show)
    - Add `show_description` column to residents (description of the show)
    - Add `schedule_text` column to residents (when the show airs)

  2. Data Migration
    - Copy show data from the shows table into the new residents columns
    - Each resident's first show (by creation date) is used

  3. Important Notes
    - The shows table is NOT dropped to preserve data integrity
    - Episodes table still references shows for historical data
    - New workflow: edit resident record directly for show info
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'residents' AND column_name = 'show_title'
  ) THEN
    ALTER TABLE residents ADD COLUMN show_title text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'residents' AND column_name = 'show_description'
  ) THEN
    ALTER TABLE residents ADD COLUMN show_description text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'residents' AND column_name = 'schedule_text'
  ) THEN
    ALTER TABLE residents ADD COLUMN schedule_text text DEFAULT '';
  END IF;
END $$;

UPDATE residents r
SET
  show_title = COALESCE(s.title, ''),
  show_description = COALESCE(s.description, ''),
  schedule_text = COALESCE(s.schedule_text, '')
FROM (
  SELECT DISTINCT ON (resident_id)
    resident_id,
    title,
    description,
    schedule_text
  FROM shows
  WHERE resident_id IS NOT NULL
  ORDER BY resident_id, created_at ASC
) s
WHERE r.id = s.resident_id;