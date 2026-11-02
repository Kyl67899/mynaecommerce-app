import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { OtpInput } from '@/components/OtpInput';
import { Button, Field, Pill } from '@/components/ui';
import { authErrorMessage, useAuth } from '@/context/AuthContext';
import { colors, space, type } from '@/lib/theme';

type Mode = 'password' | 'code';

export default function SignIn() {
  const { signIn, sendEmailCode, verifyEmailCode } = useAuth();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<{ userId: string; phrase: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const done = ({ isAdmin, mfaRequired }: { isAdmin: boolean; mfaRequired: boolean }) => {
    if (mfaRequired) router.replace('/mfa'); // second factor before anything else
    else if (isAdmin) router.replace('/admin');
    else router.back();
  };

  async function run(fn: () => Promise<void>) {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const submitPassword = () => {
    if (!email.trim() || !password) return setError('Enter your email and password.');
    run(async () => done(await signIn(email, password)));
  };
  const sendCode = () => {
    if (!email.trim()) return setError('Enter your email.');
    run(async () => {
      setPending(await sendEmailCode(email));
      setCode('');
    });
  };
  const submitCode = () => run(async () => done(await verifyEmailCode(pending!.userId, code)));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space(6), gap: space(5) }} keyboardShouldPersistTaps="handled">
        <Text style={type.display}>Welcome back</Text>
        <View style={{ flexDirection: 'row', gap: space(2) }}>
          <Pill label="Password" active={mode === 'password'} onPress={() => (setMode('password'), setError(null))} />
          <Pill label="Email code (OTP)" active={mode === 'code'} onPress={() => (setMode('code'), setError(null))} />
        </View>

        <Field label="Email" value={email} onChangeText={(t) => (setEmail(t), setPending(null))} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />

        {mode === 'password' ? (
          <>
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submitPassword} />
            {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
            <Button title="Sign in" loading={loading} onPress={submitPassword} />
          </>
        ) : !pending ? (
          <>
            <Text style={type.small}>We’ll email you a 6-digit one-time code. No password needed.</Text>
            {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
            <Button title="Email me a code" loading={loading} onPress={sendCode} />
          </>
        ) : (
          <>
            <Text style={type.small}>
              Check your inbox. The email shows the security phrase <Text style={{ fontWeight: '700', color: colors.ink }}>{pending.phrase}</Text>. Only use the code if
              the phrase matches.
            </Text>
            <OtpInput value={code} onChange={setCode} />
            {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
            <Button title="Verify code" loading={loading} disabled={code.length !== 6} onPress={submitCode} />
            <Pressable onPress={sendCode}>
              <Text style={{ textAlign: 'center', color: colors.accent, fontWeight: '600' }}>Send a new code</Text>
            </Pressable>
          </>
        )}

        <Link href="/sign-up" replace style={{ textAlign: 'center', color: colors.accent, fontWeight: '600' }}>
          New to myna? Create an account
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
