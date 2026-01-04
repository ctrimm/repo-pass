import { Octokit } from '@octokit/rest';
import { env } from './env';
import { db, users } from '../db';
import { eq } from 'drizzle-orm';

// Get user's OAuth token by userId (falls back to PAT if not available)
async function getUserGitHubToken(userId: string): Promise<string> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    // Use user's OAuth token if available, otherwise fall back to PAT
    return user?.githubAccessToken || env.GITHUB_PERSONAL_ACCESS_TOKEN;
  } catch (error) {
    console.warn('Failed to get user OAuth token, using PAT:', error);
    return env.GITHUB_PERSONAL_ACCESS_TOKEN;
  }
}

// Create GitHub client for a specific user
async function createOctokit(userId: string) {
  const token = await getUserGitHubToken(userId);
  return new Octokit({ auth: token });
}

export interface AddCollaboratorOptions {
  userId: string; // User who owns the repository
  owner: string;
  repo: string;
  username: string;
}

export interface RemoveCollaboratorOptions {
  userId: string; // User who owns the repository
  owner: string;
  repo: string;
  username: string;
}

/**
 * Check if a GitHub user exists
 */
export async function checkUserExists(userId: string, username: string): Promise<boolean> {
  try {
    const octokit = await createOctokit(userId);
    await octokit.users.getByUsername({ username });
    return true;
  } catch (error: any) {
    if (error.status === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Add a collaborator to a repository with read-only access
 */
export async function addCollaborator({ userId, owner, repo, username }: AddCollaboratorOptions) {
  try {
    // First check if user exists
    const userExists = await checkUserExists(userId, username);
    if (!userExists) {
      throw new Error(`GitHub user '${username}' does not exist`);
    }

    const octokit = await createOctokit(userId);
    // Add as collaborator with pull (read) permission
    await octokit.repos.addCollaborator({
      owner,
      repo,
      username,
      permission: 'pull', // read-only access
    });

    return { success: true };
  } catch (error: any) {
    console.error('Failed to add collaborator:', error);
    throw new Error(`Failed to add collaborator: ${error.message}`);
  }
}

/**
 * Remove a collaborator from a repository
 */
export async function removeCollaborator({ userId, owner, repo, username }: RemoveCollaboratorOptions) {
  try {
    const octokit = await createOctokit(userId);
    await octokit.repos.removeCollaborator({
      owner,
      repo,
      username,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Failed to remove collaborator:', error);
    throw new Error(`Failed to remove collaborator: ${error.message}`);
  }
}

/**
 * Get repository metadata from GitHub
 */
export async function getRepositoryMetadata(userId: string, owner: string, repo: string) {
  try {
    const octokit = await createOctokit(userId);
    const { data } = await octokit.repos.get({
      owner,
      repo,
    });

    return {
      stars: data.stargazers_count,
      description: data.description,
      lastUpdated: data.updated_at,
      language: data.language,
      isPrivate: data.private,
    };
  } catch (error: any) {
    console.error('Failed to get repository metadata:', error);
    throw new Error(`Failed to get repository metadata: ${error.message}`);
  }
}

/**
 * Get all repositories for a user
 */
export async function getUserRepositories(userId: string) {
  try {
    const octokit = await createOctokit(userId);
    const { data } = await octokit.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: 'updated',
      affiliation: 'owner', // Only repos the user owns
    });

    return data.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      description: repo.description,
      isPrivate: repo.private,
      stars: repo.stargazers_count,
      url: repo.html_url,
    }));
  } catch (error: any) {
    console.error('Failed to get user repositories:', error);
    throw new Error(`Failed to get repositories: ${error.message}`);
  }
}

/**
 * Create OAuth client for user login
 */
export function createOAuthClient() {
  return new Octokit();
}

/**
 * Exchange OAuth code for access token
 */
export async function exchangeOAuthCode(code: string) {
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    return data.access_token;
  } catch (error: any) {
    console.error('Failed to exchange OAuth code:', error);
    throw new Error(`OAuth error: ${error.message}`);
  }
}

/**
 * Get user info from GitHub using OAuth token
 */
export async function getUserInfo(accessToken: string) {
  const userOctokit = new Octokit({ auth: accessToken });

  try {
    const { data: user } = await userOctokit.users.getAuthenticated();
    const { data: emails } = await userOctokit.users.listEmailsForAuthenticatedUser();

    const primaryEmail = emails.find((e) => e.primary)?.email || user.email;

    return {
      id: user.id,
      login: user.login,
      email: primaryEmail,
      name: user.name,
      avatarUrl: user.avatar_url,
    };
  } catch (error: any) {
    console.error('Failed to get user info:', error);
    throw new Error(`Failed to get user info: ${error.message}`);
  }
}
