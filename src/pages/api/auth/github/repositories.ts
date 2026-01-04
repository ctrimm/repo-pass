import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { getUserRepositories } from '../../../../lib/github';

export const GET: APIRoute = async ({ cookies }) => {
  try {
    const session = await getSession(cookies);

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const repositories = await getUserRepositories(session.userId);

    return new Response(JSON.stringify({ repositories }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Failed to fetch repositories:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
