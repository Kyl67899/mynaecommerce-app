import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Segmented, StatusPill } from '@/components/admin';
import { Button, Empty } from '@/components/ui';
import { money } from '@/lib/format';
import { colors, radius, space, type } from '@/lib/theme';
import type { OrderRow } from '@/lib/types';
import { ORDER_FLOW, setOrderStatus, useAllOrders } from '@/services/admin';
import { orderLines } from '@/services/orders';

type Filter = 'open' | 'all';

export default function AdminOrders() {
  const { orders, loading, refresh } = useAllOrders(200);
  const [filter, setFilter] = useState<Filter>('open');
  const shown = filter === 'open' ? orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled') : orders;

  if (loading) return <ActivityIndicator style={{ marginTop: space(16) }} color={colors.ink} />;

  return (
    <FlatList
      data={shown}
      keyExtractor={(o) => o.$id}
      onRefresh={refresh}
      refreshing={false}
      contentContainerStyle={{ padding: space(5), gap: space(4) }}
      ListHeaderComponent={
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={type.small}>Status changes reach the customer’s app instantly.</Text>
          <Segmented<Filter> options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} value={filter} onChange={setFilter} />
        </View>
      }
      ListEmptyComponent={<Empty icon="box" title={filter === 'open' ? 'No open orders' : 'No orders yet'} />}
      renderItem={({ item }) => <AdminOrderCard order={item} />}
    />
  );
}

function AdminOrderCard({ order }: { order: OrderRow }) {
  const [busy, setBusy] = useState(false);
  const idx = ORDER_FLOW.indexOf(order.status);
  const next = idx >= 0 && idx < ORDER_FLOW.length - 1 ? ORDER_FLOW[idx + 1] : null;
  const lines = orderLines(order);

  async function move(status: OrderRow['status']) {
    setBusy(true);
    try {
      await setOrderStatus(order.$id, status);
    } catch (e: any) {
      Alert.alert('Could not update order', e?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
        <Text style={{ flex: 1, fontWeight: '700', color: colors.ink }}>#{order.$id.slice(-6).toUpperCase()}</Text>
        <StatusPill status={order.status} />
      </View>
      <Text style={type.small}>
        {new Date(order.$createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {money(order.totalCents)}
      </Text>
      {lines.map((l) => (
        <Text key={l.productId} style={type.body} numberOfLines={1}>
          {l.qty} × {l.name}
        </Text>
      ))}
      {/* Shipping address stays encrypted with the customer's key; fulfilment would decrypt it in a server function. */}
      {next || order.status !== 'cancelled' ? (
        <View style={{ flexDirection: 'row', gap: space(2), marginTop: space(1) }}>
          {next && <Button title={`Mark ${next}`} loading={busy} onPress={() => move(next)} style={{ flex: 1, height: 44 }} />}
          {order.status !== 'cancelled' && order.status !== 'delivered' && (
            <Button
              title="Cancel"
              variant="secondary"
              disabled={busy}
              style={{ height: 44 }}
              onPress={() =>
                Alert.alert('Cancel this order?', undefined, [
                  { text: 'Keep', style: 'cancel' },
                  { text: 'Cancel order', style: 'destructive', onPress: () => move('cancelled') },
                ])
              }
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(4), gap: space(2), borderWidth: 1, borderColor: colors.line },
});
