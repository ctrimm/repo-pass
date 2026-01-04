-- Migration: Add payment provider support and update user schema

-- Rename github_access_token to github_personal_access_token
ALTER TABLE users RENAME COLUMN github_access_token TO github_personal_access_token;

-- Update role enum to only have 'user'
ALTER TYPE role RENAME TO role_old;
CREATE TYPE role AS ENUM ('user');
ALTER TABLE users ALTER COLUMN role TYPE role USING 'user'::role;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'::role;
DROP TYPE role_old;

-- Remove is_admin column
ALTER TABLE users DROP COLUMN is_admin;

-- Remove stripe_account_id column
ALTER TABLE users DROP COLUMN stripe_account_id;

-- Create payment_provider enum
CREATE TYPE payment_provider AS ENUM ('stripe', 'lemon_squeezy', 'gumroad', 'paddle');

-- Add payment provider columns
ALTER TABLE users ADD COLUMN payment_provider payment_provider;
ALTER TABLE users ADD COLUMN stripe_secret_key text;
ALTER TABLE users ADD COLUMN stripe_publishable_key text;
ALTER TABLE users ADD COLUMN lemon_squeezy_api_key text;
ALTER TABLE users ADD COLUMN lemon_squeezy_store_id character varying(255);
ALTER TABLE users ADD COLUMN gumroad_access_token text;
ALTER TABLE users ADD COLUMN paddle_vendor_id character varying(255);
ALTER TABLE users ADD COLUMN paddle_api_key text;

-- Add email notifications column
ALTER TABLE users ADD COLUMN email_notifications boolean NOT NULL DEFAULT true;

-- Update pricing_type enum to include 'free'
ALTER TYPE pricing_type RENAME TO pricing_type_old;
CREATE TYPE pricing_type AS ENUM ('one-time', 'subscription', 'free');
ALTER TABLE repositories ALTER COLUMN pricing_type TYPE pricing_type USING pricing_type::text::pricing_type;
DROP TYPE pricing_type_old;

-- Add payment provider columns to repositories
ALTER TABLE repositories ADD COLUMN payment_provider payment_provider;
ALTER TABLE repositories ADD COLUMN external_product_id character varying(255);
ALTER TABLE repositories ADD COLUMN external_price_id character varying(255);
