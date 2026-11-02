import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { concernLabel, money } from '@/lib/format';
import { recommend } from '@/lib/recommend';
import { colors, radius, space, type } from '@/lib/theme';
import type { ScanResult, ScanRow } from '@/lib/types';
import { useOrders } from '@/services/orders';
import { useProducts } from '@/services/products';
import { decryptScan, listScans } from '@/services/scans';
import { ProductCard } from './ProductCard';
import { ScoreRing } from './ScoreRing';
import { SkinTypeCard } from './SkinTypeCard';
import { Button, Card } from './ui';

type Decrypted = { row: ScanRow; result: ScanResult };

/** The shopper's personal dashboard: skin progress, active order, and products matched to their latest scan. */
export function UserDashboard({ userId }: { userId: string }) {
  const [scans, setScans] = useState<Decrypted[] | null>(null);
  const { orders } = useOrders(userId);
  const { products } = useProducts();

  useFocusEffect(
    useCallback(() => {
      listScans(userId)
        .then(async (rows) => {
          const done = await Promise.all(
            rows.filter((r) => r.status === 'complete').map(async (row) => ({ row, result: await decryptScan(userId, row).catch(() => null) })),
          );
          setScans(done.filter((d): d is Decrypted => !!d.result));
        })
        .catch(() => setScans([]));
    }, [userId]),
  );

  const latest = scans?.[0]?.result;
  const previous = scans?.[1]?.result;
  const change = latest && previous ? latest.overall - previous.overall : null;
  const trend = (scans ?? []).slice(0, 8).reverse();
  const activeOrder = orders.find((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  const spentCents = orders.filter((o) => o.status !== 'cancelled').reduce((n, o) => n + o.totalCents, 0);

  // Picks for the latest scan that the shopper hasn't ordered yet (including products admins just added).
  const ordered = useMemo(() => new Set(orders.flatMap((o) => (JSON.parse(o.itemsJson || '[]') as { productId: string }[]).map((l) => l.productId))), [orders]);
  const picks = useMemo(() => (latest ? recommend(products, latest, 10).filter((r) => !ordered.has(r.product.$id)).slice(0, 4) : []), [products, latest, ordered]);

  return (
    <View style={{ gap: space(4) }}>
      <Text style={type.h2}>My dashboard</Text>

      {scans === null ? null : latest ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space(4) }}>
          <ScoreRing score={latest.overall} size={104} label="Latest" />
          <View style={{ flex: 1, gap: space(2) }}>
            {change != null && (
              <Text style={{ fontWeight: '700', color: change >= 0 ? colors.good : colors.danger }}>
                {change >= 0 ? '▲' : '▼'} {Math.abs(change)} since last scan
              </Text>
            )}
            <Text style={type.small}>Focus: {latest.concerns.slice(0, 2).map((c) => concernLabel(c.key)).join(', ')}</Text>
            {trend.length > 1 && (
              <View style={s.spark} accessibilityLabel="Skin score trend">
                {trend.map((t) => (
                  <View key={t.row.$id} style={{ flex: 1, height: `${Math.max(10, t.result.overall)}%`, backgroundColor: colors.accent, borderRadius: 2, opacity: 0.85 }} />
                ))}
              </View>
            )}
            <Pressable onPress={() => router.push({ pathname: '/scan/[id]', params: { id: scans![0].row.$id } })}>
              <Text style={{ color: colors.accent, fontWeight: '600' }}>View full report</Text>
            </Pressable>
          </View>
        </Card>
      ) : (
        <Card style={{ gap: space(3) }}>
          <Text style={type.body}>Scan your skin to get your score and a routine built for you.</Text>
          <Button title="Start a skin scan" icon="scan" onPress={() => router.push('/scan')} />
        </Card>
      )}

 {latest?.skinType ? <SkinTypeCard skinType={latest.skinType} compact /> : null}

      <View style={{ flexDirection: 'row', gap: space(3) }}>
        <Stat label="Scans" value={String(scans?.length ?? 0)} />
        <Stat label="Orders" value={String(orders.length)} />
        <Stat label="Spent" value={money(spentCents).replace('.00', '')} />
      </View>

      {activeOrder && (
        <Pressable onPress={() => router.push('/orders')}>
          <Card style={{ gap: space(2) }}>
            <Text style={type.label}>Order in progress</Text>
            <Text style={{ fontWeight: '700', color: colors.ink }}>
              #{activeOrder.$id.slice(-6).toUpperCase()} · <Text style={{ color: colors.good, textTransform: 'capitalize' }}>{activeOrder.status}</Text>
            </Text>
            <Text style={type.small}>Updates live as we pack and ship it.</Text>
          </Card>
        </Pressable>
      )}

      {picks.length > 0 && (
        <View style={{ gap: space(3) }}>
          <Text style={type.h2}>Picked for your skin</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(4) }}>
            {picks.map(({ product, matched }) => (
              <ProductCard key={product.$id} product={product} width={150} reason={matched.map(concernLabel).slice(0, 2).join(' + ')} />
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>{value}</Text>
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  spark: { height: 36, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(3), borderWidth: 1, borderColor: colors.line, gap: 2 },
});
