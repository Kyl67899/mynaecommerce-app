// AES-256-GCM envelope encryption (server side).
//
//   MASTER_KEK (32 bytes, function env var)  ── wraps ──▶  per-user DEK (32 bytes)
//   per-user DEK                             ── encrypts ─▶  scan results, shipping addresses
//
// Wire format (shared with the app's src/lib/crypto.ts):
//   "v1:" + base64( iv[12] || ciphertext || authTag[16] )
// The AAD binds each ciphertext to its owner + purpose, so a value copied
// into another user's row (or another column) fails authentication.
import crypto from 'node:crypto';

const PREFIX = 'v1:';

export function loadKek() {
  const raw = process.env.MASTER_KEK;
  if (!raw) throw new Error('MASTER_KEK is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('MASTER_KEK must be 32 bytes, base64-encoded');
  return key;
}

export const randomKey = () => crypto.randomBytes(32);

export function encrypt(key, plaintext, aad) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const data = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  return PREFIX + Buffer.concat([iv, ct, cipher.getAuthTag()]).toString('base64');
}

export function decrypt(key, payload, aad) {
  if (!payload?.startsWith(PREFIX)) throw new Error('Unknown ciphertext format');
  const buf = Buffer.from(payload.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export const wrapDek = (kek, dek, userId) => encrypt(kek, dek, `dek:${userId}`);
export const unwrapDek = (kek, wrapped, userId) => decrypt(kek, wrapped, `dek:${userId}`);
