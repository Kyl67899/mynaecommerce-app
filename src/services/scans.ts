import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useState } from 'react';
import { ID, Permission, Query, Role } from 'react-native-appwrite';
import { backendSetupMessage, callApi, channels, storage, tables } from '@/lib/appwrite';
import { config, TABLES } from '@/lib/config';
import { decryptJson } from '@/lib/crypto';
import { getDek } from '@/lib/keyring';
import type { ScanMode, ScanResult, ScanRow } from '@/lib/types';
import { isDelete, useRealtime } from '@/lib/useRealtime';

export type ScanOptions = { mode: ScanMode; concerns: string[] };

/**
 * 1. Normalizes the selfie (SD: short side ≥ 480px, HD: short side ≥ 1080px; long side ≤ 2560px; < 10 MB).
 * 2. Uploads it to the "scans" bucket (AES-256 encrypted at rest by Appwrite, readable only by this user).
 * 3. Starts the analysis in the background with the chosen mode + concerns; the app then watches the scan row live.
 */
export async function startScan(userId: string, photo: { uri: string; width: number; height: number }, { mode, concerns }: ScanOptions) {
  const minShort = mode === 'hd' ? 1080 : 480;
  const maxLong = 2560;
  const target = mode === 'hd' ? 2048 : 1600;
  if (Math.min(photo.width, photo.height) < minShort) {
    throw new Error(mode === 'hd' ? 'HD analysis needs a photo at least 1080px on its short side. Try SD, or use a higher-resolution camera.' : 'That photo is too small. Please use the camera or a larger image.');
  }
  const ctx = ImageManipulator.manipulate(photo.uri);
  const longSide = Math.max(photo.width, photo.height);
  if (longSide > target) {
    // Shrink for upload speed, but never below the mode's minimum short side.
    const scale = Math.max(target / longSide, minShort / Math.min(photo.width, photo.height));
    const w = Math.round(photo.width * Math.min(1, scale));
    ctx.resize({ width: Math.min(w, maxLong) });
  }
  const rendered = await ctx.renderAsync();
  const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });

  const size = (await (await fetch(out.uri)).blob()).size;
  if (size > 10 * 1024 * 1024) throw new Error('That photo is larger than 10 MB.');
  const file = await storage
    .createFile({
      bucketId: config.bucketId,
      fileId: ID.unique(),
      file: { name: `selfie-${Date.now()}.jpg`, type: 'image/jpeg', size, uri: out.uri },
      permissions: [Permission.read(Role.user(userId)), Permission.delete(Role.user(userId))],
    })
    .catch((e) => {
      throw new Error(backendSetupMessage(e) ?? e?.message ?? 'Upload failed. Please try again.');
    });

  const scanId = ID.unique();
  try {
    await callApi('/scan', { fileId: file.$id, scanId, mode, concerns }, { background: true });
  } catch (e) {
    // Don't leave an orphaned selfie behind if the scan never started.
    await storage.deleteFile({ bucketId: config.bucketId, fileId: file.$id }).catch(() => {});
    throw e;
  }
  return scanId;
}

export async function decryptScan(userId: string, row: ScanRow): Promise<ScanResult | null> {
  if (row.status !== 'complete' || !row.payloadEnc) return null;
  return decryptJson<ScanResult>(await getDek(userId), row.payloadEnc, `scan:${userId}`);
}

export async function listScans(userId: string) {
  const res = await tables.listRows<ScanRow>({
    databaseId: config.dbId,
    tableId: TABLES.scans,
    queries: [Query.equal('userId', userId), Query.orderDesc('$createdAt'), Query.limit(50)],
  });
  return res.rows;
}

export async function deleteScan(row: ScanRow) {
  if (row.fileId) await storage.deleteFile({ bucketId: config.bucketId, fileId: row.fileId }).catch(() => {});
  await tables.deleteRow({ databaseId: config.dbId, tableId: TABLES.scans, rowId: row.$id });
}

/** Live view of one scan: processing → complete (decrypted on device) or error. */
export function useScan(userId: string | undefined, scanId: string | undefined) {
  const [row, setRow] = useState<ScanRow | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = async (r: ScanRow) => {
    setRow(r);
    if (r.status === 'error') setError(r.error ?? 'Analysis failed');
    if (r.status === 'complete' && userId) {
      try {
        setResult(await decryptScan(userId, r));
      } catch {
        setError('Could not decrypt this scan on this device.');
      }
    }
  };

  useEffect(() => {
    if (!scanId) return;
    // The row may not exist for a second while the function starts; Realtime will deliver it.
    tables
      .getRow<ScanRow>({ databaseId: config.dbId, tableId: TABLES.scans, rowId: scanId })
      .then(apply)
      .catch(() => {});
  }, [scanId]); // eslint-disable-line react-hooks/exhaustive-deps

  useRealtime<ScanRow>(scanId ? [channels.row(TABLES.scans, scanId)] : null, (e) => {
    if (isDelete(e)) return setError('This scan was deleted');
    apply(e.payload);
  });

  return { row, result, error, status: row?.status ?? 'processing' };
}
