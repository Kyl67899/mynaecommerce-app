import { router, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Button, Empty } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { colors, space } from '@/lib/theme';

// Every admin screen sits behind this guard. It's a UX gate; the real enforcement is Appwrite:
// only "admins" team members can write products, read all orders, or read analytics events.
export default function AdminLayout() {
  const { user, isAdmin, loading } = useAuth();

  if (loading) return <ActivityIndicator style={{ marginTop: space(20) }} color={colors.ink} />;
  if (!user || !isAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Empty
          icon="lock"
          title="Admins only"
          body={user ? 'This account isn’t on the myna admin team.' : 'Sign in with an admin account to open the dashboard.'}
          action={
            <View style={{ gap: space(3), alignSelf: 'stretch', marginTop: space(2) }}>
              {!user && <Button title="Admin sign in" icon="lock" onPress={() => router.push('/sign-in')} />}
              <Button title="Back to store" variant="secondary" onPress={() => router.replace('/')} />
            </View>
          }
        />
      </View>
    );
  }

  // Admin accounts must use two-step verification.
  if (!user.mfa) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Empty
          icon="lock"
          title="Turn on two-step verification"
          body="Admin accounts can change prices, stock and orders, so the dashboard requires an authenticator app or email code at sign-in."
          action={
            <View style={{ gap: space(3), alignSelf: 'stretch', marginTop: space(2) }}>
              <Button title="Set up 2-step" icon="lock" onPress={() => router.push('/security')} />
              <Button title="Back to store" variant="secondary" onPress={() => router.replace('/')} />
            </View>
          }
        />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: '700' },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Admin' }} />
      <Stack.Screen name="orders" options={{ title: 'All orders' }} />
      <Stack.Screen name="products" options={{ title: 'Products' }} />
      <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />
      <Stack.Screen name="support" options={{ title: 'Support inbox' }} />
      <Stack.Screen name="ticket/[id]" options={{ title: 'Ticket' }} />
    </Stack>
  );
}
