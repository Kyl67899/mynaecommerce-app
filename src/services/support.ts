import { useCallback, useEffect, useMemo, useState } from 'react';
import { Query } from 'react-native-appwrite';
import { callApi, channels, tables } from '@/lib/appwrite';
import { config, TABLES } from '@/lib/config';
import type { SupportMessage, Ticket } from '@/lib/types';
import { isDelete, useRealtime } from '@/lib/useRealtime';

const byTime = (a: SupportMessage, b: SupportMessage) => a.$createdAt.localeCompare(b.$createdAt);

function upsert<T extends { $id: string }>(list: T[], row: T) {
  const i = list.findIndex((x) => x.$id === row.$id);
  if (i === -1) return [...list, row];
  const next = list.slice();
  next[i] = row;
  return next;
}

/**
 * Chat messages for one shopper, live. Shoppers only receive their own rows (row permissions);
 * admins receive everyone's, so we filter by userId either way.
 */
export function useSupportMessages(userId: string | undefined, limit = 60) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await tables.listRows<SupportMessage>({
        databaseId: config.dbId,
        tableId: TABLES.supportMessages,
        queries: [Query.equal('userId', userId), Query.orderDesc('$createdAt'), Query.limit(limit)],
      });
      setMessages(r.rows.sort(byTime));
    } finally {
      setLoading(false);
    }
  }, [userId, limit]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  useRealtime<SupportMessage>(userId ? [channels.table(TABLES.supportMessages)] : null, (e) => {
    if (e.payload.userId !== userId) return;
    if (isDelete(e)) setMessages((m) => m.filter((x) => x.$id !== e.payload.$id));
    else setMessages((m) => upsert(m, e.payload).sort(byTime));
  });

  return { messages, loading, refresh: load };
}

/** Tickets, live. `userId` scopes to one shopper; omit it (admins) to see all. */
export function useTickets(userId?: string) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const queries = [Query.orderDesc('$updatedAt'), Query.limit(100)];
    if (userId) queries.push(Query.equal('userId', userId));
    try {
      const r = await tables.listRows<Ticket>({ databaseId: config.dbId, tableId: TABLES.tickets, queries });
      setTickets(r.rows);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  useRealtime<Ticket>([channels.table(TABLES.tickets)], (e) => {
    if (userId && e.payload.userId !== userId) return;
    setTickets((t) => upsert(t, e.payload).sort((a, b) => b.$updatedAt.localeCompare(a.$updatedAt)));
  });

  const active = useMemo(() => tickets.find((t) => t.status !== 'resolved') ?? null, [tickets]);
  return { tickets, active, loading, refresh: load };
}

export const sendSupportMessage = (message: string) =>
  callApi<{ reply?: string; ticketId?: string | null; handedOff?: boolean }>('/support/chat', { message });

/** Admin only (checked by the server against the "admins" team). */
export const agentReply = (ticketId: string, message: string, status: Ticket['status'] = 'pending') =>
  callApi<{ ok: true }>('/support/agent-reply', { ticketId, message, status });

export const PRIORITY_COLOR: Record<Ticket['priority'], string> = { urgent: '#B3261E', high: '#B4654A', normal: '#C08A2E', low: '#9A9087' };
