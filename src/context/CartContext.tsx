import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Permission, Role } from 'react-native-appwrite';
import { channels, tables } from '@/lib/appwrite';
import { config, TABLES } from '@/lib/config';
import type { CartItem, Product } from '@/lib/types';
import { useRealtime } from '@/lib/useRealtime';
import { useAuth } from './AuthContext';

const GUEST_KEY = 'myna.guestCart';
const MAX_QTY = 10;

type CartValue = {
  items: CartItem[];
  count: number;
  subtotalCents: number;
  syncing: boolean;
  add: (p: Product, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartValue | null>(null);

const parse = (s?: string | null): CartItem[] => {
  try {
    const v = JSON.parse(s ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

function merge(a: CartItem[], b: CartItem[]) {
  const map = new Map(a.map((i) => [i.productId, { ...i }]));
  for (const i of b) {
    const cur = map.get(i.productId);
    map.set(i.productId, cur ? { ...cur, qty: Math.min(MAX_QTY, cur.qty + i.qty) } : i);
  }
  return [...map.values()];
}

/**
 * Signed in: the cart is one row in Appwrite (id = user id), synced live across devices via Realtime.
 * Guest: the cart lives on the device and is merged into the account cart on sign-in.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const lastWrite = useRef('');

  // Load (and merge the guest cart) whenever the signed-in user changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const guest = parse(await AsyncStorage.getItem(GUEST_KEY));
      if (!user) {
        if (!cancelled) setItems(guest);
        return;
      }
      setSyncing(true);
      try {
        let remote: CartItem[] = [];
        try {
          const row = await tables.getRow({ databaseId: config.dbId, tableId: TABLES.carts, rowId: user.$id });
          remote = parse(row.items as string);
        } catch (e: any) {
          if (e?.code !== 404) throw e;
          await tables.createRow({
            databaseId: config.dbId,
            tableId: TABLES.carts,
            rowId: user.$id,
            data: { items: '[]' },
            permissions: [
              Permission.read(Role.user(user.$id)),
              Permission.update(Role.user(user.$id)),
              Permission.delete(Role.user(user.$id)),
            ],
          });
        }
        const merged = guest.length ? merge(remote, guest) : remote;
        if (guest.length) {
          await push(user.$id, merged);
          await AsyncStorage.removeItem(GUEST_KEY);
        }
        if (!cancelled) setItems(merged);
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.$id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live updates from other devices (and the server clearing the cart after checkout).
  useRealtime<{ items: string }>(user ? [channels.row(TABLES.carts, user.$id)] : null, (e) => {
    if (e.payload?.items == null || e.payload.items === lastWrite.current) return;
    setItems(parse(e.payload.items));
  });

  async function push(userId: string, next: CartItem[]) {
    const json = JSON.stringify(next);
    lastWrite.current = json;
    await tables.updateRow({ databaseId: config.dbId, tableId: TABLES.carts, rowId: userId, data: { items: json } });
  }

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const commit = useCallback(
    (updater: (prev: CartItem[]) => CartItem[]) => {
      const next = updater(itemsRef.current).filter((i) => i.qty > 0);
      itemsRef.current = next;
      setItems(next); // optimistic; Realtime confirms on every other device
      if (user) push(user.$id, next).catch(() => {});
      else AsyncStorage.setItem(GUEST_KEY, JSON.stringify(next)).catch(() => {});
    },
    [user], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const value = useMemo<CartValue>(() => {
    const count = items.reduce((n, i) => n + i.qty, 0);
    const subtotalCents = items.reduce((n, i) => n + i.qty * i.priceCents, 0);
    return {
      items,
      count,
      subtotalCents,
      syncing,
      add: (p, qty = 1) =>
        commit((prev) =>
          merge(prev, [{ productId: p.$id, qty: Math.min(qty, p.stock), name: p.name, priceCents: p.priceCents, imageUrl: p.imageUrl }]).map(
            (i) => (i.productId === p.$id ? { ...i, qty: Math.min(i.qty, p.stock, MAX_QTY) } : i),
          ),
        ),
      setQty: (productId, qty) =>
        commit((prev) => prev.map((i) => (i.productId === productId ? { ...i, qty: Math.max(0, Math.min(MAX_QTY, qty)) } : i))),
      remove: (productId) => commit((prev) => prev.filter((i) => i.productId !== productId)),
      clear: () => commit(() => []),
    };
  }, [items, syncing, commit]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
