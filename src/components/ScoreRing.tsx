import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { concernLabel, scoreBand } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';

export function ScoreRing({ score, size = 148, label = 'Skin score' }: { score: number; size?: number; label?: string }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const band = scoreBand(score);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${label} ${score} out of 100`}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors[band.tone]}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={{ fontSize: size * 0.3, fontWeight: '700', color: colors.ink, letterSpacing: -1 }}>{score}</Text>
      <Text style={{ fontSize: 12, color: colors.inkSoft }}>{label}</Text>
    </View>
  );
}

export function ConcernBar({ k, score }: { k: string; score: number }) {
  const band = scoreBand(score);
  return (
    <View style={{ gap: space(1.5) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: colors.ink }}>{concernLabel(k)}</Text>
        <Text style={{ fontSize: 13, color: colors[band.tone], fontWeight: '600' }}>
          {score} · {band.label}
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(4, score)}%`, height: '100%', borderRadius: radius.pill, backgroundColor: colors[band.tone] }} />
      </View>
    </View>
  );
}
