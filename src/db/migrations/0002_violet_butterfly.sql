-- Migration: Multi-tenant architecture with payment providers and GDPR compliance

-- 1. Add payment_provider enum
DO $$ BEGIN
 CREATE TYPE "public"."payment_provider" AS ENUM('stripe', 'lemon_squeezy', 'gumroad', 'paddle');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- 2. Update pricing_type enum to include 'free'
ALTER TYPE "public"."pricing_type" ADD VALUE IF NOT EXISTS 'free';
--> statement-breakpoint

-- 3. Update role enum to only include 'user'
-- First, update all existing roles to 'user'
UPDATE "users" SET "role" = 'user' WHERE "role" IN ('admin', 'creator', 'none');
--> statement-breakpoint

-- Create new role enum with only 'user'
DO $$ BEGIN
  ALTER TYPE "public"."role" RENAME TO "role_old";
  CREATE TYPE "public"."role" AS ENUM('user');
  ALTER TABLE "users" ALTER COLUMN "role" TYPE "role" USING 'user'::role;
  DROP TYPE "role_old";
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- 4. Rename github_access_token to github_personal_access_token
ALTER TABLE "users" RENAME COLUMN "github_access_token" TO "github_personal_access_token";
--> statement-breakpoint

-- 5. Drop old columns from users table
ALTER TABLE "users" DROP COLUMN IF EXISTS "stripe_account_id";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "is_admin";
--> statement-breakpoint

-- 6. Add payment provider columns to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payment_provider" "payment_provider";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_secret_key" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_publishable_key" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lemon_squeezy_api_key" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lemon_squeezy_store_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gumroad_access_token" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "paddle_vendor_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "paddle_api_key" text;
--> statement-breakpoint

-- 7. Add GDPR compliance column
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_notifications" boolean DEFAULT true NOT NULL;
--> statement-breakpoint

-- 8. Add payment provider columns to repositories table
ALTER TABLE "repositories" ADD COLUMN IF NOT EXISTS "payment_provider" "payment_provider";
--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN IF NOT EXISTS "external_product_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN IF NOT EXISTS "external_price_id" varchar(255);
--> statement-breakpoint

-- 9. Update repositories price_cents to allow 0 for free repos
ALTER TABLE "repositories" ALTER COLUMN "price_cents" SET DEFAULT 0;
