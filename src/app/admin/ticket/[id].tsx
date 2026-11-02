import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusPill } from '@/components/admin';
import { ChatBubble } from '@/components/ChatBubble';
import { Button, Card, Empty } from '@/components/ui';
import { cleanText, safeId } from '@/lib/sanitize';
import { colors, radius, space, type } from '@/lib/theme';
import { agentReply, PRIORITY_COLOR, useSupportMessages, useTickets } from '@/services/support';

export default function TicketView() {
  const id = safeId(useLocalSearchParams<{ id: string }>().id);
  const { tickets, loading } = useTickets();
  const ticket = tickets.find((t) => t.$id === id);
  const { messages } = useSupportMessages(ticket?.userId, 100);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.length) setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length]);

  if (loading) return <ActivityIndicator style={{ marginTop: space(16) }} color={colors.ink} />;
  if (!ticket) return <Empty icon="box" title="Ticket not found" />;

  async function reply(status: 'pending' | 'resolved') {
    const body = cleanText(draft, 2000, { multiline: true });
    if (status === 'pending' && !body) return;
    setBusy(true);
    try {
      await agentReply(ticket!.$id, body, status); // delivered to the shopper's chat in real time
      setDraft('');
    } catch (e: any) {
      Alert.alert('Could not send', e?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.$id}
        contentContainerStyle={{ padding: space(4), gap: space(3) }}
        ListHeaderComponent={
          <Card style={{ gap: space(2), marginBottom: space(2) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
              <Text style={[type.h2, { flex: 1 }]} numberOfLines={1}>
                #{ticket.$id.slice(-6).toUpperCase()} · {ticket.userName}
              </Text>
              <StatusPill status={ticket.status} />
            </View>
            <Text style={type.small}>
              {ticket.userEmail ?? 'no email'} · {ticket.category.replace('_', ' ')} ·{' '}
              <Text style={{ color: PRIORITY_COLOR[ticket.priority], fontWeight: '700' }}>{ticket.priority}</Text>
            </Text>
            <Text style={type.label}>AI handoff summary</Text>
            <Text selectable style={type.body}>
              {ticket.summary}
            </Text>
          </Card>
        }
        renderItem={({ item }) => <ChatBubble m={item} perspective="agent" />}
      />
      <View style={s.composer}>
        <TextInput value={draft} onChangeText={setDraft} placeholder="Reply to the shopper…" placeholderTextColor={colors.muted} style={s.input} multiline maxLength={2000} />
        <View style={{ flexDirection: 'row', gap: space(2) }}>
          <Button title="Send" style={{ flex: 1, height: 44 }} loading={busy} disabled={!draft.trim()} onPress={() => reply('pending')} />
          <Button title={draft.trim() ? 'Send & resolve' : 'Resolve'} variant="secondary" style={{ flex: 1, height: 44 }} disabled={busy || ticket.status === 'resolved'} onPress={() => reply('resolved')} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  composer: { padding: space(4), gap: space(2), borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  input: { minHeight: 44, maxHeight: 140, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: space(3), fontSize: 15, color: colors.ink },
});
