import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Segmented } from '@/components/admin';
import { Icon } from '@/components/Icon';
import { Empty } from '@/components/ui';
import { colors, radius, space, type } from '@/lib/theme';
import type { Ticket } from '@/lib/types';
import { PRIORITY_COLOR, useTickets } from '@/services/support';

type Filter = 'open' | 'pending' | 'resolved';
const RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

/** Support inbox: tickets the AI assistant handed off, live, most urgent first. */
export default function SupportInbox() {
  const { tickets, loading, refresh } = useTickets();
  const [filter, setFilter] = useState<Filter>('open');
  const shown = tickets.filter((t) => t.status === filter).sort((a, b) => RANK[a.priority] - RANK[b.priority] || b.$updatedAt.localeCompare(a.$updatedAt));
  const count = (st: Filter) => tickets.filter((t) => t.status === st).length;

  if (loading) return <ActivityIndicator style={{ marginTop: space(16) }} color={colors.ink} />;

  return (
    <FlatList
      data={shown}
      keyExtractor={(t) => t.$id}
      onRefresh={refresh}
      refreshing={false}
      contentContainerStyle={{ padding: space(5), gap: space(3) }}
      ListHeaderComponent={
        <View style={{ gap: space(3), marginBottom: space(2) }}>
          <Segmented<Filter>
            options={[
              { value: 'open', label: `Open ${count('open')}` },
              { value: 'pending', label: `Waiting ${count('pending')}` },
              { value: 'resolved', label: 'Resolved' },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <Text style={type.small}>Open = needs a reply. Waiting = you replied, waiting on the shopper. New tickets and replies appear live.</Text>
        </View>
      }
      ListEmptyComponent={<Empty icon="box" title={filter === 'open' ? 'Inbox zero' : 'Nothing here'} body={filter === 'open' ? 'The assistant is handling everything right now.' : undefined} />}
      renderItem={({ item }) => <TicketRow t={item} />}
    />
  );
}

function TicketRow({ t }: { t: Ticket }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/admin/ticket/[id]', params: { id: t.$id } })} style={s.row}>
      <View style={[s.dot, { backgroundColor: PRIORITY_COLOR[t.priority] }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
          <Text style={{ flex: 1, fontWeight: '700', color: colors.ink }} numberOfLines={1}>
            {t.userName || 'Shopper'} · {t.category.replace('_', ' ')}
          </Text>
          <Text style={type.small}>{new Date(t.$updatedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
        </View>
        <Text style={type.small} numberOfLines={2}>
          {t.lastMessage || t.subject}
        </Text>
        <Text style={{ fontSize: 11, fontWeight: '700', color: PRIORITY_COLOR[t.priority], textTransform: 'uppercase' }}>
          {t.priority}
          {t.assignee ? ` · ${t.assignee}` : ''}
        </Text>
      </View>
      <Icon name="chevron" size={16} color={colors.muted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: colors.surface, padding: space(4), borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
