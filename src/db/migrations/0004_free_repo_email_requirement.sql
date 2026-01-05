-- Migration: Add require_email_for_free column to repositories table

-- Add require_email_for_free column
ALTER TABLE repositories ADD COLUMN require_email_for_free boolean NOT NULL DEFAULT false;
