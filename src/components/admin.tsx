import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, type } from '@/lib/theme';

export function StatTile({ label, value, delta, hint }: { label: string; value: string; delta?: number; hint?: string }) {
  const up = (delta ?? 0) >= 0;
  return (
    <View style={s.tile}>
      <Text style={type.label}>{label}</Text>
      <Text style={s.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {delta !== undefined ? (
        <Text style={{ fontSize: 12, fontWeight: '600', color: up ? colors.good : colors.danger }}>
          {up ? '▲' : '▼'} {Math.abs(Math.round(delta * 100))}% vs prev
        </Text>
      ) : hint ? (
        <Text style={type.small}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Minimal bar chart: one bar per day, value label on the tallest bar, first/last dates under the axis. */
export function BarChart({ data, format, color = colors.accent, height = 120 }: { data: { label: string; value: number }[]; format: (n: number) => string; color?: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.findIndex((d) => d.value === max);
  return (
    <View>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
        {data.map((d, i) => (
          <View key={d.label} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} accessibilityLabel={`${d.label}: ${format(d.value)}`}>
            {i === peak && d.value > 0 ? <Text style={s.peak}>{format(d.value)}</Text> : null}
            <View style={{ width: '100%', height: `${Math.max(2, (d.value / max) * 82)}%`, backgroundColor: d.value ? color : colors.line, borderRadius: 3 }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space(2) }}>
        <Text style={type.small}>{data[0]?.label}</Text>
        <Text style={type.small}>{data[data.length - 1]?.label}</Text>
      </View>
    </View>
  );
}

/** Pulses whenever `pulseKey` changes (a new realtime event arrived). */
export function LiveBadge({ pulseKey }: { pulseKey: number | null }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (pulseKey == null) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.8, duration: 180, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [pulseKey, scale]);
  return (
    <View style={s.live}>
      <Animated.View style={[s.liveDot, { transform: [{ scale }] }]} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.good }}>LIVE</Text>
    </View>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.seg}>
      {options.map((o) => (
        <Pressable key={String(o.value)} onPress={() => onChange(o.value)} style={[s.segBtn, value === o.value && s.segOn]} accessibilityState={{ selected: value === o.value }}>
          <Text style={{ fontWeight: '600', fontSize: 13, color: value === o.value ? colors.white : colors.ink }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone = status === 'delivered' ? colors.good : status === 'cancelled' ? colors.danger : status === 'shipped' ? colors.ok : colors.accent;
  return <Text style={[s.pill, { color: tone, borderColor: tone }]}>{status}</Text>;
}

const s = StyleSheet.create({
  tile: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(4), gap: space(1), borderWidth: 1, borderColor: colors.line },
  value: { fontSize: 24, fontWeight: '700', color: colors.ink, letterSpacing: -0.6 },
  peak: { fontSize: 10, fontWeight: '700', color: colors.ink, marginBottom: 2, width: 60, textAlign: 'center' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space(3), height: 28, borderRadius: radius.pill, backgroundColor: '#E4EFE6' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.good },
  seg: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, padding: 3 },
  segBtn: { paddingHorizontal: space(3), height: 30, borderRadius: radius.pill, justifyContent: 'center' },
  segOn: { backgroundColor: colors.ink },
  pill: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space(2), paddingVertical: 2, overflow: 'hidden' },
});
