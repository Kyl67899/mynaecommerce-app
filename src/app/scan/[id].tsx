import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ProductCard } from '@/components/ProductCard';
import { ConcernBar, ScoreRing } from '@/components/ScoreRing';
import { Button, Card, Empty } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { SkinTypeCard } from '@/components/SkinTypeCard';
import { concernLabel } from '@/lib/format';
import { forSkinType, recommend } from '@/lib/recommend';
import { colors, space, type } from '@/lib/theme';
import { safeId } from '@/lib/sanitize';
import { useProducts } from '@/services/products';
import { deleteScan, useScan } from '@/services/scans';

const STEPS = ['Uploading securely', 'Mapping your face', 'Scoring your concerns', 'Detecting skin type', 'Encrypting your results'];

export default function ScanReport() {
  const id = safeId(useLocalSearchParams<{ id: string }>().id); // deep-link params are untrusted
  const { user } = useAuth();
  const { add } = useCart();
  const { width } = useWindowDimensions();
  const { row, result, error, status } = useScan(user?.$id, id);
  // Live catalog: a product an admin publishes (or restocks) shows up in this routine immediately.
  const { products: catalog } = useProducts();
  const [step, setStep] = useState(0);

  // Friendly progress copy while the function works (the real state arrives over Realtime).
  useEffect(() => {
    if (status !== 'processing') return;
    const t = setInterval(() => setStep((n) => Math.min(n + 1, STEPS.length - 1)), 3500);
    return () => clearInterval(t);
  }, [status]);

  const picks = useMemo(() => (result ? recommend(catalog, result) : []), [catalog, result]);
  const typeShelf = useMemo(() => forSkinType(catalog, result?.skinType), [catalog, result]);
  const cardW = (width - space(5) * 2 - space(4)) / 2;

  if (error || status === 'error') {
    return (
      <Empty
        icon="camera"
        title="Let’s retake that"
        body={error ?? row?.error ?? 'The analysis could not finish.'}
        action={
          <View style={{ gap: space(3), alignSelf: 'stretch', marginTop: space(2) }}>
            <Button title="Try again" onPress={() => router.replace('/scan')} />
            <Button title="Get help" variant="secondary" onPress={() => router.push('/support')} />
          </View>
        }
      />
    );
  }

  if (!result) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[type.h2, { marginTop: space(5) }]}>{STEPS[step]}…</Text>
        <Text style={[type.small, { marginTop: space(2) }]}>This usually takes 10–20 seconds.</Text>
      </View>
    );
  }

  const focus = result.concerns.filter((c) => c.score < 75).slice(0, 3);

  return (
    <ScrollView contentContainerStyle={{ padding: space(5), gap: space(6), paddingBottom: space(12) }}>
      <Card style={{ alignItems: 'center', gap: space(3), paddingVertical: space(6) }}>
        <ScoreRing score={result.overall} />
        {result.mode ? <Text style={type.label}>{result.mode.toUpperCase()} analysis</Text> : null}
        {result.skinAge != null && <Text style={type.body}>Estimated skin age: {result.skinAge}</Text>}
        <Text style={[type.small, { textAlign: 'center' }]}>
          {focus.length
            ? `Focus on ${focus.map((c) => concernLabel(c.key).toLowerCase()).join(', ')}.`
            : 'Your skin is in great shape across the board. Keep protecting it.'}
        </Text>
      </Card>

      {result.skinType ? <SkinTypeCard skinType={result.skinType} /> : null}

      {typeShelf.length > 0 && result.skinType && (
        <View style={{ gap: space(3) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
            <Text style={[type.h2, { flex: 1 }]}>For {result.skinType.label.toLowerCase()} skin</Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.good }}>● LIVE</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(4) }}>
            {typeShelf.map((p) => (
              <ProductCard key={p.$id} product={p} width={150} />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ gap: space(4) }}>
        <Text style={type.h2}>Your breakdown</Text>
        {result.concerns.map((c) => (
          <ConcernBar key={c.key} k={c.key} score={c.score} />
        ))}
        <Text style={type.small}>Higher is healthier. Scores are cosmetic guidance, not a medical diagnosis.</Text>
      </View>

      {picks.length > 0 && (
        <View style={{ gap: space(4) }}>
          <Text style={type.h2}>Your myna routine</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(4) }}>
            {picks.map(({ product, matched, typeMatch }) => (
              <ProductCard
                key={product.$id}
                product={product}
                width={cardW}
                reason={[...matched.map(concernLabel).slice(0, 2), ...(typeMatch && result.skinType ? [`${result.skinType.base} skin`] : [])].slice(0, 2).join(' + ')}
              />
            ))}
          </View>
          <Button
            title="Add whole routine to bag"
            icon="bag"
            onPress={() => {
              picks.forEach(({ product }) => add(product));
              router.push('/cart');
            }}
          />
        </View>
      )}

      <Button
        title="Delete this scan"
        variant="ghost"
        icon="trash"
        onPress={() =>
          Alert.alert('Delete scan?', 'This removes the photo and results permanently.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                if (row) await deleteScan(row).catch(() => {});
                router.back();
              },
            },
          ])
        }
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(8), backgroundColor: colors.bg },
});
