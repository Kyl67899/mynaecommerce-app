import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/Icon';
import { Button, Empty } from '@/components/ui';
import { UserDashboard } from '@/components/UserDashboard';
import { useAuth } from '@/context/AuthContext';
import { colors, radius, space, type } from '@/lib/theme';

export default function Account() {
  const { user, isAdmin, signOut } = useAuth();

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Empty
          icon="user"
          title="Welcome to myna"
          body="Sign in to save your bag across devices, track orders live, and keep your skin reports."
          action={
            <View style={{ gap: space(3), alignSelf: 'stretch', marginTop: space(2) }}>
              <Button title="Sign in" onPress={() => router.push('/sign-in')} />
              <Button title="Create an account" variant="secondary" onPress={() => router.push('/sign-up')} />
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: space(5), gap: space(6) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(4) }}>
          <View style={s.avatar}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.accent }}>{(user.name || user.email).charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.h2}>{user.name || 'myna member'}</Text>
            <Text style={type.small}>{user.email}</Text>
          </View>
        </View>

        {isAdmin && (
          <Button title="Open admin dashboard" icon="grid" onPress={() => router.push('/admin')} />
        )}

        <UserDashboard userId={user.$id} />

        <View style={s.group}>
          <Row icon="box" label="Orders" onPress={() => router.push('/orders')} />
          <Row icon="scan" label="Skin analysis & skin type" onPress={() => router.push('/scan')} />
          <Row icon="lock" label={`Security & 2-step ${user.mfa ? '(on)' : '(off)'}`} onPress={() => router.push('/security')} />
          <Row icon="sparkle" label="Help & support (AI assistant)" onPress={() => router.push('/support')} />
          <Row icon="bag" label="Bag" onPress={() => router.push('/cart')} last />
        </View>

        <View style={[s.group, { padding: space(4), gap: space(2) }]}>
          <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
            <Icon name="lock" size={18} color={colors.good} />
            <Text style={{ fontWeight: '600', color: colors.ink }}>Your data is encrypted</Text>
          </View>
          <Text style={type.small}>
            Skin results and shipping addresses are sealed with AES-256-GCM using a key unique to your account. The key is kept in this device’s secure
            enclave and removed when you sign out.
          </Text>
        </View>

        <Button
          title="Sign out"
          variant="secondary"
          onPress={() =>
            Alert.alert('Sign out?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
            ])
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, onPress, last }: { icon: IconName; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[s.row, !last && { borderBottomWidth: 1, borderBottomColor: colors.line }]}>
      <Icon name={icon} size={20} />
      <Text style={{ flex: 1, fontSize: 16, color: colors.ink }}>{label}</Text>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), height: 56 },
});
