import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { getDatabaseUrl } from '../lib/sst';

// Database connection - uses SST resource in production, falls back to env var in dev
const connectionString = getDatabaseUrl() || 'postgresql://postgres:postgres@localhost:5432/repopass_dev';

// Create postgres client
const client = postgres(connectionString, {
  max: 10, // Connection pool size
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create drizzle instance
export const db = drizzle(client, { schema });

// Export schema for use in queries
export * from './schema';
