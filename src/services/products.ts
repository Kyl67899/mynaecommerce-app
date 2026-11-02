import { Query } from 'react-native-appwrite';
import { useCallback, useEffect, useState } from 'react';
import { channels, tables } from '@/lib/appwrite';
import { config, TABLES } from '@/lib/config';
import type { Product } from '@/lib/types';
import { isDelete, useRealtime } from '@/lib/useRealtime';

type Filters = { category?: string; search?: string; featured?: boolean; limit?: number };

export async function listProducts({ category, search, featured, limit = 100 }: Filters = {}) {
  const queries = [Query.limit(limit), Query.orderDesc('rating')];
  if (category && category !== 'all') queries.push(Query.equal('category', category));
  if (featured) queries.push(Query.equal('featured', true));
  if (search?.trim()) queries.push(Query.search('name', search.trim()));
  const res = await tables.listRows<Product>({ databaseId: config.dbId, tableId: TABLES.products, queries });
  return res.rows;
}

export const getProduct = (id: string) => tables.getRow<Product>({ databaseId: config.dbId, tableId: TABLES.products, rowId: id });

/**
 * Product list that stays live: price, stock and new/removed products arrive over Realtime,
 * so "Only 3 left" and "Sold out" update the moment someone else checks out.
 */
export function useProducts(filters: Filters = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(filters);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setProducts(await listProducts(JSON.parse(key)));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load products');
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  useRealtime<Product>([channels.products()], (e) => {
    const p = e.payload;
    if (isDelete(e)) return setProducts((prev) => prev.filter((x) => x.$id !== p.$id));
    setProducts((prev) => {
      const i = prev.findIndex((x) => x.$id === p.$id);
      if (i === -1) return filters.search || filters.category ? prev : [...prev, p]; // new product: re-query keeps filters correct
      const next = prev.slice();
      next[i] = p;
      return next;
    });
  });

  return { products, loading, error, refresh };
}

/** A single product kept live over Realtime. */
export function useProduct(id: string | undefined) {
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getProduct(id).then(setProduct).catch((e) => setError(e?.message ?? 'Product not found'));
  }, [id]);

  useRealtime<Product>(id ? [channels.row(TABLES.products, id)] : null, (e) => {
    if (isDelete(e)) setError('This product is no longer available');
    else setProduct(e.payload);
  });

  return { product, error };
}
