import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, radius, space, type } from '@/lib/theme';
import { Icon, type IconName } from './Icon';

type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, variant = 'primary', loading, disabled, icon, style, ...rest }: ButtonProps) {
  const fg = variant === 'primary' ? colors.white : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && styles.btnPrimary,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'ghost' && styles.btnGhost,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string | null };

export function Field({ label, error, style, ...rest }: FieldProps) {
  return (
    <View style={{ gap: space(1.5) }}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? { borderColor: colors.danger } : null, style]}
        {...rest}
      />
      {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

export function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]} accessibilityRole="button" accessibilityState={{ selected: !!active }}>
      <Text style={[styles.pillText, active && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

export function Stepper({ value, onChange, max = 10 }: { value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <View style={styles.stepper}>
      <Pressable hitSlop={8} onPress={() => onChange(value - 1)} accessibilityLabel="Decrease quantity" style={styles.stepBtn}>
        <Icon name="minus" size={16} />
      </Pressable>
      <Text style={{ minWidth: 22, textAlign: 'center', fontWeight: '600', color: colors.ink }}>{value}</Text>
      <Pressable hitSlop={8} onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} accessibilityLabel="Increase quantity" style={[styles.stepBtn, value >= max && { opacity: 0.35 }]}>
        <Icon name="plus" size={16} />
      </Pressable>
    </View>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={28} color={colors.accent} />
      </View>
      <Text style={[type.h2, { textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[type.small, { textAlign: 'center', maxWidth: 280 }]}>{body}</Text> : null}
      {action}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: radius.pill,
    paddingHorizontal: space(6),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space(2),
  },
  btnPrimary: { backgroundColor: colors.ink },
  btnSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  btnGhost: { backgroundColor: 'transparent' },
  btnText: { fontSize: 15, fontWeight: '600', letterSpacing: 0.2 },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: space(4),
    fontSize: 16,
    color: colors.ink,
  },
  pill: {
    paddingHorizontal: space(4),
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillText: { fontSize: 14, fontWeight: '500', color: colors.ink },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: space(2),
    height: 38,
    gap: space(2),
    backgroundColor: colors.surface,
  },
  stepBtn: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: space(3), paddingVertical: space(16), paddingHorizontal: space(6) },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space(1),
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(4), borderWidth: 1, borderColor: colors.line },
});
