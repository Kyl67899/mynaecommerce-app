import { useCallback, useEffect, useState } from 'react';
import { ID, Query } from 'react-native-appwrite';
import { channels, storage, tables } from '@/lib/appwrite';
import { lastDays } from '@/lib/analytics';
import { config, TABLES } from '@/lib/config';
import type { EventRow, OrderRow, Product } from '@/lib/types';
import { isDelete, useRealtime } from '@/lib/useRealtime';

// All writes below are enforced by Appwrite permissions: they only succeed for members of the "admins" team.

/** Analytics events for the last `2 × days` (current + previous period), kept live over Realtime. */
export function useEvents(days: number) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const since = lastDays(days * 2)[0];

  const load = useCallback(async () => {
    const all: EventRow[] = [];
    let cursor: string | undefined;
    // Page through (Appwrite caps a page); 20 pages × 500 = 10k events is plenty for a dashboard.
    for (let page = 0; page < 20; page++) {
      const queries = [Query.greaterThanEqual('day', since), Query.orderAsc('$id'), Query.limit(500)];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      const res = await tables.listRows<EventRow>({ databaseId: config.dbId, tableId: TABLES.events, queries });
      all.push(...res.rows);
      if (res.rows.length < 500) break;
      cursor = res.rows[res.rows.length - 1].$id;
    }
    setEvents(all);
    setLoading(false);
  }, [since]);

  useEffect(() => {
    setLoading(true);
    load().catch(() => setLoading(false));
  }, [load]);

  useRealtime<EventRow>([channels.table(TABLES.events)], (e) => {
    if (isDelete(e)) return setEvents((prev) => prev.filter((x) => x.$id !== e.payload.$id));
    setEvents((prev) => (prev.some((x) => x.$id === e.payload.$id) ? prev : [...prev, e.payload]));
    setLastEventAt(Date.now());
  });

  return { events, loading, lastEventAt, refresh: load };
}

/** Every customer's orders (admins have table-level read), live. */
export function useAllOrders(limit = 100) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await tables.listRows<OrderRow>({
      databaseId: config.dbId,
      tableId: TABLES.orders,
      queries: [Query.orderDesc('$createdAt'), Query.limit(limit)],
    });
    setOrders(res.rows);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  useRealtime<OrderRow>([channels.table(TABLES.orders)], (e) => {
    const o = e.payload;
    setOrders((prev) => {
      const i = prev.findIndex((x) => x.$id === o.$id);
      if (i === -1) return [o, ...prev];
      const next = prev.slice();
      next[i] = o;
      return next;
    });
  });

  return { orders, loading, refresh: load };
}

export const ORDER_FLOW: OrderRow['status'][] = ['placed', 'packed', 'shipped', 'delivered'];

export function setOrderStatus(orderId: string, status: OrderRow['status']) {
  return tables.updateRow({ databaseId: config.dbId, tableId: TABLES.orders, rowId: orderId, data: { status } });
}

export type ProductInput = Omit<Product, keyof import('react-native-appwrite').Models.Row>;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28) || 'product';

export async function createProduct(input: Omit<ProductInput, 'slug'>) {
  const slug = `${slugify(input.name)}-${Math.random().toString(36).slice(2, 6)}`;
  return tables.createRow<Product>({ databaseId: config.dbId, tableId: TABLES.products, rowId: slug, data: { ...input, slug } });
}

export function updateProduct(id: string, data: Partial<ProductInput>) {
  return tables.updateRow<Product>({ databaseId: config.dbId, tableId: TABLES.products, rowId: id, data });
}

export function deleteProduct(id: string) {
  return tables.deleteRow({ databaseId: config.dbId, tableId: TABLES.products, rowId: id });
}

/** Uploads a product photo to the public product-images bucket and returns its URL. */
export async function uploadProductImage(uri: string, mimeType = 'image/jpeg') {
  const size = (await (await fetch(uri)).blob()).size;
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const file = await storage.createFile({
    bucketId: config.productImagesBucketId,
    fileId: ID.unique(),
    file: { name: `product-${Date.now()}.${ext}`, type: mimeType, size, uri },
  });
  return storage.getFileViewURL(config.productImagesBucketId, file.$id).toString();
}
