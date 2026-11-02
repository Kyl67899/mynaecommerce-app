import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Button, Card, Empty } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { CONCERN_INFO, CONCERN_LABELS } from '@/lib/format';
import { colors, radius, space, type } from '@/lib/theme';
import type { ScanMode, ScanRow } from '@/lib/types';
import { decryptScan, listScans, startScan } from '@/services/scans';

// Same set and order as the YouCam playground's concern picker.
const ALL = [
  'acne', 'dark_circle_v2', 'droopy_lower_eyelid', 'droopy_upper_eyelid', 'eye_bag', 'firmness', 'moisture', 'oiliness',
  'pore', 'radiance', 'redness', 'age_spot', 'texture', 'wrinkle', 'skin_type', 'tear_trough',
];

const PRESETS: { label: string; keys: string[] }[] = [
  { label: 'Full analysis', keys: ALL },
  { label: 'Skin type', keys: ['skin_type'] },
  { label: 'Breakouts & pores', keys: ['acne', 'pore', 'oiliness', 'redness', 'texture', 'skin_type'] },
  { label: 'Anti-aging', keys: ['wrinkle', 'firmness', 'age_spot', 'radiance', 'droopy_upper_eyelid', 'droopy_lower_eyelid'] },
  { label: 'Eyes', keys: ['dark_circle_v2', 'eye_bag', 'tear_trough', 'droopy_upper_eyelid', 'droopy_lower_eyelid'] },
];

const HOW_IT_WORKS = [
  { icon: 'camera' as const, title: 'Snap a selfie', body: 'Face a soft light, no makeup or filters. Your photo is stored encrypted and only you can open it.' },
  { icon: 'scan' as const, title: 'AI maps your skin', body: 'YouCam’s AI, trained on 70,000+ clinical images, scores each concern you pick and detects your skin type.' },
  { icon: 'lock' as const, title: 'Results sealed to you', body: 'Scores are encrypted with AES-256 before they’re saved. Only your signed-in device can read them.' },
  { icon: 'sparkle' as const, title: 'Your routine, live', body: 'Products matched to your skin type and weakest concerns, updated the moment new products or stock arrive.' },
];

export default function Scan() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ScanMode>('sd');
  const [selected, setSelected] = useState<string[]>(ALL);
  const [info, setInfo] = useState<string | null>(null);
  const [history, setHistory] = useState<(ScanRow & { overall?: number; skin?: string })[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      listScans(user.$id)
        .then(async (rows) =>
          setHistory(
            await Promise.all(
              rows.map(async (r) => {
                const res = await decryptScan(user.$id, r).catch(() => null);
                return { ...r, overall: res?.overall, skin: res?.skinType?.label };
              }),
            ),
          ),
        )
        .catch(() => {});
    }, [user]),
  );

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Empty
          icon="scan"
          title="Your AI skin analysis"
          body="Skin analysis lives in your account so your results stay private. Sign in to detect your skin type and get products picked for it."
          action={<Button title="Sign in to start" onPress={() => router.push('/sign-in')} style={{ marginTop: space(2) }} />}
        />
      </SafeAreaView>
    );
  }

  const toggle = (k: string) => setSelected((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  async function capture(source: 'camera' | 'library') {
    if (!selected.length) return Alert.alert('Pick at least one concern to analyze.');
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', `Allow ${source === 'camera' ? 'camera' : 'photo'} access in Settings to scan your skin.`);
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 1, allowsEditing: false, exif: false };
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ ...opts, cameraType: ImagePicker.CameraType.front })
        : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;

    const a = res.assets[0];
    setBusy(true);
    try {
      const scanId = await startScan(user!.$id, { uri: a.uri, width: a.width, height: a.height }, { mode, concerns: selected });
      router.push({ pathname: '/scan/[id]', params: { id: scanId } });
    } catch (e: any) {
      Alert.alert('Could not start your scan', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: space(5), gap: space(6), paddingBottom: space(16) }}>
        <View style={{ gap: space(2) }}>
          <Text style={type.label}>My account · Skin analysis</Text>
          <Text style={type.h1}>Know your skin type</Text>
          <Text style={[type.body, { color: colors.inkSoft }]}>Detect your skin type and up to 15 concerns from one selfie, then shop products picked for you in real time.</Text>
        </View>

        {/* How it works */}
        <View style={{ gap: space(3) }}>
          <Text style={type.h2}>How it works</Text>
          {HOW_IT_WORKS.map((s, i) => (
            <View key={s.title} style={st.step}>
              <View style={st.stepIcon}>
                <Icon name={s.icon} size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>
                  {i + 1}. {s.title}
                </Text>
                <Text style={type.small}>{s.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Concern picker, modeled on the YouCam playground */}
        <Card style={{ gap: space(4) }}>
          <View style={{ gap: space(1) }}>
            <Text style={type.h2}>Skin concern</Text>
            <Text style={type.small}>Choose concerns either all in SD or all in HD.</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: space(4) }}>
            {(['sd', 'hd'] as const).map((m) => (
              <Pressable key={m} onPress={() => setMode(m)} style={st.radioRow} accessibilityRole="radio" accessibilityState={{ checked: mode === m }}>
                <View style={[st.radio, mode === m && st.radioOn]}>{mode === m ? <View style={st.radioDot} /> : null}</View>
                <Text style={{ fontWeight: '600', color: colors.ink }}>{m.toUpperCase()} Skin Concern</Text>
              </Pressable>
            ))}
          </View>
          <Text style={type.small}>
            {mode === 'hd'
              ? 'HD: finer detail for each concern. Needs a sharp photo, at least 1080px on its short side.'
              : 'SD: fast and works with any phone camera.'}
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
            {PRESETS.map((p) => {
              const on = p.keys.length === selected.length && p.keys.every((k) => selected.includes(k));
              return (
                <Pressable key={p.label} onPress={() => setSelected(p.keys)} style={[st.preset, on && st.presetOn]}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: on ? colors.white : colors.ink }}>{p.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={type.label}>Concern type</Text>
          <View style={st.grid}>
            {ALL.map((k) => {
              const on = selected.includes(k);
              return (
                <View key={k} style={st.cell}>
                  <Pressable onPress={() => toggle(k)} style={st.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={CONCERN_LABELS[k]}>
                    <View style={[st.box, on && st.boxOn]}>{on ? <Text style={{ color: colors.white, fontWeight: '800' }}>✓</Text> : null}</View>
                    <Text style={{ flex: 1, color: colors.ink, fontSize: 14 }}>{k === 'age_spot' ? 'Spots' : k === 'wrinkle' ? 'Wrinkles' : CONCERN_LABELS[k]}</Text>
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => setInfo(info === k ? null : k)} accessibilityLabel={`About ${CONCERN_LABELS[k]}`}>
                    <Text style={st.help}>?</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          {info ? (
            <View style={st.infoBox}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{CONCERN_LABELS[info]}</Text>
              <Text style={type.small}>{CONCERN_INFO[info]}</Text>
            </View>
          ) : null}
          <Text style={type.small}>
            {selected.length} selected{selected.includes('skin_type') ? ' · skin type also checks oil, hydration and redness' : ''}
          </Text>
        </Card>

        <View style={{ gap: space(3) }}>
          <Button title="Take a selfie" icon="camera" loading={busy} onPress={() => capture('camera')} />
          <Button title="Choose from photos" icon="image" variant="secondary" disabled={busy} onPress={() => capture('library')} />
        </View>

        <View style={st.privacy}>
          <Icon name="lock" size={16} color={colors.inkSoft} />
          <Text style={[type.small, { flex: 1 }]}>
            Your photo is sent to Perfect Corp’s YouCam service for analysis and stored encrypted in your account. Delete any scan from its report. Results
            are cosmetic guidance, not a medical diagnosis.
          </Text>
        </View>

        {history.length > 0 && (
          <View style={{ gap: space(3) }}>
            <Text style={type.h2}>My past scans</Text>
            {history.map((h) => (
              <Pressable key={h.$id} style={st.historyRow} onPress={() => router.push({ pathname: '/scan/[id]', params: { id: h.$id } })}>
                <View style={st.historyScore}>
                  <Text style={{ fontWeight: '700', color: colors.ink }}>{h.status === 'complete' ? h.overall ?? '—' : h.status === 'error' ? '!' : '…'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.ink }}>{new Date(h.$createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                  <Text style={type.small}>{h.status === 'complete' ? (h.skin ? `${h.skin} skin` : 'Skin score') : h.status === 'error' ? 'Needs a retake' : 'Analyzing…'}</Text>
                </View>
                <Icon name="chevron" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}


const st = StyleSheet.create({
  step: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start' },
  stepIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  preset: { paddingHorizontal: space(3), height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', backgroundColor: colors.surface },
  presetOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space(3) },
  cell: { width: '50%', flexDirection: 'row', alignItems: 'center', paddingRight: space(2), gap: space(1) },
  checkRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(2) },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  help: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.muted, color: colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16, fontWeight: '700' },
  infoBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: space(3), gap: 2 },
  privacy: { flexDirection: 'row', gap: space(3), padding: space(4), borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(3), borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  historyScore: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
