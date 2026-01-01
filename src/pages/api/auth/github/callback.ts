import type { APIRoute } from 'astro';
import { db, users } from '../../../../db';
import { eq } from 'drizzle-orm';
import { exchangeOAuthCode, getUserInfo } from '../../../../lib/github';
import { createSession, setSessionCookie } from '../../../../lib/auth';
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

    // Check if user is the admin
    if (githubUser.email !== env.ADMIN_EMAIL) {
      return redirect('/login?error=unauthorized');
    }

    // Find or create user in database
    let user = await db.query.users.findFirst({
      where: eq(users.email, githubUser.email),
    });

    if (!user) {
      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          email: githubUser.email,
          githubOauthId: githubUser.id.toString(),
          githubUsername: githubUser.login,
          githubAvatarUrl: githubUser.avatarUrl,
          role: 'admin',
          isAdmin: true,
        })
        .returning();

      user = newUser;
    } else {
      // Update existing user
      await db
        .update(users)
        .set({
          githubOauthId: githubUser.id.toString(),
          githubUsername: githubUser.login,
          githubAvatarUrl: githubUser.avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }

    // Create session
    const sessionToken = await createSession({
      userId: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
    });

    // Set session cookie
    setSessionCookie(cookies, sessionToken);

    // Redirect to admin dashboard
    return redirect('/admin');
  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    return redirect('/login?error=server_error');
  }
};
