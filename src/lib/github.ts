import { Octokit } from '@octokit/rest';
import { env } from './env';

// Create GitHub client with service PAT
const octokit = new Octokit({
  auth: env.GITHUB_PERSONAL_ACCESS_TOKEN,
});

export interface AddCollaboratorOptions {
  owner: string;
  repo: string;
  username: string;
}

export interface RemoveCollaboratorOptions {
  owner: string;
  repo: string;
  username: string;
}

/**
 * Check if a GitHub user exists
 */
export async function checkUserExists(username: string): Promise<boolean> {
  try {
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
export async function addCollaborator({ owner, repo, username }: AddCollaboratorOptions) {
  try {
    // First check if user exists
    const userExists = await checkUserExists(username);
    if (!userExists) {
      throw new Error(`GitHub user '${username}' does not exist`);
    }

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
export async function removeCollaborator({ owner, repo, username }: RemoveCollaboratorOptions) {
  try {
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
export async function getRepositoryMetadata(owner: string, repo: string) {
  try {
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
