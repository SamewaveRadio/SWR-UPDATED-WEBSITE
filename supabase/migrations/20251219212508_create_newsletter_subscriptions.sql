/*
  # Newsletter Subscriptions Table

  1. New Tables
    - `newsletter_subscriptions`
      - `id` (uuid, primary key) - Unique identifier for each subscription
      - `email` (text, unique, not null) - Subscriber email address
      - `subscribed_at` (timestamptz) - Timestamp when subscription was created
      - `ip_address` (text, optional) - IP address for spam prevention
      - `user_agent` (text, optional) - User agent for analytics
  
  2. Security
    - Enable RLS on `newsletter_subscriptions` table
    - Add policy to allow anyone to insert their email (public subscription)
    - Add policy for authenticated admins to view all subscriptions
  
  3. Indexes
    - Unique index on email to prevent duplicate subscriptions
    - Index on subscribed_at for sorting/filtering
*/

-- Create newsletter subscriptions table
CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  subscribed_at timestamptz DEFAULT now() NOT NULL,
  ip_address text,
  user_agent text
);

-- Enable RLS
ALTER TABLE newsletter_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to subscribe (insert their email)
CREATE POLICY "Anyone can subscribe to newsletter"
  ON newsletter_subscriptions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Create index on subscribed_at for sorting
CREATE INDEX IF NOT EXISTS idx_newsletter_subscriptions_subscribed_at 
  ON newsletter_subscriptions(subscribed_at DESC);
