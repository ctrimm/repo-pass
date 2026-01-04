import type { APIRoute } from 'astro';
import { db, purchases, repositories } from '../../../../db';
import { eq, desc, inArray, and } from 'drizzle-orm';
import { requireAdmin } from '../../../../lib/auth';
import { removeCollaborator } from '../../../../lib/github';
import { sendEmail, emailTemplates } from '../../../../lib/email';

export const GET: APIRoute = async ({ url, cookies }) => {
  try {
    const session = await requireAdmin(cookies);

    const repositoryId = url.searchParams.get('repositoryId');
    const status = url.searchParams.get('status');

    // SECURITY: First get all repository IDs owned by current user
    const userRepos = await db
      .select({ id: repositories.id })
      .from(repositories)
      .where(eq(repositories.ownerId, session.userId));

    const userRepoIds = userRepos.map((r) => r.id);

    // If user has no repositories, return empty list
    if (userRepoIds.length === 0) {
      return new Response(JSON.stringify({ customers: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build query conditions
    const conditions = [inArray(purchases.repositoryId, userRepoIds)];
    if (repositoryId && userRepoIds.includes(repositoryId)) {
      conditions.push(eq(purchases.repositoryId, repositoryId));
    }
    if (status) {
      conditions.push(eq(purchases.accessStatus, status as any));
    }

    // SECURITY: Only fetch purchases for user's repositories
    const allPurchases = await db
      .select()
      .from(purchases)
      .where(and(...conditions))
      .orderBy(desc(purchases.createdAt));

    const filteredPurchases = allPurchases;

    // Get repository details for each purchase
    const customersWithDetails = await Promise.all(
      filteredPurchases.map(async (purchase) => {
        const repo = await db.query.repositories.findFirst({
          where: eq(repositories.id, purchase.repositoryId),
        });

        return {
          ...purchase,
          repositoryName: repo?.displayName || 'Unknown',
          repositorySlug: repo?.slug || '',
        };
      })
    );

    return new Response(JSON.stringify({ customers: customersWithDetails }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes('Unauthorized') ? 401 : 500,
    });
  }
};
