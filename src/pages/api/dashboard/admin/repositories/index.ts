import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, repositories, pricingHistory } from '../../../../../db';
import { eq, desc } from 'drizzle-orm';
import { requireAdmin } from '../../../../../lib/auth';

const createRepositorySchema = z.object({
  githubOwner: z.string().min(1),
  githubRepoName: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
  pricingType: z.enum(['one-time', 'subscription', 'free']),
  priceCents: z.number().int().min(0),
  subscriptionCadence: z.enum(['monthly', 'yearly']).optional(),
  requireEmailForFree: z.boolean().optional(),
});

export const GET: APIRoute = async ({ cookies }) => {
  try {
    const session = await requireAdmin(cookies);

    // SECURITY: Only return repositories owned by current user
    const allRepositories = await db
      .select()
      .from(repositories)
      .where(eq(repositories.ownerId, session.userId))
      .orderBy(desc(repositories.createdAt));

    return new Response(JSON.stringify({ repositories: allRepositories }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes('Unauthorized') ? 401 : 500,
    });
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const session = await requireAdmin(cookies);

    const body = await request.json();
    const data = createRepositorySchema.parse(body);

    // Generate slug
    const slug = data.githubRepoName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // Create repository
    const [repository] = await db
      .insert(repositories)
      .values({
        ownerId: session.userId,
        githubOwner: data.githubOwner,
        githubRepoName: data.githubRepoName,
        slug,
        displayName: data.displayName,
        description: data.description,
        coverImageUrl: data.coverImageUrl,
        pricingType: data.pricingType,
        priceCents: data.priceCents,
        subscriptionCadence: data.subscriptionCadence,
        requireEmailForFree: data.requireEmailForFree || false,
        active: true,
      })
      .returning();

    // Create initial pricing history entry
    await db.insert(pricingHistory).values({
      repositoryId: repository.id,
      priceCents: data.priceCents,
      pricingType: data.pricingType,
      subscriptionCadence: data.subscriptionCadence,
      changedBy: session.userId,
      effectiveFrom: new Date(),
    });

    return new Response(JSON.stringify(repository), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Create repository error:', error);

    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Invalid request', details: error.errors }), {
        status: 400,
      });
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes('Unauthorized') ? 401 : 500,
    });
  }
};
