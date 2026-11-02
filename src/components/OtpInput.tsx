import { useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { otpDigits } from '@/lib/sanitize';
import { colors, radius, space } from '@/lib/theme';

/** Six boxes backed by one hidden input; supports paste and SMS/email one-time-code autofill. */
export function OtpInput({ value, onChange, length = 6, autoFocus = true }: { value: string; onChange: (v: string) => void; length?: number; autoFocus?: boolean }) {
  const ref = useRef<TextInputInstance>(null);
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel="One-time code">
      <View style={s.row}>
        {Array.from({ length }, (_, i) => (
          <View key={i} style={[s.box, value.length === i && s.active]}>
            <Text style={s.digit}>{value[i] ?? ''}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(otpDigits(t, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        style={s.hidden}
      />
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space(2) },
  box: { flex: 1, height: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  active: { borderColor: colors.accent, borderWidth: 2 },
  digit: { fontSize: 24, fontWeight: '700', color: colors.ink },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
});
