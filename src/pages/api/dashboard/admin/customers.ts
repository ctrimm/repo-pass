import type { APIRoute } from 'astro';
import { db, purchases, repositories } from '../../../../db';
import { eq, desc } from 'drizzle-orm';
import { requireAdmin } from '../../../../lib/auth';
import { removeCollaborator } from '../../../../lib/github';
import { sendEmail, emailTemplates } from '../../../../lib/email';

export const GET: APIRoute = async ({ url, cookies }) => {
  try {
    await requireAdmin(cookies);

    const repositoryId = url.searchParams.get('repositoryId');
    const status = url.searchParams.get('status');

    let query = db.select().from(purchases).orderBy(desc(purchases.createdAt));

    // Apply filters if provided
    const allPurchases = await query;

    const filteredPurchases = allPurchases.filter((p) => {
      if (repositoryId && p.repositoryId !== repositoryId) return false;
      if (status && p.accessStatus !== status) return false;
      return true;
    });

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
