import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthenticationFactor, type Models } from 'react-native-appwrite';
import { Icon, type IconName } from '@/components/Icon';
import { OtpInput } from '@/components/OtpInput';
import { Button } from '@/components/ui';
import { authErrorMessage, useAuth } from '@/context/AuthContext';
import { account } from '@/lib/appwrite';
import { colors, radius, space, type } from '@/lib/theme';

type Factor = 'totp' | 'email' | 'recoverycode';

const OPTIONS: { key: Factor; label: string; hint: string; icon: IconName }[] = [
  { key: 'totp', label: 'Authenticator app', hint: 'Enter the 6-digit code from your app (it changes every 30s).', icon: 'scan' },
  { key: 'email', label: 'Email me a code', hint: 'We’ll send a one-time code to your verified email.', icon: 'lock' },
  { key: 'recoverycode', label: 'Use a recovery code', hint: 'One of the codes you saved when you set up 2-step.', icon: 'box' },
];

/** Second step of sign-in. Appwrite keeps the session locked until this succeeds. */
export default function MfaChallenge() {
  const { refresh, signOut } = useAuth();
  const [factors, setFactors] = useState<Models.MfaFactors | null>(null);
  const [factor, setFactor] = useState<Factor | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    account
      .listMfaFactors()
      .then((f) => {
        setFactors(f);
        if (f.totp) start('totp'); // most secure option first
      })
      .catch(() => setFactors({ totp: true, email: true, phone: false } as Models.MfaFactors));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function start(f: Factor) {
    setFactor(f);
    setCode('');
    setError(null);
    setBusy(true);
    try {
      const c = await account.createMfaChallenge({ factor: f as AuthenticationFactor });
      setChallengeId(c.$id);
    } catch (e) {
      setError(authErrorMessage(e));
      setChallengeId(null);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!challengeId) return;
    setBusy(true);
    setError(null);
    try {
      await account.updateMfaChallenge({ challengeId, otp: code.trim() });
      const { isAdmin } = await refresh();
      router.replace(isAdmin ? '/admin' : '/');
    } catch (e) {
      setError(authErrorMessage(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  if (!factors) return <ActivityIndicator style={{ marginTop: space(20) }} color={colors.ink} />;
  const available = OPTIONS.filter((o) => o.key === 'recoverycode' || factors[o.key as 'totp' | 'email']);
  const ready = factor === 'recoverycode' ? code.trim().length >= 8 : code.length === 6;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space(6), gap: space(5) }} keyboardShouldPersistTaps="handled">
        <Text style={type.display}>Verify it’s you</Text>
        <Text style={[type.body, { color: colors.inkSoft }]}>Your account has two-step verification on. Choose how to confirm this sign-in.</Text>

        <View style={{ gap: space(2) }}>
          {available.map((o) => (
            <Pressable key={o.key} onPress={() => start(o.key)} style={[s.option, factor === o.key && s.optionOn]} accessibilityRole="radio" accessibilityState={{ checked: factor === o.key }}>
              <Icon name={o.icon} size={20} color={factor === o.key ? colors.accent : colors.ink} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.ink }}>{o.label}</Text>
                {factor === o.key ? <Text style={type.small}>{o.hint}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>

        {factor && challengeId ? (
          <View style={{ gap: space(4) }}>
            {factor === 'recoverycode' ? (
              <TextInput value={code} onChangeText={(t) => setCode(t.replace(/[^A-Za-z0-9]/g, '').slice(0, 32))} autoCapitalize="none" autoCorrect={false} placeholder="Recovery code" placeholderTextColor={colors.muted} style={s.input} />
            ) : (
              <OtpInput value={code} onChange={setCode} />
            )}
            {factor === 'email' ? (
              <Pressable onPress={() => start('email')}>
                <Text style={{ color: colors.accent, fontWeight: '600' }}>Send a new code</Text>
              </Pressable>
            ) : null}
            <Button title="Verify" loading={busy} disabled={!ready} onPress={submit} />
          </View>
        ) : busy ? (
          <ActivityIndicator color={colors.ink} />
        ) : null}

        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

        <Button
          title="Cancel and sign out"
          variant="ghost"
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(4), borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  optionOn: { borderColor: colors.accent, borderWidth: 2 },
  input: { height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: space(4), fontSize: 18, letterSpacing: 2, color: colors.ink },
});
