import { useEffect, useRef } from 'react';
import type { RealtimeResponseEvent } from 'react-native-appwrite';
import { client } from './appwrite';

/**
 * Subscribes to Appwrite Realtime channels while the component is mounted.
 * Pass `null` to pause (e.g. while signed out). The callback can change freely
 * without re-subscribing.
 */
export function useRealtime<T>(channels: string[] | null, onEvent: (e: RealtimeResponseEvent<T>) => void) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  const key = channels?.join('|') ?? '';

  useEffect(() => {
    if (!key) return;
    const unsubscribe = client.subscribe<T>(key.split('|'), (e) => cb.current(e));
    return () => unsubscribe();
  }, [key]);
}

export const isDelete = (e: { events: string[] }) => e.events.some((ev) => ev.endsWith('.delete'));
