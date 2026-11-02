import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Empty } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { money } from '@/lib/format';
import { colors, radius, space, type } from '@/lib/theme';
import type { OrderRow, ShippingAddress } from '@/lib/types';
import { decryptAddress, orderLines, useOrders } from '@/services/orders';

const STATUS_STEPS: OrderRow['status'][] = ['placed', 'packed', 'shipped', 'delivered'];

export default function Orders() {
  const { user } = useAuth();
  const { orders, loading, refresh } = useOrders(user?.$id);

  if (!user) return <Empty icon="lock" title="Sign in to see orders" action={<Button title="Sign in" onPress={() => router.replace('/sign-in')} />} />;
  if (loading) return <ActivityIndicator style={{ marginTop: space(16) }} color={colors.ink} />;
  if (!orders.length) return <Empty icon="box" title="No orders yet" action={<Button title="Start shopping" onPress={() => router.replace('/shop')} />} />;

  return (
    <FlatList
      data={orders}
      keyExtractor={(o) => o.$id}
      onRefresh={refresh}
      refreshing={false}
      contentContainerStyle={{ padding: space(5), gap: space(4) }}
      renderItem={({ item }) => <OrderCard order={item} userId={user.$id} />}
    />
  );
}

function OrderCard({ order, userId }: { order: OrderRow; userId: string }) {
  const [address, setAddress] = useState<ShippingAddress | null>(null);
  const [open, setOpen] = useState(false);
  const lines = orderLines(order);
  const stepIndex = STATUS_STEPS.indexOf(order.status);

  async function toggle() {
    setOpen((o) => !o);
    if (!address) setAddress(await decryptAddress(userId, order).catch(() => null)); // decrypted on device only
  }

  return (
    <Pressable onPress={toggle} style={s.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '700', color: colors.ink }}>#{order.$id.slice(-6).toUpperCase()}</Text>
        <Text style={{ fontWeight: '700', color: colors.ink }}>{money(order.totalCents)}</Text>
      </View>
      <Text style={type.small}>{new Date(order.$createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</Text>

      {order.status === 'cancelled' ? (
        <Text style={{ color: colors.danger, fontWeight: '600' }}>Cancelled</Text>
      ) : (
        <View style={{ gap: space(2) }}>
          <View style={s.track}>
            {STATUS_STEPS.map((st, i) => (
              <View key={st} style={[s.trackSeg, i <= stepIndex && { backgroundColor: colors.good }]} />
            ))}
          </View>
          <Text style={{ fontWeight: '600', color: colors.good, textTransform: 'capitalize' }}>{order.status}</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: space(2) }}>
        {lines.slice(0, 5).map((l) => (
          <Image key={l.productId} source={l.imageUrl} style={s.thumb} contentFit="cover" />
        ))}
      </View>

      {open && (
        <View style={{ gap: space(2), marginTop: space(2) }}>
          {lines.map((l) => (
            <View key={l.productId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                {l.qty} × {l.name}
              </Text>
              <Text style={type.body}>{money(l.priceCents * l.qty)}</Text>
            </View>
          ))}
          <Text style={[type.small, { marginTop: space(2) }]}>Shipping {order.shippingCents ? money(order.shippingCents) : 'free'}</Text>
          {address ? (
            <Text style={type.small}>
              Ship to {address.name}, {address.line1}
              {address.line2 ? `, ${address.line2}` : ''}, {address.city} {address.state} {address.postalCode}, {address.country}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(4), gap: space(3), borderWidth: 1, borderColor: colors.line },
  track: { flexDirection: 'row', gap: space(1) },
  trackSeg: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
});
