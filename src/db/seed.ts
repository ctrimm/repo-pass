import { db, users, repositories } from './index';
import { eq } from 'drizzle-orm';
import { getSecret } from '../lib/sst';

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    // Create admin user (Cory) - uses SST secret in production
    const adminEmail = getSecret('AdminEmail', 'ADMIN_EMAIL') || 'cory@example.com';

    console.log('Creating admin user...');
    const [adminUser] = await db
      .insert(users)
      .values({
        email: adminEmail,
        githubUsername: 'ctrimm',
        role: 'user',
      })
      .onConflictDoNothing()
      .returning();

    if (adminUser) {
      console.log(`✅ Admin user created: ${adminUser.email}`);
    } else {
      const [existingUser] = await db.select().from(users).where(eq(users.email, adminEmail));
      console.log(`ℹ️ Admin user already exists: ${existingUser?.email}`);
    }

    // Create sample repository for testing
    console.log('Creating sample repository...');
    const [owner] = await db.select().from(users).where(eq(users.email, adminEmail));

    if (owner) {
      const [sampleRepo] = await db
        .insert(repositories)
        .values({
          ownerId: owner.id,
          githubOwner: 'ctrimm',
          githubRepoName: 'premium-astro-theme',
          slug: 'premium-astro-theme',
          displayName: 'Premium Astro Theme',
          description:
            'A beautiful, production-ready Astro theme with dark mode, animations, and more.',
          pricingType: 'one-time',
          priceCents: 4900, // $49.00
          active: true,
        })
        .onConflictDoNothing()
        .returning();

      if (sampleRepo) {
        console.log(`✅ Sample repository created: ${sampleRepo.displayName}`);
      } else {
        console.log('ℹ️ Sample repository already exists');
      }
    }

    console.log('✅ Seeding completed successfully');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

seed();
