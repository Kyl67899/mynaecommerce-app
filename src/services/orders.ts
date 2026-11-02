import { useCallback, useEffect, useState } from 'react';
import { Query } from 'react-native-appwrite';
import { callApi, channels, tables } from '@/lib/appwrite';
import { config, TABLES } from '@/lib/config';
import { decryptJson } from '@/lib/crypto';
import { getDek } from '@/lib/keyring';
import type { CartItem, OrderLine, OrderRow, ShippingAddress } from '@/lib/types';
import { useRealtime } from '@/lib/useRealtime';

/** Sends only ids + quantities; the server prices the order and reserves stock. */
export function placeOrder(items: CartItem[], shipping: ShippingAddress) {
  return callApi<{ orderId: string; totalCents: number }>('/order', {
    items: items.map(({ productId, qty }) => ({ productId, qty })),
    shipping,
  });
}

export const orderLines = (o: OrderRow): OrderLine[] => {
  try {
    return JSON.parse(o.itemsJson);
  } catch {
    return [];
  }
};

export async function decryptAddress(userId: string, o: OrderRow) {
  return decryptJson<ShippingAddress>(await getDek(userId), o.shippingEnc, `order:${userId}`);
}

/** The user's orders, with status changes (packed → shipped → delivered) arriving live. */
export function useOrders(userId: string | undefined) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await tables.listRows<OrderRow>({
        databaseId: config.dbId,
        tableId: TABLES.orders,
        queries: [Query.equal('userId', userId), Query.orderDesc('$createdAt'), Query.limit(50)],
      });
      setOrders(res.rows);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRealtime<OrderRow>(userId ? [channels.table(TABLES.orders)] : null, (e) => {
    const o = e.payload;
    if (o.userId !== userId) return;
    setOrders((prev) => {
      const i = prev.findIndex((x) => x.$id === o.$id);
      if (i === -1) return [o, ...prev];
      const next = prev.slice();
      next[i] = o;
      return next;
    });
  });

  return { orders, loading, refresh };
}
