import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { getDatabaseUrl } from '../lib/sst';

// Uses SST resource in production, falls back to env var in dev
const connectionString =
  getDatabaseUrl() || 'postgresql://postgres:postgres@localhost:5432/repopass_dev';

async function main() {
  console.log('🚀 Running migrations...');

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    await migrate(db, { migrationsFolder: './src/db/migrations' });
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
