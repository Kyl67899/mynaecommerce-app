import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '@/lib/theme';
import type { SupportMessage } from '@/lib/types';

/** One chat message. `perspective` flips sides for the admin view (agent = me). */
export function ChatBubble({ m, perspective = 'shopper' }: { m: SupportMessage; perspective?: 'shopper' | 'agent' }) {
  if (m.role === 'system') {
    return (
      <View style={s.systemWrap}>
        <Text style={s.system}>{m.body}</Text>
      </View>
    );
  }
  const mine = perspective === 'shopper' ? m.role === 'user' : m.role === 'agent';
  const label = m.role === 'assistant' ? 'myna assistant (AI)' : m.role === 'agent' ? `${m.agentName || 'myna Support'} · support team` : perspective === 'agent' ? 'Shopper' : null;
  const time = new Date(m.$createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <View style={[s.row, mine ? s.right : s.left]}>
      {label && !mine ? <Text style={[s.label, m.role === 'agent' && { color: colors.good }]}>{label}</Text> : null}
      <View style={[s.bubble, mine ? s.mine : m.role === 'agent' ? s.agent : s.theirs]}>
        {/* Plain Text only: message content can never render as markup */}
        <Text selectable style={{ color: mine ? colors.white : colors.ink, fontSize: 15, lineHeight: 21 }}>
          {m.body}
        </Text>
      </View>
      <Text style={s.time}>{time}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { maxWidth: '84%', gap: 3 },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  label: { fontSize: 11, fontWeight: '700', color: colors.accent, marginLeft: space(1) },
  bubble: { paddingHorizontal: space(3.5), paddingVertical: space(2.5), borderRadius: radius.lg },
  mine: { backgroundColor: colors.ink, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 6 },
  agent: { backgroundColor: '#E4EFE6', borderBottomLeftRadius: 6 },
  time: { fontSize: 10, color: colors.muted, marginHorizontal: space(1) },
  systemWrap: { alignSelf: 'center', maxWidth: '90%', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) },
  system: { fontSize: 12, color: colors.inkSoft, textAlign: 'center' },
});
