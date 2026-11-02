// Proves the app (src/lib/crypto.ts, @noble/ciphers) and the server function
// (functions/myna-api/src/crypto.js, node:crypto) speak the same AES-256-GCM format.
//   npm run test:crypto
import { register } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const shim = new URL('./test-shims/expo-crypto.mjs', import.meta.url).href;
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(s, c, next) { return s === 'expo-crypto' ? { url: ${JSON.stringify(shim)}, shortCircuit: true } : next(s, c); }`),
);

const server = await import('../functions/myna-api/src/crypto.js');
const app = await import('../src/lib/crypto.ts');

const dek = server.randomKey();
const appKey = app.keyFromBase64(dek.toString('base64'));
const payload = JSON.stringify({ overall: 78, concerns: [{ key: 'redness', score: 61 }], note: 'unicode ✓ 肌' });

test('server encrypts → app decrypts (scan results)', () => {
  const ct = server.encrypt(dek, payload, 'scan:user123');
  assert.match(ct, /^v1:/);
  assert.equal(app.decryptString(appKey, ct, 'scan:user123'), payload);
});

test('app encrypts → server decrypts', () => {
  const ct = app.encryptString(appKey, payload, 'order:user123');
  assert.equal(server.decrypt(dek, ct, 'order:user123').toString('utf8'), payload);
});

test('fresh random IV every time', () => {
  assert.notEqual(server.encrypt(dek, 'x'), server.encrypt(dek, 'x'));
  assert.notEqual(app.encryptString(appKey, 'x'), app.encryptString(appKey, 'x'));
});

test('ciphertext moved to another user fails (AAD binding)', () => {
  const ct = server.encrypt(dek, payload, 'scan:alice');
  assert.throws(() => app.decryptString(appKey, ct, 'scan:mallory'));
});

test('tampered ciphertext is rejected (GCM auth tag)', () => {
  const ct = server.encrypt(dek, payload, 'scan:u');
  const bytes = Buffer.from(ct.slice(3), 'base64');
  bytes[20] ^= 0x01;
  assert.throws(() => app.decryptString(appKey, 'v1:' + bytes.toString('base64'), 'scan:u'));
});

test('wrong key is rejected', () => {
  const other = app.keyFromBase64(server.randomKey().toString('base64'));
  assert.throws(() => app.decryptString(other, server.encrypt(dek, payload)));
});

test('DEK wrap/unwrap with the master KEK is bound to the user id', () => {
  const kek = server.randomKey();
  const wrapped = server.wrapDek(kek, dek, 'user123');
  assert.deepEqual(server.unwrapDek(kek, wrapped, 'user123'), dek);
  assert.throws(() => server.unwrapDek(kek, wrapped, 'someone-else'));
});
