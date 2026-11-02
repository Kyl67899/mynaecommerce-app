import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Button, Stepper } from '@/components/ui';
import { concernLabel, money } from '@/lib/format';
import { colors, radius, space, type } from '@/lib/theme';
import type { Product } from '@/lib/types';
import { updateProduct } from '@/services/admin';
import { useProducts } from '@/services/products';

export default function AdminProducts() {
  const { products, loading, refresh } = useProducts();
  const [q, setQ] = useState('');
  const shown = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));

  if (loading) return <ActivityIndicator style={{ marginTop: space(16) }} color={colors.ink} />;

  return (
    <FlatList
      data={shown}
      keyExtractor={(p) => p.$id}
      onRefresh={refresh}
      refreshing={false}
      contentContainerStyle={{ padding: space(5), gap: space(3), paddingBottom: space(16) }}
      ListHeaderComponent={
        <View style={{ gap: space(3), marginBottom: space(2) }}>
          <Button title="Add a product" icon="plus" onPress={() => router.push({ pathname: '/admin/product/[id]', params: { id: 'new' } })} />
          <TextInput value={q} onChangeText={setQ} placeholder="Filter products" placeholderTextColor={colors.muted} style={s.search} />
          <Text style={type.small}>Stock changes go live in every shopper’s app immediately.</Text>
        </View>
      }
      renderItem={({ item }) => <Row p={item} />}
    />
  );
}

function Row({ p }: { p: Product }) {
  const [saving, setSaving] = useState(false);
  const setStock = async (stock: number) => {
    setSaving(true);
    try {
      await updateProduct(p.$id, { stock: Math.max(0, stock) });
    } catch (e: any) {
      Alert.alert('Could not update stock', e?.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={s.row}>
      <Pressable onPress={() => router.push({ pathname: '/admin/product/[id]', params: { id: p.$id } })} style={{ flexDirection: 'row', gap: space(3), flex: 1 }}>
        <Image source={p.imageUrl} style={s.thumb} contentFit="cover" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontWeight: '600', color: colors.ink }} numberOfLines={1}>
            {p.featured ? '★ ' : ''}
            {p.name}
          </Text>
          <Text style={type.small}>
            {money(p.priceCents)} · {p.category}
          </Text>
          <Text style={[type.small, { color: colors.accent }]} numberOfLines={1}>
            {(p.concerns ?? []).map(concernLabel).join(', ') || 'No concerns tagged'}
          </Text>
        </View>
      </Pressable>
      <View style={{ alignItems: 'flex-end', gap: space(1) }}>
        <Stepper value={p.stock} onChange={setStock} max={99999} />
        <Text style={[type.small, p.stock === 0 && { color: colors.danger }]}>{saving ? 'Saving…' : p.stock === 0 ? 'Sold out' : 'in stock'}</Text>
      </View>
      <Icon name="chevron" size={16} color={colors.muted} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: colors.surface, padding: space(3), borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  search: { height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: space(4), fontSize: 15, color: colors.ink },
});
