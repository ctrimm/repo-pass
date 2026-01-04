import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { env } from './env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derive encryption key from environment secret
 */
function getEncryptionKey(): Buffer {
  const secret = env.ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('ENCRYPTION_SECRET must be at least 32 characters');
  }
  // Use scrypt to derive a 256-bit key
  return scryptSync(secret, 'salt', KEY_LENGTH);
}

/**
 * Encrypt sensitive data (API keys, tokens)
 * Returns: base64 encoded string: salt:iv:tag:encryptedData
 */
export function encrypt(plaintext: string | null): string | null {
  if (!plaintext) return null;

  try {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const salt = randomBytes(SALT_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    // Combine: salt:iv:tag:encryptedData (all hex encoded)
    const combined = `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;

    // Return base64 encoded for storage
    return Buffer.from(combined).toString('base64');
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data
 */
export function decrypt(ciphertext: string | null): string | null {
  if (!ciphertext) return null;

  try {
    const key = getEncryptionKey();

    // Decode from base64
    const combined = Buffer.from(ciphertext, 'base64').toString('utf8');
    const parts = combined.split(':');

    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }

    const [saltHex, ivHex, tagHex, encryptedHex] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Encrypt payment provider credentials
 */
export function encryptPaymentCredentials(credentials: Record<string, string | null | undefined>) {
  const encrypted: Record<string, string | null> = {};

  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value === 'string' && value.length > 0) {
      encrypted[key] = encrypt(value);
    } else {
      encrypted[key] = null;
    }
  }

  return encrypted;
}

/**
 * Decrypt payment provider credentials
 */
export function decryptPaymentCredentials(
  encryptedCredentials: Record<string, string | null | undefined>
) {
  const decrypted: Record<string, string | null> = {};

  for (const [key, value] of Object.entries(encryptedCredentials)) {
    if (typeof value === 'string' && value.length > 0) {
      try {
        decrypted[key] = decrypt(value);
      } catch (error) {
        console.error(`Failed to decrypt ${key}:`, error);
        decrypted[key] = null;
      }
    } else {
      decrypted[key] = null;
    }
  }

  return decrypted;
}
