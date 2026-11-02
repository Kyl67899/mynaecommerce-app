// Node stand-in for expo-crypto so the app's crypto module can be tested off-device.
import { randomBytes } from 'node:crypto';
export const getRandomBytes = (n) => new Uint8Array(randomBytes(n));
