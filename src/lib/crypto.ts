// AES-256-GCM on device, byte-compatible with functions/myna-api/src/crypto.js.
//   format: "v1:" + base64( iv[12] || ciphertext || authTag[16] )
// @noble/ciphers is an audited, dependency-free implementation; IVs come from the
// OS CSPRNG via expo-crypto. GCM authenticates, so tampered data throws instead of decrypting.
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { fromByteArray, toByteArray } from 'base64-js';
import * as Crypto from 'expo-crypto';

const PREFIX = 'v1:';

export function keyFromBase64(b64: string): Uint8Array {
  const key = toByteArray(b64);
  if (key.length !== 32) throw new Error('Expected a 256-bit key');
  return key;
}

export function encryptString(key: Uint8Array, plaintext: string, aad?: string): string {
  const iv = Crypto.getRandomBytes(12);
  const sealed = gcm(key, iv, aad ? utf8ToBytes(aad) : undefined).encrypt(utf8ToBytes(plaintext));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv, 0);
  out.set(sealed, iv.length);
  return PREFIX + fromByteArray(out);
}

export function decryptString(key: Uint8Array, payload: string, aad?: string): string {
  if (!payload?.startsWith(PREFIX)) throw new Error('Unknown ciphertext format');
  const buf = toByteArray(payload.slice(PREFIX.length));
  const iv = buf.subarray(0, 12);
  const sealed = buf.subarray(12); // ciphertext || tag, which is what noble expects
  return bytesToUtf8(gcm(key, iv, aad ? utf8ToBytes(aad) : undefined).decrypt(sealed));
}

export const decryptJson = <T>(key: Uint8Array, payload: string, aad?: string): T => JSON.parse(decryptString(key, payload, aad));
