import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { Button, Field } from '@/components/ui';
import { authErrorMessage, useAuth } from '@/context/AuthContext';
import { cleanText } from '@/lib/sanitize';
import { colors, space, type } from '@/lib/theme';

export default function SignUp() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!cleanText(name) || !email.trim()) return setError('Enter your name and email.');
    if (cleanText(name) !== name.trim()) return setError('Names can’t contain < > or code.');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    setLoading(true);
    setError(null);
    try {
      await signUp(name, email, password);
      router.back();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space(6), gap: space(5) }} keyboardShouldPersistTaps="handled">
        <Text style={type.display}>Join myna</Text>
        <Text style={[type.body, { color: colors.inkSoft }]}>Save your bag across devices, track orders live and keep your skin reports private.</Text>
        <Field label="Name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" onSubmitEditing={submit} />
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        <Button title="Create account" loading={loading} onPress={submit} />
        <Link href="/sign-in" replace style={{ textAlign: 'center', color: colors.accent, fontWeight: '600' }}>
          Already have an account? Sign in
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
