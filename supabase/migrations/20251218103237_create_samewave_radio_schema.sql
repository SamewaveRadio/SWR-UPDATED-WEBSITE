/*
  # Samewave Radio Database Schema

  ## Overview
  Creates the core database structure for Samewave Radio website featuring:
  - Resident DJ/host profiles
  - Radio show information
  - Broadcast schedule management
  - Episode archive tracking

  ## New Tables

  ### `residents`
  Core table for radio hosts and DJs
  - `id` (uuid, primary key) - Unique identifier
  - `slug` (text, unique) - URL-friendly identifier for resident profiles
  - `name` (text) - Full name of the resident
  - `bio` (text) - Biography and background information
  - `image_url` (text) - Profile image URL (optional)
  - `instagram_handle` (text) - Instagram username without @ (optional)
  - `mixcloud_url` (text) - Link to Mixcloud archive (optional)
  - `active` (boolean) - Whether resident is currently active
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `shows`
  Radio show/program information
  - `id` (uuid, primary key) - Unique identifier
  - `resident_id` (uuid, foreign key) - Links to residents table
  - `title` (text) - Show name/title
  - `description` (text) - Show description and details
  - `schedule_text` (text) - Human-readable schedule (e.g., "Last Sundays @ 7PM")
  - `active` (boolean) - Whether show is currently active
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `schedule`
  Broadcast schedule entries
  - `id` (uuid, primary key) - Unique identifier
  - `show_id` (uuid, foreign key) - Links to shows table
  - `start_time` (timestamptz) - Broadcast start time
  - `end_time` (timestamptz) - Broadcast end time
  - `is_live` (boolean) - Whether currently broadcasting (default: false)
  - `notes` (text) - Additional notes about this broadcast (optional)
  - `created_at` (timestamptz) - Record creation timestamp

  ### `episodes`
  Archive of past broadcasts
  - `id` (uuid, primary key) - Unique identifier
  - `show_id` (uuid, foreign key) - Links to shows table
  - `title` (text) - Episode title
  - `broadcast_date` (timestamptz) - When episode aired
  - `mixcloud_url` (text) - Link to Mixcloud recording (optional)
  - `duration_minutes` (integer) - Episode length in minutes (optional)
  - `created_at` (timestamptz) - Record creation timestamp

  ## Security
  - Enable RLS on all tables
  - Public read access for all tables (public radio content)
  - Authenticated-only write access (admin/staff management)

  ## Indexes
  - Index on residents.slug for fast profile lookups
  - Index on schedule.start_time for efficient schedule queries
  - Index on schedule.is_live for live show queries
*/

-- Create residents table
CREATE TABLE IF NOT EXISTS residents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  bio text DEFAULT '',
  image_url text,
  instagram_handle text,
  mixcloud_url text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create shows table
CREATE TABLE IF NOT EXISTS shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid REFERENCES residents(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  schedule_text text DEFAULT '',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create schedule table
CREATE TABLE IF NOT EXISTS schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid REFERENCES shows(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  is_live boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Create episodes table
CREATE TABLE IF NOT EXISTS episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid REFERENCES shows(id) ON DELETE CASCADE,
  title text NOT NULL,
  broadcast_date timestamptz NOT NULL,
  mixcloud_url text,
  duration_minutes integer,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_residents_slug ON residents(slug);
CREATE INDEX IF NOT EXISTS idx_schedule_start_time ON schedule(start_time);
CREATE INDEX IF NOT EXISTS idx_schedule_is_live ON schedule(is_live);
CREATE INDEX IF NOT EXISTS idx_episodes_broadcast_date ON episodes(broadcast_date DESC);

-- Enable Row Level Security
ALTER TABLE residents ENABLE ROW LEVEL SECURITY;
ALTER TABLE shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Public read access, authenticated write access

-- Residents policies
CREATE POLICY "Public can view active residents"
  ON residents FOR SELECT
  TO anon
  USING (active = true);

CREATE POLICY "Authenticated users can view all residents"
  ON residents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage residents"
  ON residents FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Shows policies
CREATE POLICY "Public can view active shows"
  ON shows FOR SELECT
  TO anon
  USING (active = true);

CREATE POLICY "Authenticated users can view all shows"
  ON shows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage shows"
  ON shows FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Schedule policies
CREATE POLICY "Public can view schedule"
  ON schedule FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can manage schedule"
  ON schedule FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Episodes policies
CREATE POLICY "Public can view episodes"
  ON episodes FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can manage episodes"
  ON episodes FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);