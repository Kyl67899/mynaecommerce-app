import { Image } from 'expo-image';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Button, Empty, Stepper } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { money } from '@/lib/format';
import { colors, radius, space, type } from '@/lib/theme';

const FREE_SHIPPING = 5000;

export default function Cart() {
  const { items, subtotalCents, setQty, remove, syncing } = useCart();
  const { user } = useAuth();
  const toFree = Math.max(0, FREE_SHIPPING - subtotalCents);

  if (!items.length) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Empty
          icon="bag"
          title="Your bag is empty"
          body="Not sure where to start? A skin scan builds a routine for you."
          action={
            <View style={{ gap: space(3), marginTop: space(2), alignSelf: 'stretch' }}>
              <Button title="Start a skin scan" icon="scan" onPress={() => router.push('/scan')} />
              <Button title="Browse the shop" variant="secondary" onPress={() => router.push('/shop')} />
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: space(5), paddingTop: space(3), paddingBottom: space(2), flexDirection: 'row', alignItems: 'baseline', gap: space(2) }}>
        <Text style={type.h1}>Bag</Text>
        {syncing ? <Text style={type.small}>Syncing…</Text> : user ? <Text style={type.small}>Synced across your devices</Text> : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.productId}
        contentContainerStyle={{ padding: space(5), gap: space(4) }}
        renderItem={({ item }) => (
          <View style={s.line}>
            <Pressable onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.productId } })}>
              <Image source={item.imageUrl} style={s.thumb} contentFit="cover" />
            </Pressable>
            <View style={{ flex: 1, gap: space(2) }}>
              <View style={{ flexDirection: 'row', gap: space(2) }}>
                <Text style={{ flex: 1, fontWeight: '600', color: colors.ink }} numberOfLines={2}>
                  {item.name}
                </Text>
                <Pressable hitSlop={10} onPress={() => remove(item.productId)} accessibilityLabel={`Remove ${item.name}`}>
                  <Icon name="close" size={18} color={colors.muted} />
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Stepper value={item.qty} onChange={(n) => setQty(item.productId, n)} />
                <Text style={{ fontWeight: '700', color: colors.ink }}>{money(item.priceCents * item.qty)}</Text>
              </View>
            </View>
          </View>
        )}
      />

      <View style={s.summary}>
        <Text style={type.small}>{toFree > 0 ? `Add ${money(toFree)} more for free shipping` : 'You’ve unlocked free shipping'}</Text>
        <View style={s.progress}>
          <View style={{ width: `${Math.min(100, (subtotalCents / FREE_SHIPPING) * 100)}%`, height: '100%', backgroundColor: colors.good, borderRadius: radius.pill }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space(2) }}>
          <Text style={type.body}>Subtotal</Text>
          <Text style={[type.body, { fontWeight: '700' }]}>{money(subtotalCents)}</Text>
        </View>
        <Button
          title={user ? 'Checkout' : 'Sign in to checkout'}
          icon="lock"
          onPress={() => router.push(user ? '/checkout' : '/sign-in')}
          style={{ marginTop: space(2) }}
        />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  line: { flexDirection: 'row', gap: space(4), backgroundColor: colors.surface, padding: space(3), borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  thumb: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  summary: { padding: space(5), gap: space(2), borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  progress: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
});
