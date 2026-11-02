import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AuthenticatorType, type Models } from 'react-native-appwrite';
import Svg, { Circle } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { OtpInput } from '@/components/OtpInput';
import { QRCode } from '@/components/QRCode';
import { Button, Card, Empty } from '@/components/ui';
import { authErrorMessage, useAuth } from '@/context/AuthContext';
import { account } from '@/lib/appwrite';
import { colors, radius, space, type } from '@/lib/theme';

/** The enrollment QR (and its secret) is replaced every 2 minutes until it's verified. */
const QR_ROTATE_MS = 2 * 60 * 1000;

type Enrollment = Models.MfaType & { issuedAt: number };

export default function Security() {
  const { user, refresh } = useAuth();
  const [factors, setFactors] = useState<Models.MfaFactors | null>(null);
  const [enroll, setEnroll] = useState<Enrollment | null>(null);
  const [now, setNow] = useState(Date.now());
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [rotatedNotice, setRotatedNotice] = useState(false);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const rotating = useRef(false);

  // email verification (needed to use "email code" as a second factor)
  const [emailToken, setEmailToken] = useState<{ phrase: string } | null>(null);
  const [emailCode, setEmailCode] = useState('');

  const loadFactors = useCallback(() => account.listMfaFactors().then(setFactors).catch(() => setFactors({ totp: false, email: false, phone: false } as Models.MfaFactors)), []);
  useEffect(() => {
    loadFactors();
  }, [loadFactors]);

  /** Creates a fresh authenticator secret. Any unverified one is discarded first. */
  const issue = useCallback(async () => {
    try {
      const r = await account.createMfaAuthenticator({ type: AuthenticatorType.Totp }).catch(async () => {
        await account.deleteMfaAuthenticator({ type: AuthenticatorType.Totp }).catch(() => {});
        return account.createMfaAuthenticator({ type: AuthenticatorType.Totp });
      });
      setEnroll({ ...r, issuedAt: Date.now() });
      setOtp('');
      setShowSecret(false);
    } catch (e) {
      Alert.alert('Could not start setup', authErrorMessage(e));
      setEnroll(null);
    }
  }, []);

  // 1-second tick drives the countdown ring and the 2-minute rotation.
  useEffect(() => {
    if (!enroll) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [enroll]);

  const left = enroll ? Math.max(0, QR_ROTATE_MS - (now - enroll.issuedAt)) : 0;
  useEffect(() => {
    if (!enroll || left > 0 || busy || rotating.current) return;
    rotating.current = true;
    setRotatedNotice(true);
    issue().finally(() => (rotating.current = false));
  }, [enroll, left, busy, issue]);

  if (!user) return <Empty icon="lock" title="Sign in to manage security" action={<Button title="Sign in" onPress={() => router.replace('/sign-in')} />} />;
  if (!factors) return <ActivityIndicator style={{ marginTop: space(16) }} color={colors.ink} />;

  async function verifyAuthenticator() {
    setBusy(true);
    try {
      await account.updateMfaAuthenticator({ type: AuthenticatorType.Totp, otp });
      setEnroll(null);
      const codes = await account.createMfaRecoveryCodes().catch(() => null);
      setRecovery(codes?.recoveryCodes ?? []);
      await loadFactors();
    } catch (e) {
      Alert.alert('Code didn’t match', authErrorMessage(e) + ' Use the current 6-digit code from your app.');
      setOtp('');
    } finally {
      setBusy(false);
    }
  }

  async function finishSetup() {
    setBusy(true);
    try {
      await account.updateMFA({ mfa: true });
      setRecovery(null);
      await refresh();
      Alert.alert('Two-step verification is on', 'Next time you sign in, you’ll enter a code from your authenticator app or email.');
    } catch (e) {
      Alert.alert('Could not turn on two-step verification', authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function setMfa(on: boolean) {
    setBusy(true);
    try {
      await account.updateMFA({ mfa: on });
      await refresh();
    } catch (e) {
      Alert.alert('Could not update', authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendEmailVerification() {
    setBusy(true);
    try {
      const t = await account.createEmailToken({ userId: user!.$id, email: user!.email, phrase: true });
      setEmailToken({ phrase: t.phrase });
    } catch (e) {
      Alert.alert('Could not send code', authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEmail() {
    setBusy(true);
    try {
      // Signing in with the emailed code proves you own the inbox; Appwrite marks the email verified.
      await account.deleteSession({ sessionId: 'current' }).catch(() => {});
      await account.createSession({ userId: user!.$id, secret: emailCode });
      setEmailToken(null);
      setEmailCode('');
      await refresh();
      await loadFactors();
    } catch (e) {
      Alert.alert('Code didn’t work', authErrorMessage(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const secs = Math.ceil(left / 1000);
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <ScrollView contentContainerStyle={{ padding: space(5), gap: space(5), paddingBottom: space(16) }} keyboardShouldPersistTaps="handled">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
        <View style={[s.statusDot, { backgroundColor: user.mfa ? colors.good : colors.ok }]}>
          <Icon name="lock" size={18} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.h2}>Two-step verification {user.mfa ? 'on' : 'off'}</Text>
          <Text style={type.small}>{user.mfa ? 'Sign-ins need your password plus a one-time code.' : 'Add an authenticator app to protect your account and skin data.'}</Text>
        </View>
      </Card>

      {/* Recovery codes: shown once, right after the authenticator is verified */}
      {recovery && (
        <Card style={{ gap: space(3), borderColor: colors.accent }}>
          <Text style={type.h2}>Save your recovery codes</Text>
          <Text style={type.small}>Each code works once if you lose your phone. They won’t be shown again. Write them down or store them in a password manager.</Text>
          <View style={s.codes}>
            {recovery.map((c) => (
              <Text key={c} selectable style={s.code}>
                {c}
              </Text>
            ))}
          </View>
          <Button title="I’ve saved them, turn on 2-step" loading={busy} onPress={finishSetup} />
        </Card>
      )}

      {/* Authenticator app (TOTP) */}
      {!recovery && (
        <Card style={{ gap: space(4) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
            <Text style={[type.h2, { flex: 1 }]}>Authenticator app</Text>
            {factors.totp ? <Text style={s.on}>Active</Text> : null}
          </View>

          {factors.totp ? (
            <>
              <Text style={type.small}>Codes from your authenticator app change every 30 seconds.</Text>
              <Button
                title="Remove authenticator"
                variant="secondary"
                onPress={() =>
                  Alert.alert('Remove authenticator?', 'You’ll need another factor (email code) if two-step stays on.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () =>
                        account
                          .deleteMfaAuthenticator({ type: AuthenticatorType.Totp })
                          .then(loadFactors)
                          .catch((e) => Alert.alert('Could not remove', authErrorMessage(e))),
                    },
                  ])
                }
              />
            </>
          ) : !enroll ? (
            <>
              <Text style={type.small}>Use Google Authenticator, Microsoft Authenticator, 1Password or any TOTP app.</Text>
              <Button title="Set up authenticator" icon="scan" loading={busy} onPress={issue} />
            </>
          ) : (
            <>
              <Text style={type.body}>1. Scan this code with your authenticator app.</Text>
              <View style={{ alignItems: 'center', gap: space(3) }}>
                <View style={s.qrWrap}>
                  <QRCode value={enroll.uri} size={210} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                  <Countdown fraction={left / QR_ROTATE_MS} />
                  <Text style={type.small}>New QR code in {mmss}</Text>
                </View>
                {rotatedNotice ? <Text style={[type.small, { color: colors.accent }]}>The code refreshed for security. Scan the new one.</Text> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: space(2) }}>
                <Button title="Open in app" variant="secondary" style={{ flex: 1, height: 44 }} onPress={() => Linking.openURL(enroll.uri).catch(() => Alert.alert('No authenticator app found on this phone.'))} />
                <Button title={showSecret ? 'Hide key' : 'Can’t scan?'} variant="secondary" style={{ flex: 1, height: 44 }} onPress={() => setShowSecret((v) => !v)} />
              </View>
              {showSecret ? (
                <Text selectable style={s.secret}>
                  {enroll.secret.replace(/(.{4})/g, '$1 ').trim()}
                </Text>
              ) : null}
              <Text style={type.body}>2. Enter the 6-digit code it shows.</Text>
              <OtpInput value={otp} onChange={setOtp} autoFocus={false} />
              <Button title="Verify and continue" loading={busy} disabled={otp.length !== 6} onPress={verifyAuthenticator} />
            </>
          )}
        </Card>
      )}

      {/* Email one-time codes */}
      <Card style={{ gap: space(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <Text style={[type.h2, { flex: 1 }]}>Email codes</Text>
          {user.emailVerification ? <Text style={s.on}>Verified</Text> : null}
        </View>
        <Text style={type.small}>
          {user.emailVerification
            ? `One-time codes can be sent to ${user.email} as a backup second step, or to sign in without a password.`
            : `Verify ${user.email} to receive one-time sign-in codes.`}
        </Text>
        {!user.emailVerification &&
          (!emailToken ? (
            <Button title="Email me a verification code" variant="secondary" loading={busy} onPress={sendEmailVerification} />
          ) : (
            <>
              <Text style={type.small}>
                The email will show the security phrase <Text style={{ fontWeight: '700', color: colors.ink }}>{emailToken.phrase}</Text>. If it doesn’t match, don’t use the code.
              </Text>
              <OtpInput value={emailCode} onChange={setEmailCode} />
              <Button title="Verify email" loading={busy} disabled={emailCode.length !== 6} onPress={confirmEmail} />
            </>
          ))}
      </Card>

      {/* Enforcement */}
      {(factors.totp || factors.email) && !recovery && (
        <Card style={{ gap: space(3) }}>
          <Text style={type.h2}>Require a code at sign-in</Text>
          <Text style={type.small}>When on, Appwrite blocks access to your account until the second step is completed.</Text>
          {user.mfa ? (
            <>
              <Button
                title="Turn off two-step verification"
                variant="secondary"
                loading={busy}
                onPress={() =>
                  Alert.alert('Turn off two-step verification?', 'Your account will be protected by your password only.', [
                    { text: 'Keep on', style: 'cancel' },
                    { text: 'Turn off', style: 'destructive', onPress: () => setMfa(false) },
                  ])
                }
              />
              <Button
                title="Generate new recovery codes"
                variant="ghost"
                onPress={() =>
                  account
                    .updateMfaRecoveryCodes()
                    .then((r) => Alert.alert('New recovery codes', r.recoveryCodes.join('\n') + '\n\nYour old codes no longer work.'))
                    .catch((e) => Alert.alert('Could not regenerate', authErrorMessage(e)))
                }
              />
            </>
          ) : (
            <Button title="Turn on two-step verification" loading={busy} onPress={() => setMfa(true)} />
          )}
        </Card>
      )}
    </ScrollView>
  );
}

function Countdown({ fraction, size = 22 }: { fraction: number; size?: number }) {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={3} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.accent} strokeWidth={3} fill="none" strokeDasharray={`${c * fraction} ${c}`} rotation={-90} origin={`${size / 2}, ${size / 2}`} strokeLinecap="round" />
    </Svg>
  );
}

const s = StyleSheet.create({
  statusDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  on: { fontSize: 12, fontWeight: '700', color: colors.good },
  qrWrap: { padding: space(3), backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  secret: { fontFamily: 'Courier', fontSize: 16, letterSpacing: 1, textAlign: 'center', color: colors.ink, backgroundColor: colors.surfaceAlt, padding: space(3), borderRadius: radius.md },
  codes: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  code: { width: '48%', fontFamily: 'Courier', fontSize: 15, color: colors.ink, backgroundColor: colors.surfaceAlt, padding: space(2), borderRadius: radius.sm, textAlign: 'center' },
});
