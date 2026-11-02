import { router, Stack, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CartProvider>
          <StatusBar style="dark" />
          <MfaGate />
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
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="product/[id]" options={{ title: '' }} />
            <Stack.Screen name="scan/[id]" options={{ title: 'Your skin report' }} />
            <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
            <Stack.Screen name="orders" options={{ title: 'Orders' }} />
            <Stack.Screen name="sign-in" options={{ presentation: 'modal', title: 'Sign in' }} />
            <Stack.Screen name="sign-up" options={{ presentation: 'modal', title: 'Create account' }} />
            <Stack.Screen name="admin" options={{ headerShown: false }} />
            <Stack.Screen name="security" options={{ title: 'Security' }} />
            <Stack.Screen name="support" options={{ title: 'Help & support' }} />
            <Stack.Screen name="mfa" options={{ title: 'Two-step verification', headerBackVisible: false, gestureEnabled: false }} />
          </Stack>
        </CartProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/** If a session still needs its second factor (e.g. app reopened mid-sign-in), send it to the challenge. */
function MfaGate() {
  const { mfaRequired } = useAuth();
  const segments = useSegments();
  useEffect(() => {
    if (mfaRequired && segments[0] !== 'mfa') router.replace('/mfa');
  }, [mfaRequired, segments]);
  return null;
}
