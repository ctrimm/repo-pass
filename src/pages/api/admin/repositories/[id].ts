import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, repositories, pricingHistory, purchases } from '../../../../db';
import { eq, desc, isNull } from 'drizzle-orm';
import { requireAdmin } from '../../../../lib/auth';

const updateRepositorySchema = z.object({
  displayName: z.string().min(1).optional(),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
  priceCents: z.number().int().min(100).optional(),
  active: z.boolean().optional(),
});

export const GET: APIRoute = async ({ params, cookies }) => {
  try {
    await requireAdmin(cookies);

    const repository = await db.query.repositories.findFirst({
      where: eq(repositories.id, params.id!),
      with: {
        products: true,
      },
    });

    if (!repository) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
      });
    }

    // Get purchase stats
    const stats = await db.query.purchases.findMany({
      where: eq(purchases.repositoryId, params.id!),
    });

    const totalPurchases = stats.length;
    const activePurchases = stats.filter((p) => p.accessStatus === 'active').length;
    const totalRevenueCents = stats
      .filter((p) => p.status === 'completed')
      .reduce((sum, p) => sum + p.amountCents, 0);

    return new Response(
      JSON.stringify({
        ...repository,
        stats: {
          totalPurchases,
          activePurchases,
          totalRevenueCents,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes('Unauthorized') ? 401 : 500,
    });
  }
};

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  try {
    const session = await requireAdmin(cookies);

    const body = await request.json();
    const data = updateRepositorySchema.parse(body);

    // Get current repository
    const current = await db.query.repositories.findFirst({
      where: eq(repositories.id, params.id!),
    });

    if (!current) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
      });
    }

    // Check if price is changing
    if (data.priceCents && data.priceCents !== current.priceCents) {
      // Close out the current pricing history entry
      const [currentHistory] = await db
        .select()
        .from(pricingHistory)
        .where(eq(pricingHistory.repositoryId, params.id!))
        .orderBy(desc(pricingHistory.effectiveFrom))
        .limit(1);

      if (currentHistory && !currentHistory.effectiveUntil) {
        await db
          .update(pricingHistory)
          .set({
            effectiveUntil: new Date(),
          })
          .where(eq(pricingHistory.id, currentHistory.id));
      }

      // Create new pricing history entry
      await db.insert(pricingHistory).values({
        repositoryId: params.id!,
        priceCents: data.priceCents,
        pricingType: current.pricingType,
        subscriptionCadence: current.subscriptionCadence,
        changedBy: session.userId,
        effectiveFrom: new Date(),
      });
    }

    // Update repository
    const [updated] = await db
      .update(repositories)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(repositories.id, params.id!))
      .returning();

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
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

export const DELETE: APIRoute = async ({ params, cookies }) => {
  try {
    await requireAdmin(cookies);

    // Soft delete - just set active to false
    const [updated] = await db
      .update(repositories)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(eq(repositories.id, params.id!))
      .returning();

    if (!updated) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
      });
    }

    return new Response(JSON.stringify({ message: 'Repository deactivated', id: updated.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes('Unauthorized') ? 401 : 500,
    });
  }
};
