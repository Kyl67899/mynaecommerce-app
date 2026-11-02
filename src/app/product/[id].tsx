import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Button, Empty, Stepper } from '@/components/ui';
import { useCart } from '@/context/CartContext';
import { concernLabel, money } from '@/lib/format';
import { colors, radius, space, type } from '@/lib/theme';
import { safeHttpsUrl, safeId } from '@/lib/sanitize';
import { useProduct } from '@/services/products';

export default function ProductScreen() {
  const id = safeId(useLocalSearchParams<{ id: string }>().id); // deep-link params are untrusted
  const { product, error } = useProduct(id);
  const { add, items } = useCart();
  const { width } = useWindowDimensions();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  if (error) return <Empty icon="box" title="Not available" body={error} />;
  if (!product) return <ActivityIndicator style={{ marginTop: space(16) }} color={colors.ink} />;

  const inBag = items.find((i) => i.productId === product.$id)?.qty ?? 0;
  const maxQty = Math.max(0, Math.min(10, product.stock - inBag));
  const soldOut = product.stock <= 0;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space(8) }}>
        <View style={{ width, height: width, backgroundColor: colors.surfaceAlt }}>
          <Image source={safeHttpsUrl(product.imageUrl) ?? undefined} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        </View>
        <View style={{ padding: space(5), gap: space(3) }}>
          {product.brand ? <Text style={type.label}>{product.brand}</Text> : null}
          <Text style={type.h1}>{product.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>{money(product.priceCents)}</Text>
            {product.compareAtCents && product.compareAtCents > product.priceCents ? (
              <Text style={{ fontSize: 16, color: colors.muted, textDecorationLine: 'line-through' }}>{money(product.compareAtCents)}</Text>
            ) : null}
            {product.rating ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                <Icon name="star" size={16} color={colors.ok} fill={colors.ok} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>{product.rating.toFixed(1)}</Text>
              </View>
            ) : null}
          </View>

          {/* Live stock: updates instantly when anyone checks out */}
          <Text style={{ color: soldOut ? colors.danger : product.stock <= 5 ? colors.accent : colors.good, fontWeight: '600' }}>
            {soldOut ? 'Sold out' : product.stock <= 5 ? `Only ${product.stock} left` : 'In stock'}
          </Text>

          {product.description ? <Text style={[type.body, { color: colors.inkSoft }]}>{product.description}</Text> : null}

          {product.concerns?.length ? (
            <View style={{ gap: space(2), marginTop: space(2) }}>
              <Text style={type.label}>Targets</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
                {product.concerns.map((c) => (
                  <Text key={c} style={s.tag}>
                    {concernLabel(c)}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={s.footer}>
        {!soldOut && maxQty > 0 ? <Stepper value={Math.min(qty, maxQty)} onChange={(n) => setQty(Math.max(1, n))} max={maxQty} /> : null}
        <Button
          style={{ flex: 1 }}
          title={soldOut ? 'Sold out' : maxQty === 0 ? 'Max in bag' : added ? 'Added — view bag' : 'Add to bag'}
          disabled={soldOut || (maxQty === 0 && !added)}
          onPress={() => {
            if (added) return router.push('/cart');
            add(product, Math.min(qty, maxQty));
            setAdded(true);
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tag: {
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
    overflow: 'hidden',
  },
  footer: {
    flexDirection: 'row',
    gap: space(3),
    alignItems: 'center',
    paddingHorizontal: space(5),
    paddingTop: space(3),
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
});
