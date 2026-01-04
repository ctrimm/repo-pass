import type { APIRoute } from 'astro';
import { db, users } from '../../../../db';
import { eq } from 'drizzle-orm';
import { exchangeOAuthCode, getUserInfo } from '../../../../lib/github';
import { createSession, setSessionCookie } from '../../../../lib/auth';
import { encrypt } from '../../../../lib/crypto';
import { env } from '../../../../lib/env';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error || !code) {
    return redirect('/login?error=oauth_failed');
  }

  try {
    // Exchange code for access token
    const accessToken = await exchangeOAuthCode(code);

    // Get user info from GitHub
    const githubUser = await getUserInfo(accessToken);

    // GitHub email can be null if user hides it - use username@users.noreply.github.com as fallback
    const email = githubUser.email || `${githubUser.login}@users.noreply.github.com`;

    // Find or create user in database (any GitHub user can sign in)
    let user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      // Create new user - they become admin for their own repositories
      const [newUser] = await db
        .insert(users)
        .values({
          email,
          githubOauthId: githubUser.id.toString(),
          githubUsername: githubUser.login,
          githubAvatarUrl: githubUser.avatarUrl,
          githubPersonalAccessToken: encrypt(accessToken),
          role: 'user',
        })
        .returning();

      user = newUser;
    } else {
      // Update existing user and refresh OAuth token
      await db
        .update(users)
        .set({
          githubOauthId: githubUser.id.toString(),
          githubUsername: githubUser.login,
          githubAvatarUrl: githubUser.avatarUrl,
          githubPersonalAccessToken: encrypt(accessToken),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }

    // Create session
    const sessionToken = await createSession({
      userId: user.id,
      email: user.email,
    });

    // Set session cookie
    setSessionCookie(cookies, sessionToken);

    // Redirect to dashboard
    return redirect('/dashboard');
  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    return redirect('/login?error=server_error');
  }
};
