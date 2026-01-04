CREATE TYPE "public"."access_log_action" AS ENUM('collaborator_added', 'collaborator_removed', 'email_sent_confirmation', 'email_sent_access_granted', 'email_sent_revocation', 'email_sent_renewal', 'payment_failed');--> statement-breakpoint
CREATE TYPE "public"."access_log_status" AS ENUM('success', 'failed', 'retry');--> statement-breakpoint
CREATE TYPE "public"."access_status" AS ENUM('pending', 'active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."pricing_type" AS ENUM('one-time', 'subscription');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('pending', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."purchase_type" AS ENUM('one-time', 'subscription');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'creator', 'none');--> statement-breakpoint
CREATE TYPE "public"."subscription_cadence" AS ENUM('monthly', 'yearly', 'custom');--> statement-breakpoint
CREATE TABLE "access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"action" "access_log_action" NOT NULL,
	"status" "access_log_status" NOT NULL,
	"error_message" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"pricing_type" "pricing_type" NOT NULL,
	"subscription_cadence" "subscription_cadence",
	"changed_by" uuid,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"stripe_product_id" varchar(255) NOT NULL,
	"stripe_price_id" varchar(255) NOT NULL,
	"price_tier" varchar(100) DEFAULT 'standard',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_stripe_product_id_unique" UNIQUE("stripe_product_id"),
	CONSTRAINT "products_stripe_price_id_unique" UNIQUE("stripe_price_id"),
	CONSTRAINT "unique_repo_tier" UNIQUE("repository_id","price_tier")
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"product_id" uuid,
	"stripe_payment_intent_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"stripe_customer_id" varchar(255),
	"email" varchar(255) NOT NULL,
	"github_username" varchar(255) NOT NULL,
	"purchase_type" "purchase_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "purchase_status" DEFAULT 'pending' NOT NULL,
	"access_status" "access_status" DEFAULT 'pending' NOT NULL,
	"revocation_reason" text,
	"revoked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"access_granted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"github_owner" varchar(255) NOT NULL,
	"github_repo_name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"description" text,
	"cover_image_url" text,
	"pricing_type" "pricing_type" NOT NULL,
	"price_cents" integer NOT NULL,
	"subscription_cadence" "subscription_cadence",
	"custom_cadence_days" integer,
	"active" boolean DEFAULT true NOT NULL,
	"github_stars" integer DEFAULT 0,
	"github_last_updated" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "unique_github_repo" UNIQUE("github_owner","github_repo_name"),
	CONSTRAINT "price_cents_check" CHECK (price_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"github_oauth_id" varchar(255),
	"github_username" varchar(255),
	"github_avatar_url" text,
	"stripe_account_id" varchar(255),
	"role" "role" DEFAULT 'admin' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_github_oauth_id_unique" UNIQUE("github_oauth_id")
);
--> statement-breakpoint
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_history" ADD CONSTRAINT "pricing_history_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_history" ADD CONSTRAINT "pricing_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;