import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';

export const GET: APIRoute = async ({ redirect }) => {
  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');

  githubAuthUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set('redirect_uri', `${env.SITE_URL}/api/auth/github/callback`);
  githubAuthUrl.searchParams.set('scope', 'read:user user:email');

  return redirect(githubAuthUrl.toString());
};
