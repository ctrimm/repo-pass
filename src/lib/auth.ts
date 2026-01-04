import * as jose from 'jose';
import { env } from './env';
import type { AstroCookies } from 'astro';

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
const SESSION_COOKIE_NAME = 'repopass_session';

export interface SessionData {
  userId: string;
  email: string;
  isAdmin: boolean;
}

/**
 * Create a JWT token for a user session
 */
export async function createSession(data: SessionData): Promise<string> {
  const token = await new jose.SignJWT({
    userId: data.userId,
    email: data.email,
    isAdmin: data.isAdmin,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET);

  return token;
}

/**
 * Verify and decode a JWT token
 */
export async function verifySession(token: string): Promise<SessionData | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);

    return {
      userId: payload.userId as string,
      email: payload.email as string,
      isAdmin: payload.isAdmin as boolean,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get session from cookies
 */
export async function getSession(cookies: AstroCookies): Promise<SessionData | null> {
  const token = cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifySession(token);
}

/**
 * Set session cookie
 */
export function setSessionCookie(cookies: AstroCookies, token: string) {
  cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(cookies: AstroCookies) {
  cookies.delete(SESSION_COOKIE_NAME, {
    path: '/',
  });
}

/**
 * Check if user is admin
 */
export async function requireAdmin(cookies: AstroCookies): Promise<SessionData> {
  const session = await getSession(cookies);

  if (!session) {
    throw new Error('Unauthorized: No session found');
  }

  if (!session.isAdmin) {
    throw new Error('Forbidden: Admin access required');
  }

  return session;
}
