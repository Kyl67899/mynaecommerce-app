import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart, LiveBadge, Segmented, StatTile, StatusPill } from '@/components/admin';
import { Icon } from '@/components/Icon';
import { Button, Card } from '@/components/ui';
import { computeMetrics, FOCUS_THRESHOLD } from '@/lib/analytics';
import { concernLabel, money, skinTypeLabel } from '@/lib/format';
import { colors, radius, space, type } from '@/lib/theme';
import { useAllOrders, useEvents } from '@/services/admin';
import { PRIORITY_COLOR, useTickets } from '@/services/support';
import { useProducts } from '@/services/products';

const RANGES = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
];

export default function AdminDashboard() {
  const [days, setDays] = useState(7);
  const { events, loading, lastEventAt, refresh } = useEvents(days);
  const { products } = useProducts();
  const { orders } = useAllOrders(10);
  const { tickets } = useTickets();
  const openTickets = tickets.filter((t) => t.status === 'open');
  const urgent = openTickets.filter((t) => t.priority === 'urgent' || t.priority === 'high').length;
  const m = useMemo(() => computeMetrics(events, products, days), [events, products, days]);
  const shortDate = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <ScrollView contentContainerStyle={{ padding: space(5), gap: space(6), paddingBottom: space(16) }} refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
      <View style={s.header}>
        <View style={{ gap: space(1) }}>
          <Text style={type.h1}>Dashboard</Text>
          <LiveBadge pulseKey={lastEventAt} />
        </View>
        <Segmented options={RANGES} value={days} onChange={setDays} />
      </View>

      {m.hasDemo && (
        <Text style={[type.small, s.demo]}>Includes sample data from setup (SEED_DEMO_ANALYTICS). Real orders and scans are added on top, live.</Text>
      )}

      {loading ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <>
          <Pressable onPress={() => router.push('/admin/support')} style={[s.inbox, urgent > 0 && { borderColor: PRIORITY_COLOR.urgent }]}>
            <Icon name="user" size={20} color={urgent ? PRIORITY_COLOR.urgent : colors.ink} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>Support inbox · {openTickets.length} open</Text>
              <Text style={type.small}>{urgent ? `${urgent} high-priority handoff${urgent === 1 ? '' : 's'} from the AI assistant` : 'Tickets the AI assistant handed to a person'}</Text>
            </View>
            <Icon name="chevron" size={16} color={colors.muted} />
          </Pressable>

          <View style={s.grid}>
            <StatTile label="Revenue" value={money(m.revenueCents)} delta={m.deltas.revenue} />
            <StatTile label="Orders" value={String(m.orders)} delta={m.deltas.orders} />
            <StatTile label="Skin scans" value={String(m.scans)} delta={m.deltas.scans} />
            <StatTile label="Sign-ups" value={String(m.signups)} delta={m.deltas.signups} />
            <StatTile label="Avg order" value={money(m.aovCents)} hint={`${m.units} units sold`} />
            <StatTile label="Avg skin score" value={m.avgSkinScore != null ? String(m.avgSkinScore) : '—'} hint="across all scans" />
          </View>

          <Card style={{ gap: space(4) }}>
            <Text style={type.h2}>Revenue by day</Text>
            <BarChart data={m.daily.map((d) => ({ label: shortDate(d.day), value: d.revenueCents }))} format={(n) => money(n).replace('.00', '')} />
          </Card>

          <Card style={{ gap: space(4) }}>
            <Text style={type.h2}>Scans by day</Text>
            <BarChart data={m.daily.map((d) => ({ label: shortDate(d.day), value: d.scans }))} format={String} color={colors.good} height={90} />
          </Card>

          {/* The bridge between skin analysis and merchandising */}
          <Card style={{ gap: space(3) }}>
            <Text style={type.h2}>What customers’ skin needs</Text>
            <Text style={type.small}>
              Share of scans scoring below {FOCUS_THRESHOLD} per concern, and how many in-stock products target it. Gaps are where a new product would get
              recommended most.
            </Text>
            {m.concernDemand.length === 0 ? (
              <Text style={type.small}>No scans in this period yet.</Text>
            ) : (
              m.concernDemand.map((c) => (
                <View key={c.key} style={{ gap: space(1.5) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                    <Text style={{ flex: 1, fontWeight: '600', color: colors.ink }}>{concernLabel(c.key)}</Text>
                    <Text style={type.small}>
                      {Math.round(c.focusShare * 100)}% · {c.coverage} product{c.coverage === 1 ? '' : 's'}
                    </Text>
                    {c.gap && (
                      <Pressable onPress={() => router.push({ pathname: '/admin/product/[id]', params: { id: 'new', concern: c.key } })} style={s.gapBtn}>
                        <Text style={{ color: colors.white, fontSize: 11, fontWeight: '700' }}>+ Add</Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={s.track}>
                    <View style={{ width: `${Math.max(2, c.focusShare * 100)}%`, height: '100%', borderRadius: radius.pill, backgroundColor: c.gap ? colors.accent : colors.ok }} />
                  </View>
                </View>
              ))
            )}
          </Card>

          {m.skinTypeMix.length > 0 && (
            <Card style={{ gap: space(3) }}>
              <Text style={type.h2}>Customers’ skin types</Text>
              <Text style={type.small}>From skin-type detections this period, with how many in-stock products are made for each.</Text>
              {m.skinTypeMix.map((t) => (
                <View key={t.key} style={{ gap: space(1.5) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                    <Text style={{ flex: 1, fontWeight: '600', color: colors.ink }}>{skinTypeLabel(t.key)}</Text>
                    <Text style={type.small}>
                      {Math.round(t.share * 100)}% · {t.coverage} product{t.coverage === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View style={s.track}>
                    <View style={{ width: `${Math.max(2, t.share * 100)}%`, height: '100%', borderRadius: radius.pill, backgroundColor: colors.ink }} />
                  </View>
                </View>
              ))}
            </Card>
          )}

          <Card style={{ gap: space(3) }}>
            <Text style={type.h2}>Top products</Text>
            {m.topProducts.length === 0 ? <Text style={type.small}>No sales in this period yet.</Text> : null}
            {m.topProducts.map((p, i) => (
              <View key={p.productId} style={s.row}>
                <Text style={{ width: 20, fontWeight: '700', color: colors.muted }}>{i + 1}</Text>
                <Text style={{ flex: 1, color: colors.ink }} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={type.small}>{p.units} sold</Text>
                <Text style={{ width: 72, textAlign: 'right', fontWeight: '600', color: colors.ink }}>{money(p.revenueCents)}</Text>
              </View>
            ))}
          </Card>

          {m.lowStock.length > 0 && (
            <Card style={{ gap: space(3) }}>
              <Text style={type.h2}>Low stock</Text>
              {m.lowStock.slice(0, 6).map((p) => (
                <Pressable key={p.$id} style={s.row} onPress={() => router.push({ pathname: '/admin/product/[id]', params: { id: p.$id } })}>
                  <Text style={{ flex: 1, color: colors.ink }} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={{ fontWeight: '700', color: p.stock === 0 ? colors.danger : colors.accent }}>{p.stock === 0 ? 'Sold out' : `${p.stock} left`}</Text>
                  <Icon name="chevron" size={16} color={colors.muted} />
                </Pressable>
              ))}
            </Card>
          )}

          <Card style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={type.h2}>Latest orders</Text>
              <Pressable onPress={() => router.push('/admin/orders')}>
                <Text style={{ color: colors.accent, fontWeight: '600' }}>Manage</Text>
              </Pressable>
            </View>
            {orders.length === 0 ? <Text style={type.small}>No orders yet.</Text> : null}
            {orders.slice(0, 5).map((o) => (
              <View key={o.$id} style={s.row}>
                <Text style={{ flex: 1, fontWeight: '600', color: colors.ink }}>#{o.$id.slice(-6).toUpperCase()}</Text>
                <StatusPill status={o.status} />
                <Text style={{ width: 72, textAlign: 'right', fontWeight: '600', color: colors.ink }}>{money(o.totalCents)}</Text>
              </View>
            ))}
          </Card>

          <View style={{ gap: space(3) }}>
            <Button title="Add a product" icon="plus" onPress={() => router.push({ pathname: '/admin/product/[id]', params: { id: 'new' } })} />
            <Button title="Manage products" variant="secondary" icon="grid" onPress={() => router.push('/admin/products')} />
            <Button title="Back to store" variant="ghost" onPress={() => router.replace('/')} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  demo: { backgroundColor: colors.accentSoft, padding: space(3), borderRadius: radius.md },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 32 },
  inbox: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(4), borderWidth: 1.5, borderColor: colors.line },
  gapBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space(2), paddingVertical: 3 },
});
