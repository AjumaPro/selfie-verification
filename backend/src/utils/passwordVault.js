const crypto = require('crypto');
const { getJwtSecret } = require('../middleware/auth');

const ALGO = 'aes-256-gcm';
const PREFIX = 'v1';

function vaultKey() {
  const secret =
    String(process.env.PASSWORD_VIEW_SECRET || '').trim() || getJwtSecret();
  return crypto.createHash('sha256').update(`glico-pw-vault:${secret}`).digest();
}

/**
 * Encrypt plaintext password for superadmin retrieval.
 * Login still uses bcrypt hash only.
 */
function encryptPasswordForVault(plain) {
  const text = String(plain || '');
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, vaultKey(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join(
    '.'
  );
}

function decryptPasswordFromVault(payload) {
  const raw = String(payload || '');
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('Stored password format is invalid.');
  }
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const data = Buffer.from(parts[3], 'base64url');
  const decipher = crypto.createDecipheriv(ALGO, vaultKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = {
  encryptPasswordForVault,
  decryptPasswordFromVault,
};
