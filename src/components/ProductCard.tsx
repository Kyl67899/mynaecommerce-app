import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCart } from '@/context/CartContext';
import { money } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';
import { safeHttpsUrl } from '@/lib/sanitize';
import type { Product } from '@/lib/types';
import { Icon } from './Icon';

export function ProductCard({ product, width, reason }: { product: Product; width: number; reason?: string }) {
  const { add } = useCart();
  const soldOut = product.stock <= 0;
  const low = !soldOut && product.stock <= 5;
  const onSale = !!product.compareAtCents && product.compareAtCents > product.priceCents;

  return (
    <Link href={{ pathname: '/product/[id]', params: { id: product.$id } }} asChild>
      <Pressable style={StyleSheet.flatten([s.card, { width }])} accessibilityLabel={`${product.name}, ${money(product.priceCents)}`}>
        <View style={[s.imageWrap, { height: width }]}>
          <Image source={safeHttpsUrl(product.imageUrl) ?? undefined} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          {soldOut ? <Text style={[s.badge, s.badgeDark]}>Sold out</Text> : low ? <Text style={s.badge}>Only {product.stock} left</Text> : onSale ? <Text style={s.badge}>Sale</Text> : null}
          {!soldOut && (
            <Pressable
              hitSlop={8}
              onPress={(e) => {
                e.preventDefault();
                add(product);
              }}
              style={s.quickAdd}
              accessibilityLabel={`Add ${product.name} to bag`}
            >
              <Icon name="plus" size={18} />
            </Pressable>
          )}
        </View>
        <View style={{ gap: 2, paddingHorizontal: 2 }}>
          {reason ? <Text style={s.reason} numberOfLines={1}>For {reason}</Text> : null}
          <Text style={s.name} numberOfLines={2}>
            {product.name}
          </Text>
          <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'baseline' }}>
            <Text style={s.price}>{money(product.priceCents)}</Text>
            {onSale ? <Text style={s.compare}>{money(product.compareAtCents!)}</Text> : null}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const s = StyleSheet.create({
  card: { gap: space(2) },
  imageWrap: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  badge: {
    position: 'absolute',
    top: space(2),
    left: space(2),
    backgroundColor: colors.accent,
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: space(2),
    paddingVertical: 3,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  badgeDark: { backgroundColor: colors.ink },
  quickAdd: {
    position: 'absolute',
    right: space(2),
    bottom: space(2),
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reason: { fontSize: 11, fontWeight: '600', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontSize: 14, fontWeight: '500', color: colors.ink, lineHeight: 19 },
  price: { fontSize: 14, fontWeight: '700', color: colors.ink },
  compare: { fontSize: 13, color: colors.muted, textDecorationLine: 'line-through' },
});
