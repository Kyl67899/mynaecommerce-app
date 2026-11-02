import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Button, Card, Field, Pill } from '@/components/ui';
import { computeMetrics, reach, scanSamples } from '@/lib/analytics';
import { CATEGORIES, concernLabel, PRODUCT_CONCERN_KEYS, SKIN_TYPES } from '@/lib/format';
import { colors, radius, space, type } from '@/lib/theme';
import { cleanText, safeHttpsUrl, safeId } from '@/lib/sanitize';
import { createProduct, deleteProduct, updateProduct, uploadProductImage, useEvents } from '@/services/admin';
import { getProduct, useProducts } from '@/services/products';

const CONCERN_KEYS = PRODUCT_CONCERN_KEYS;
const toCents = (s: string) => Math.round(parseFloat(s.replace(/[^0-9.]/g, '')) * 100);

export default function ProductEditor() {
  const params = useLocalSearchParams<{ id: string; concern?: string }>();
  const id = safeId(params.id) ?? 'new';
  const concern = PRODUCT_CONCERN_KEYS.includes(params.concern ?? '') ? params.concern : undefined;
  const isNew = id === 'new';
  const { events } = useEvents(30);
  const { products } = useProducts();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('myna');
  const [category, setCategory] = useState('serums');
  const [price, setPrice] = useState('');
  const [compareAt, setCompareAt] = useState('');
  const [stock, setStock] = useState('50');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [featured, setFeatured] = useState(false);
  const [concerns, setConcerns] = useState<string[]>(concern ? [concern] : []);
  const [skinTypes, setSkinTypes] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isNew) return;
    getProduct(id)
      .then((p) => {
        setName(p.name);
        setBrand(p.brand ?? '');
        setCategory(p.category);
        setPrice((p.priceCents / 100).toFixed(2));
        setCompareAt(p.compareAtCents ? (p.compareAtCents / 100).toFixed(2) : '');
        setStock(String(p.stock));
        setDescription(p.description ?? '');
        setImageUrl(p.imageUrl ?? '');
        setFeatured(!!p.featured);
        setConcerns(p.concerns ?? []);
        setSkinTypes(p.skinTypes ?? []);
      })
      .catch((e) => Alert.alert('Not found', e?.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  // Skin-driven targeting: what recent scans say about each concern.
  const samples = useMemo(() => scanSamples(events), [events]);
  const demand = useMemo(() => new Map(computeMetrics(events, products, 30).concernDemand.map((d) => [d.key, d])), [events, products]);
  const audience = reach(concerns, samples);

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Allow photo access to upload a product image.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (res.canceled || !res.assets?.[0]) return;
    setUploading(true);
    try {
      setImageUrl(await uploadProductImage(res.assets[0].uri, res.assets[0].mimeType ?? 'image/jpeg'));
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Try again.');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const priceCents = toCents(price);
    const compareCents = compareAt ? toCents(compareAt) : null;
    const stockN = parseInt(stock, 10);
    const e: Record<string, string> = {};
    if (!cleanText(name)) e.name = 'Required';
    if (imageUrl.trim() && !safeHttpsUrl(imageUrl)) e.imageUrl = 'Use an https:// image link';
    if (!Number.isFinite(priceCents) || priceCents <= 0) e.price = 'Enter a price';
    if (compareCents != null && (!Number.isFinite(compareCents) || compareCents <= priceCents)) e.compareAt = 'Must be higher than the price';
    if (!Number.isFinite(stockN) || stockN < 0) e.stock = 'Enter 0 or more';
    if (!concerns.length) e.concerns = 'Pick at least one concern so scans can recommend it';
    if (!skinTypes.length) e.skinTypes = 'Pick the skin types this product suits';
    setErrors(e);
    if (Object.keys(e).length) return;

    const data = {
      // Plain text only. The server's product sanitizer re-checks every write as well.
      name: cleanText(name, 128),
      brand: cleanText(brand, 64) || undefined,
      category,
      description: cleanText(description, 2000, { multiline: true }),
      priceCents,
      compareAtCents: compareCents,
      imageUrl: safeHttpsUrl(imageUrl) ?? undefined,
      stock: stockN,
      concerns,
      skinTypes,
      featured,
    };
    setSaving(true);
    try {
      if (isNew) await createProduct({ ...data, rating: 0 });
      else await updateProduct(id, data);
      router.back();
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: space(16) }} color={colors.ink} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={{ padding: space(5), gap: space(5), paddingBottom: space(16) }} keyboardShouldPersistTaps="handled">
        <Text style={type.h1}>{isNew ? 'New product' : 'Edit product'}</Text>

        <Pressable onPress={pickImage} style={s.image} accessibilityLabel="Upload product image">
          {safeHttpsUrl(imageUrl) ? <Image source={safeHttpsUrl(imageUrl)!} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          {uploading ? (
            <ActivityIndicator color={colors.ink} />
          ) : !imageUrl ? (
            <View style={{ alignItems: 'center', gap: space(2) }}>
              <Icon name="image" size={28} color={colors.muted} />
              <Text style={type.small}>Tap to upload a photo</Text>
            </View>
          ) : null}
        </Pressable>
        <Field label="…or image URL" value={imageUrl} onChangeText={setImageUrl} autoCapitalize="none" keyboardType="url" placeholder="https://" error={errors.imageUrl} />

        <Field label="Name" value={name} onChangeText={setName} error={errors.name} />
        <Field label="Brand" value={brand} onChangeText={setBrand} />
        <View style={{ gap: space(2) }}>
          <Text style={type.label}>Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
            {CATEGORIES.filter((c) => c.key !== 'all').map((c) => (
              <Pill key={c.key} label={c.label} active={category === c.key} onPress={() => setCategory(c.key)} />
            ))}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space(3) }}>
          <View style={{ flex: 1 }}>
            <Field label="Price ($)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" error={errors.price} placeholder="32.00" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Compare at ($)" value={compareAt} onChangeText={setCompareAt} keyboardType="decimal-pad" error={errors.compareAt} placeholder="optional" />
          </View>
          <View style={{ width: 80 }}>
            <Field label="Stock" value={stock} onChangeText={setStock} keyboardType="number-pad" error={errors.stock} />
          </View>
        </View>
        <Field label="Description" value={description} onChangeText={setDescription} multiline style={{ height: 110, paddingTop: space(3), textAlignVertical: 'top' }} />

        {/* Skin targeting: these tags are what the scan report matches against */}
        <Card style={{ gap: space(3) }}>
          <Text style={type.h2}>Recommend for these skin concerns</Text>
          <Text style={type.small}>A shopper whose scan scores low on a tagged concern will see this product in their routine. Percent = share of recent scans needing help there.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
            {CONCERN_KEYS.map((k) => {
              const on = concerns.includes(k);
              const d = demand.get(k);
              return (
                <Pressable
                  key={k}
                  onPress={() => setConcerns((cur) => (on ? cur.filter((x) => x !== k) : [...cur, k]))}
                  style={[s.chip, on && s.chipOn, d?.gap && !on && { borderColor: colors.accent }]}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={{ fontWeight: '600', fontSize: 13, color: on ? colors.white : colors.ink }}>{concernLabel(k)}</Text>
                  {d ? <Text style={{ fontSize: 11, color: on ? '#EADFD6' : colors.muted }}>{Math.round(d.focusShare * 100)}%</Text> : null}
                </Pressable>
              );
            })}
          </View>
          {errors.concerns ? <Text style={{ color: colors.danger, fontSize: 13 }}>{errors.concerns}</Text> : null}
          <View style={s.reach}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink }}>{Math.round(audience * 100)}%</Text>
            <Text style={[type.small, { flex: 1 }]}>
              of the last 30 days’ {samples.length} scans would get this product recommended. Outlined concerns are gaps: many customers need help there, but few in-stock products target them.
            </Text>
          </View>
        </Card>

        <Card style={{ gap: space(3) }}>
          <Text style={type.h2}>Made for these skin types</Text>
          <Text style={type.small}>Shoppers whose scan detects one of these types see this product on their live “For your skin type” shelf. Sensitive = redness-prone.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
            {SKIN_TYPES.map((t) => (
              <Pill key={t.key} label={t.label} active={skinTypes.includes(t.key)} onPress={() => setSkinTypes((cur) => (cur.includes(t.key) ? cur.filter((x) => x !== t.key) : [...cur, t.key]))} />
            ))}
          </View>
          {errors.skinTypes ? <Text style={{ color: colors.danger, fontSize: 13 }}>{errors.skinTypes}</Text> : null}
        </Card>

        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: colors.ink }}>Feature on home page</Text>
            <Text style={type.small}>Shows in Bestsellers</Text>
          </View>
          <Switch value={featured} onValueChange={setFeatured} trackColor={{ true: colors.good }} />
        </View>

        <Button title={isNew ? 'Publish product' : 'Save changes'} loading={saving} onPress={save} />
        {!isNew && (
          <Button
            title="Delete product"
            variant="ghost"
            icon="trash"
            onPress={() =>
              Alert.alert('Delete product?', 'It disappears from the store immediately. Past orders keep their copy.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteProduct(id).catch((e) => Alert.alert('Could not delete', e?.message));
                    router.back();
                  },
                },
              ])
            }
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  image: {
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingHorizontal: space(3), height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  reach: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: space(3) },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: colors.surface, padding: space(4), borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
});
