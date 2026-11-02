import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { ProductCard } from '@/components/ProductCard';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { CATEGORIES } from '@/lib/format';
import { colors, radius, space, type } from '@/lib/theme';
import { useProducts } from '@/services/products';

export default function Home() {
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { products, loading, error, refresh } = useProducts({ featured: true, limit: 10 });
  const cardW = Math.min(180, width * 0.44);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space(10) }} refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
        <View style={s.topbar}>
          <Text style={s.logo}>myna</Text>
          <Pressable onPress={() => router.push('/shop')} hitSlop={10} accessibilityLabel="Search products">
            <Icon name="search" />
          </Pressable>
        </View>

        {/* Hero: the skin scan is the store's signature feature */}
        <LinearGradient colors={['#E9D3C4', '#F3E7DC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <Text style={type.label}>{user ? `Hi ${user.name.split(' ')[0] || 'there'}` : 'New · AI skin analysis'}</Text>
          <Text style={[type.display, { marginTop: space(2) }]}>Know your skin.{'\n'}Shop what it needs.</Text>
          <Text style={[type.body, { color: colors.inkSoft, marginTop: space(2), maxWidth: 300 }]}>
            One selfie scores 12 skin concerns in seconds, then builds your routine from our shelf.
          </Text>
          <Button title="Start my skin scan" icon="scan" style={{ marginTop: space(5), alignSelf: 'flex-start' }} onPress={() => router.push('/scan')} />
          <View style={s.trust}>
            <Icon name="lock" size={14} color={colors.inkSoft} />
            <Text style={type.small}>Results are AES-256 encrypted to your account</Text>
          </View>
        </LinearGradient>

        <Text style={[type.h2, s.sectionTitle]}>Shop by category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space(5), gap: space(3) }}>
          {CATEGORIES.filter((c) => c.key !== 'all').map((c) => (
            <Pressable key={c.key} style={s.category} onPress={() => router.push({ pathname: '/shop', params: { category: c.key } })}>
              <Text style={{ fontWeight: '600', color: colors.ink }}>{c.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={[s.rowBetween, s.sectionTitle]}>
          <Text style={type.h2}>Bestsellers</Text>
          <Pressable onPress={() => router.push('/shop')}>
            <Text style={{ color: colors.accent, fontWeight: '600' }}>See all</Text>
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginTop: space(6) }} color={colors.ink} />
        ) : error ? (
          <Text style={[type.small, { paddingHorizontal: space(5) }]}>{error}</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space(5), gap: space(4) }}>
            {products.map((p) => (
              <ProductCard key={p.$id} product={p} width={cardW} />
            ))}
          </ScrollView>
        )}

        <View style={s.promo}>
          <Text style={[type.h2, { color: colors.white }]}>Free shipping over $50</Text>
          <Text style={{ color: '#E8DED4', marginTop: space(1) }}>Stock and prices update live, so what you see is what ships.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space(5), paddingVertical: space(3) },
  logo: { fontSize: 28, fontWeight: '800', letterSpacing: -1.2, color: colors.ink },
  hero: { marginHorizontal: space(5), borderRadius: radius.lg, padding: space(6) },
  trust: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), marginTop: space(4) },
  sectionTitle: { paddingHorizontal: space(5), marginTop: space(8), marginBottom: space(4) },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: {
    paddingHorizontal: space(5),
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
  },
  promo: { margin: space(5), marginTop: space(8), backgroundColor: colors.ink, borderRadius: radius.lg, padding: space(6) },
});
