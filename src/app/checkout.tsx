import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Button, Card, Empty, Field } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { money } from '@/lib/format';
import { colors, space, type } from '@/lib/theme';
import type { ShippingAddress } from '@/lib/types';
import { cleanText } from '@/lib/sanitize';
import { placeOrder } from '@/services/orders';

const REQUIRED: (keyof ShippingAddress)[] = ['name', 'line1', 'city', 'postalCode', 'country'];

export default function Checkout() {
  const { user } = useAuth();
  const { items, subtotalCents } = useCart();
  const [form, setForm] = useState<ShippingAddress>({ name: user?.name ?? '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'US', phone: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof ShippingAddress, string>>>({});
  const [placing, setPlacing] = useState(false);

  if (!user) return <Empty icon="lock" title="Sign in to checkout" action={<Button title="Sign in" onPress={() => router.replace('/sign-in')} />} />;
  if (!items.length) return <Empty icon="bag" title="Your bag is empty" action={<Button title="Shop" onPress={() => router.replace('/shop')} />} />;

  const shipping = subtotalCents >= 5000 ? 0 : 595;
  const set = (k: keyof ShippingAddress) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    // Strip markup/control characters before sending (the server sanitizes again before encrypting).
    const clean = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, cleanText(v, 120)])) as ShippingAddress;
    const missing = Object.fromEntries(REQUIRED.filter((k) => !clean[k]).map((k) => [k, 'Required']));
    setErrors(missing);
    if (Object.keys(missing).length) return;
    setPlacing(true);
    try {
      const { orderId } = await placeOrder(items, clean);
      Alert.alert('Order placed', `Order #${orderId.slice(-6).toUpperCase()} is confirmed. We’ll update its status live in Orders.`);
      router.replace('/orders');
    } catch (e: any) {
      Alert.alert('Could not place order', e?.message ?? 'Please try again.');
    } finally {
      setPlacing(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={{ padding: space(5), gap: space(5), paddingBottom: space(12) }} keyboardShouldPersistTaps="handled">
        <Text style={type.h2}>Shipping address</Text>
        <Field label="Full name" value={form.name} onChangeText={set('name')} error={errors.name} autoComplete="name" textContentType="name" />
        <Field label="Address" value={form.line1} onChangeText={set('line1')} error={errors.line1} autoComplete="street-address" textContentType="streetAddressLine1" />
        <Field label="Apt, suite (optional)" value={form.line2} onChangeText={set('line2')} textContentType="streetAddressLine2" />
        <View style={{ flexDirection: 'row', gap: space(3) }}>
          <View style={{ flex: 1 }}>
            <Field label="City" value={form.city} onChangeText={set('city')} error={errors.city} textContentType="addressCity" />
          </View>
          <View style={{ width: 96 }}>
            <Field label="State" value={form.state} onChangeText={set('state')} autoCapitalize="characters" textContentType="addressState" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space(3) }}>
          <View style={{ flex: 1 }}>
            <Field label="ZIP / Postal code" value={form.postalCode} onChangeText={set('postalCode')} error={errors.postalCode} keyboardType="number-pad" textContentType="postalCode" />
          </View>
          <View style={{ width: 96 }}>
            <Field label="Country" value={form.country} onChangeText={set('country')} error={errors.country} autoCapitalize="characters" textContentType="countryName" />
          </View>
        </View>
        <Field label="Phone (optional)" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" textContentType="telephoneNumber" />

        <Card style={{ gap: space(2) }}>
          <Row label={`Subtotal (${items.reduce((n, i) => n + i.qty, 0)} items)`} value={money(subtotalCents)} />
          <Row label="Shipping" value={shipping ? money(shipping) : 'Free'} />
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: space(1) }} />
          <Row label="Total" value={money(subtotalCents + shipping)} bold />
          <Text style={type.small}>Final prices and stock are confirmed on our server when you place the order.</Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
          <Icon name="lock" size={16} color={colors.inkSoft} />
          <Text style={[type.small, { flex: 1 }]}>Your address is encrypted with AES-256 before it’s stored.</Text>
        </View>

        <Button title={`Place order · ${money(subtotalCents + shipping)}`} loading={placing} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={[type.body, bold && { fontWeight: '700' }]}>{label}</Text>
      <Text style={[type.body, { fontWeight: bold ? '700' : '500' }]}>{value}</Text>
    </View>
  );
}
