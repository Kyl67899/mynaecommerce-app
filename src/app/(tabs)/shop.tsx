import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { ProductCard } from '@/components/ProductCard';
import { Empty, Pill } from '@/components/ui';
import { CATEGORIES } from '@/lib/format';
import { colors, radius, space, type } from '@/lib/theme';
import { useProducts } from '@/services/products';

export default function Shop() {
  const params = useLocalSearchParams<{ category?: string }>();
  const { width } = useWindowDimensions();
  const [category, setCategory] = useState(params.category ?? 'all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  // When a link opens Shop with a new ?category=, switch to it (adjusting state during render,
  // which React prefers over a setState inside an effect).
  const [lastParam, setLastParam] = useState(params.category);
  if (params.category !== lastParam) {
    setLastParam(params.category);
    if (params.category) setCategory(params.category);
  }

  // Debounce typing so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { products, loading, error, refresh } = useProducts({ category, search });
  const gap = space(4);
  const cardW = (width - space(5) * 2 - gap) / 2;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: space(5), paddingTop: space(3), gap: space(4) }}>
        <Text style={type.h1}>Shop</Text>
        <View style={s.search}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search serums, SPF, cleansers…"
            placeholderTextColor={colors.muted}
            style={{ flex: 1, fontSize: 16, color: colors.ink }}
            returnKeyType="search"
            autoCorrect={false}
          />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: space(5), paddingVertical: space(4), gap: space(2) }}>
        {CATEGORIES.map((c) => (
          <Pill key={c.key} label={c.label} active={category === c.key} onPress={() => setCategory(c.key)} />
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: space(10) }} color={colors.ink} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.$id}
          numColumns={2}
          columnWrapperStyle={{ gap, paddingHorizontal: space(5) }}
          contentContainerStyle={{ gap: space(6), paddingBottom: space(10) }}
          onRefresh={refresh}
          refreshing={false}
          renderItem={({ item }) => <ProductCard product={item} width={cardW} />}
          ListEmptyComponent={<Empty icon="search" title={error ? 'Could not load products' : 'No matches'} body={error ?? 'Try another search or category.'} />}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space(4),
  },
});
