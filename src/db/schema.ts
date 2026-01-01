import { pgTable, uuid, varchar, text, integer, boolean, timestamp, pgEnum, check, unique } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Enums
export const roleEnum = pgEnum('role', ['admin', 'creator', 'none']);
export const pricingTypeEnum = pgEnum('pricing_type', ['one-time', 'subscription']);
export const subscriptionCadenceEnum = pgEnum('subscription_cadence', ['monthly', 'yearly', 'custom']);
export const purchaseTypeEnum = pgEnum('purchase_type', ['one-time', 'subscription']);
export const purchaseStatusEnum = pgEnum('purchase_status', ['pending', 'completed', 'failed', 'canceled']);
export const accessStatusEnum = pgEnum('access_status', ['pending', 'active', 'revoked']);
export const accessLogActionEnum = pgEnum('access_log_action', [
  'collaborator_added',
  'collaborator_removed',
  'email_sent_confirmation',
  'email_sent_access_granted',
  'email_sent_revocation',
  'email_sent_renewal',
  'payment_failed'
]);
export const accessLogStatusEnum = pgEnum('access_log_status', ['success', 'failed', 'retry']);

// Users table
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  githubOauthId: varchar('github_oauth_id', { length: 255 }).unique(),
  githubUsername: varchar('github_username', { length: 255 }),
  githubAvatarUrl: text('github_avatar_url'),
  stripeAccountId: varchar('stripe_account_id', { length: 255 }),
  role: roleEnum('role').default('admin').notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Repositories table
export const repositories = pgTable('repositories', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  githubOwner: varchar('github_owner', { length: 255 }).notNull(),
  githubRepoName: varchar('github_repo_name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).unique().notNull(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  description: text('description'),
  coverImageUrl: text('cover_image_url'),
  pricingType: pricingTypeEnum('pricing_type').notNull(),
  priceCents: integer('price_cents').notNull(),
  subscriptionCadence: subscriptionCadenceEnum('subscription_cadence'),
  customCadenceDays: integer('custom_cadence_days'),
  active: boolean('active').default(true).notNull(),
  githubStars: integer('github_stars').default(0),
  githubLastUpdated: timestamp('github_last_updated', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueGithubRepo: unique('unique_github_repo').on(table.githubOwner, table.githubRepoName),
  priceCentsCheck: check('price_cents_check', sql`price_cents >= 0`),
}));

// Products table (Stripe mapping)
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  repositoryId: uuid('repository_id').references(() => repositories.id, { onDelete: 'cascade' }).notNull(),
  stripeProductId: varchar('stripe_product_id', { length: 255 }).unique().notNull(),
  stripePriceId: varchar('stripe_price_id', { length: 255 }).unique().notNull(),
  priceTier: varchar('price_tier', { length: 100 }).default('standard'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueRepoTier: unique('unique_repo_tier').on(table.repositoryId, table.priceTier),
}));

// Purchases table
export const purchases = pgTable('purchases', {
  id: uuid('id').defaultRandom().primaryKey(),
  repositoryId: uuid('repository_id').references(() => repositories.id, { onDelete: 'restrict' }).notNull(),
  productId: uuid('product_id').references(() => products.id),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  email: varchar('email', { length: 255 }).notNull(),
  githubUsername: varchar('github_username', { length: 255 }).notNull(),
  purchaseType: purchaseTypeEnum('purchase_type').notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: purchaseStatusEnum('status').default('pending').notNull(),
  accessStatus: accessStatusEnum('access_status').default('pending').notNull(),
  revocationReason: text('revocation_reason'),
  revokedBy: uuid('revoked_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  accessGrantedAt: timestamp('access_granted_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

// Access logs table
export const accessLogs = pgTable('access_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  purchaseId: uuid('purchase_id').references(() => purchases.id, { onDelete: 'cascade' }).notNull(),
  action: accessLogActionEnum('action').notNull(),
  status: accessLogStatusEnum('status').notNull(),
  errorMessage: text('error_message'),
  metadata: text('metadata'), // JSON string
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Pricing history table
export const pricingHistory = pgTable('pricing_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  repositoryId: uuid('repository_id').references(() => repositories.id, { onDelete: 'cascade' }).notNull(),
  priceCents: integer('price_cents').notNull(),
  pricingType: pricingTypeEnum('pricing_type').notNull(),
  subscriptionCadence: subscriptionCadenceEnum('subscription_cadence'),
  changedBy: uuid('changed_by').references(() => users.id),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  repositories: many(repositories),
  revokedPurchases: many(purchases),
  pricingChanges: many(pricingHistory),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  owner: one(users, {
    fields: [repositories.ownerId],
    references: [users.id],
  }),
  products: many(products),
  purchases: many(purchases),
  pricingHistory: many(pricingHistory),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [products.repositoryId],
    references: [repositories.id],
  }),
  purchases: many(purchases),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [purchases.repositoryId],
    references: [repositories.id],
  }),
  product: one(products, {
    fields: [purchases.productId],
    references: [products.id],
  }),
  revokedByUser: one(users, {
    fields: [purchases.revokedBy],
    references: [users.id],
  }),
  accessLogs: many(accessLogs),
}));

export const accessLogsRelations = relations(accessLogs, ({ one }) => ({
  purchase: one(purchases, {
    fields: [accessLogs.purchaseId],
    references: [purchases.id],
  }),
}));

export const pricingHistoryRelations = relations(pricingHistory, ({ one }) => ({
  repository: one(repositories, {
    fields: [pricingHistory.repositoryId],
    references: [repositories.id],
  }),
  changedByUser: one(users, {
    fields: [pricingHistory.changedBy],
    references: [users.id],
  }),
}));
