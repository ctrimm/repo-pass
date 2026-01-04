import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { db, users } from '../../../../db';
import { eq } from 'drizzle-orm';
import { encrypt } from '../../../../lib/crypto';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    const session = await requireAuth(cookies);

    const formData = await request.formData();
    const githubPat = formData.get('github_pat') as string;

    if (!githubPat || githubPat === '••••••••••••••••') {
      return new Response('GitHub Personal Access Token is required', { status: 400 });
    }

    // Basic validation - GitHub PATs start with 'ghp_'
    if (!githubPat.startsWith('ghp_') && !githubPat.startsWith('github_pat_')) {
      return new Response('Invalid GitHub Personal Access Token format', { status: 400 });
    }

    // TODO: In production, verify the token with GitHub API before saving

    // Encrypt the PAT before storing
    await db
      .update(users)
      .set({
        githubPersonalAccessToken: encrypt(githubPat),
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.userId));

    return redirect('/dashboard/settings?success=github-pat');
  } catch (error) {
    console.error('Error saving GitHub PAT:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
