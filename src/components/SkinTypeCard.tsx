import { StyleSheet, Text, View } from 'react-native';
import { SKIN_TYPES } from '@/lib/format';
import { colors, radius, space, type } from '@/lib/theme';
import type { SkinType } from '@/lib/types';
import { Card } from './ui';

const ZONE_LABEL = { t_zone: 'T-zone (forehead, nose, chin)', u_zone: 'U-zone (cheeks, jaw)' } as const;

/** Shows the detected skin type, zone breakdown, and what it means for a routine. */
export function SkinTypeCard({ skinType, compact }: { skinType: SkinType; compact?: boolean }) {
  const tips = [SKIN_TYPES.find((t) => t.key === skinType.base)?.tip, skinType.sensitive ? SKIN_TYPES.find((t) => t.key === 'sensitive')?.tip : null].filter(Boolean);
  return (
    <Card style={{ gap: space(3) }}>
      <Text style={type.label}>Your skin type</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2), alignItems: 'center' }}>
        <Text style={s.badge}>{skinType.label}</Text>
        <Text style={type.small}>{skinType.source === 'youcam' ? 'Detected by YouCam AI' : 'Estimated from your oil, hydration and redness scores'}</Text>
      </View>
      {!compact && skinType.zones ? (
        <View style={{ gap: space(1.5) }}>
          {(Object.keys(skinType.zones) as (keyof typeof ZONE_LABEL)[]).map((z) => (
            <View key={z} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={type.small}>{ZONE_LABEL[z]}</Text>
              <Text style={{ fontWeight: '600', color: colors.ink }}>{skinType.zones![z]}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {!compact && tips.map((t) => <Text key={t} style={type.body}>{t}</Text>)}
    </Card>
  );
}

const s = StyleSheet.create({
  badge: { backgroundColor: colors.ink, color: colors.white, fontWeight: '700', fontSize: 15, paddingHorizontal: space(3), paddingVertical: space(1.5), borderRadius: radius.pill, overflow: 'hidden' },
});
