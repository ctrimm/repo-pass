import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, repositories } from '../../../../db';
import { eq } from 'drizzle-orm';
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
      where: eq(db.purchases.repositoryId, params.id!),
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
    await requireAdmin(cookies);

    const body = await request.json();
    const data = updateRepositorySchema.parse(body);

    const [updated] = await db
      .update(repositories)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(repositories.id, params.id!))
      .returning();

    if (!updated) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
      });
    }

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: error.errors }),
        { status: 400 }
      );
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

    return new Response(
      JSON.stringify({ message: 'Repository deactivated', id: updated.id }),
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
