import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatBubble } from '@/components/ChatBubble';
import { Icon } from '@/components/Icon';
import { Button, Empty } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { cleanText } from '@/lib/sanitize';
import { colors, radius, space, type } from '@/lib/theme';
import { sendSupportMessage, useSupportMessages, useTickets } from '@/services/support';

const QUICK = ['My skin scan failed', 'How do I set up 2-step?', 'Where is my order?', 'How do I detect my skin type?', 'Returns and refunds'];

export default function Support() {
  const { user } = useAuth();
  const { messages, loading } = useSupportMessages(user?.$id);
  const { active } = useTickets(user?.$id);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.length) setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length, sending]);

  if (!user) {
    return (
      <Empty
        icon="user"
        title="Help & support"
        body="Sign in so our assistant can check your orders and account, and so a person can reply to you here."
        action={<Button title="Sign in" onPress={() => router.replace('/sign-in')} />}
      />
    );
  }

  async function send(text: string) {
    const msg = cleanText(text, 1000, { multiline: true });
    if (!msg || sending) return;
    setDraft('');
    setError(null);
    setSending(true);
    try {
      await sendSupportMessage(msg); // replies arrive over Realtime
    } catch (e: any) {
      setError(e?.message ?? 'Couldn’t send. Check your connection and try again.');
      setDraft(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        {active ? (
          <View style={s.banner}>
            <Icon name="user" size={18} color={colors.good} />
            <Text style={{ flex: 1, color: colors.ink, fontSize: 13 }}>
              You’re connected with a person on our team (ticket #{active.$id.slice(-6).toUpperCase()}). They’ll reply here, and you’ll see it instantly.
            </Text>
          </View>
        ) : (
          <View style={[s.banner, { backgroundColor: colors.accentSoft }]}>
            <Icon name="sparkle" size={18} color={colors.accent} />
            <Text style={{ flex: 1, color: colors.ink, fontSize: 13 }}>AI assistant for app and order help. Ask for a person anytime.</Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator style={{ marginTop: space(10) }} color={colors.ink} />
        ) : (
          <FlatList
            ref={list}
            data={messages}
            keyExtractor={(m) => m.$id}
            contentContainerStyle={{ padding: space(4), gap: space(3), flexGrow: 1 }}
            renderItem={({ item }) => <ChatBubble m={item} />}
            ListEmptyComponent={
              <View style={{ gap: space(3), paddingTop: space(6) }}>
                <Text style={type.h2}>Hi {user.name.split(' ')[0] || 'there'}, how can we help?</Text>
                <Text style={type.small}>I can help with skin scans, skin type, sign-in and 2-step, orders and shipping. I’ll bring in a person if I can’t solve it.</Text>
              </View>
            }
            ListFooterComponent={
              sending && !active ? (
                <View style={[s.typing]}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={type.small}>Assistant is typing…</Text>
                </View>
              ) : undefined
            }
          />
        )}

        {!active && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: space(4), gap: space(2), paddingBottom: space(2) }}>
            {QUICK.map((q) => (
              <Pressable key={q} onPress={() => send(q)} style={s.chip} disabled={sending}>
                <Text style={{ fontSize: 13, color: colors.ink }}>{q}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => send('I’d like to talk to a person, please.')} style={[s.chip, { borderColor: colors.accent }]} disabled={sending}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.accent }}>Talk to a person</Text>
            </Pressable>
          </ScrollView>
        )}

        {error ? <Text style={{ color: colors.danger, paddingHorizontal: space(4), paddingBottom: space(1) }}>{error}</Text> : null}
        <View style={s.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={active ? 'Message the support team…' : 'Ask a question…'}
            placeholderTextColor={colors.muted}
            style={s.input}
            multiline
            maxLength={1000}
            accessibilityLabel="Message"
          />
          <Pressable onPress={() => send(draft)} disabled={!draft.trim() || sending} style={[s.send, (!draft.trim() || sending) && { opacity: 0.4 }]} accessibilityLabel="Send">
            <Icon name="chevron" size={20} color={colors.white} />
          </Pressable>
        </View>
        <Text style={s.disclaimer}>Never share passwords, card numbers or codes. Chats are kept to improve support.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  banner: { flexDirection: 'row', gap: space(2), alignItems: 'center', backgroundColor: '#E4EFE6', margin: space(4), marginBottom: 0, padding: space(3), borderRadius: radius.md },
  typing: { flexDirection: 'row', gap: space(2), alignItems: 'center', paddingVertical: space(2) },
  chip: { paddingHorizontal: space(3), height: 34, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space(2), paddingHorizontal: space(4), paddingTop: space(2), borderTopWidth: 1, borderTopColor: colors.line },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: space(4), paddingTop: space(3), paddingBottom: space(3), fontSize: 15, color: colors.ink },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  disclaimer: { fontSize: 10, color: colors.muted, textAlign: 'center', paddingVertical: space(2) },
});
