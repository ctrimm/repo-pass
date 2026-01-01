import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/repopass_dev';

async function reset() {
  console.log('⚠️  WARNING: This will delete all data from the database!');
  console.log('Resetting database in 3 seconds... Press Ctrl+C to cancel');

  await new Promise(resolve => setTimeout(resolve, 3000));

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    console.log('🗑️  Dropping all tables...');

    // Drop tables in reverse order of dependencies
    await db.execute(sql`DROP TABLE IF EXISTS access_logs CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS pricing_history CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS purchases CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS products CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS repositories CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS users CASCADE`);

    // Drop enums
    await db.execute(sql`DROP TYPE IF EXISTS role CASCADE`);
    await db.execute(sql`DROP TYPE IF EXISTS pricing_type CASCADE`);
    await db.execute(sql`DROP TYPE IF EXISTS subscription_cadence CASCADE`);
    await db.execute(sql`DROP TYPE IF EXISTS purchase_type CASCADE`);
    await db.execute(sql`DROP TYPE IF EXISTS purchase_status CASCADE`);
    await db.execute(sql`DROP TYPE IF EXISTS access_status CASCADE`);
    await db.execute(sql`DROP TYPE IF EXISTS access_log_action CASCADE`);
    await db.execute(sql`DROP TYPE IF EXISTS access_log_status CASCADE`);

    console.log('✅ Database reset completed');
    console.log('Run "npm run db:migrate" to recreate tables');
  } catch (error) {
    console.error('❌ Reset failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

reset();
