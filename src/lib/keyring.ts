// Holds the signed-in user's data key (DEK).
// - Fetched once from the myna-api function (which unwraps it with the server-only MASTER_KEK)
// - Cached in the iOS Keychain / Android Keystore via expo-secure-store, scoped to the user id
// - Wiped on sign-out
import * as SecureStore from 'expo-secure-store';
import { callApi } from './appwrite';
import { keyFromBase64 } from './crypto';

const storeKey = (userId: string) => `myna.dek.${userId}`;
const memory = new Map<string, Uint8Array>();

export async function getDek(userId: string): Promise<Uint8Array> {
  const cached = memory.get(userId);
  if (cached) return cached;

  let b64 = await SecureStore.getItemAsync(storeKey(userId)).catch(() => null);
  if (!b64) {
    const { dek } = await callApi<{ dek: string }>('/keyring', {});
    b64 = dek;
    await SecureStore.setItemAsync(storeKey(userId), b64, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }).catch(() => {}); // web has no secure store; key then lives in memory only
  }
  const key = keyFromBase64(b64);
  memory.set(userId, key);
  return key;
}

export async function clearDek(userId: string) {
  memory.delete(userId);
  await SecureStore.deleteItemAsync(storeKey(userId)).catch(() => {});
}
