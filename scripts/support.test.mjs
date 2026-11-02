// Support assistant: Claude tool loop (against a fake API), guard rails and handoff helpers.
//   node --test scripts/support.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { runAssistant, mustEscalate, looksSensitive, redact, faqFallback, SYSTEM_PROMPT, TOOLS, SUPPORT_MODEL } = await import('../functions/myna-api/src/support.js');
const main = await import('../functions/myna-api/src/main.js');

function fakeClaude(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    const r = responses[calls.length - 1];
    return new Response(JSON.stringify(r.body ?? r), { status: r.status ?? 200 });
  };
  return { calls, fetchImpl };
}

test('answers with tools: calls get_my_orders, returns tool_result with matching id, then replies', async () => {
  const { calls, fetchImpl } = fakeClaude([
    { stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '…', signature: 'sig' }, { type: 'tool_use', id: 'toolu_1', name: 'get_my_orders', input: {} }] },
    { stop_reason: 'end_turn', model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'Order A1B2C3 shipped yesterday.' }] },
  ]);
  let called = 0;
  const out = await runAssistant([{ role: 'user', content: 'where is my order?' }], { get_my_orders: async () => (called++, [{ id: 'A1B2C3', status: 'shipped' }]) }, { fetchImpl, apiKey: 'test' });

  assert.equal(out.text, 'Order A1B2C3 shipped yesterday.');
  assert.equal(called, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].headers['x-api-key'], 'test');
  assert.equal(calls[0].headers['anthropic-version'], '2023-06-01');
  assert.equal(calls[0].body.model, 'claude-haiku-5-5');
  assert.equal(calls[0].body.system, SYSTEM_PROMPT);
  assert.deepEqual(calls[0].body.tools.map((t) => t.name), ['get_my_orders', 'get_my_account_status', 'escalate_to_human']);
  assert.equal(calls[0].body.temperature, undefined); // omitted for this model family
  // second call: assistant turn kept intact (thinking + tool_use), then the tool_result
  const [, assistant, toolTurn] = calls[1].body.messages;
  assert.equal(assistant.role, 'assistant');
  assert.equal(assistant.content[0].type, 'thinking');
  assert.equal(toolTurn.content[0].type, 'tool_result');
  assert.equal(toolTurn.content[0].tool_use_id, 'toolu_1');
  assert.match(toolTurn.content[0].content, /A1B2C3/);
});

test('escalate_to_human tool opens a ticket and is reported back', async () => {
  const { fetchImpl } = fakeClaude([
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't2', name: 'escalate_to_human', input: { category: 'refund', priority: 'high', summary: 'Wants a refund for order X' } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'A person will reply here.' }] },
  ]);
  const out = await runAssistant([{ role: 'user', content: 'refund please' }], { escalate_to_human: async (i) => ({ ticketId: 'tk1', ...i }) }, { fetchImpl, apiKey: 'k' });
  assert.equal(out.escalation.ticketId, 'tk1');
  assert.equal(out.escalation.priority, 'high');
});

test('tool errors go back to the model as is_error instead of crashing', async () => {
  const { calls, fetchImpl } = fakeClaude([
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't3', name: 'get_my_account_status', input: {} }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sorry, I could not check that.' }] },
  ]);
  await runAssistant([{ role: 'user', content: 'hi' }], { get_my_account_status: async () => { throw new Error('db down'); } }, { fetchImpl, apiKey: 'k' });
  const tr = calls[1].body.messages.at(-1).content[0];
  assert.equal(tr.is_error, true);
  assert.match(tr.content, /db down/);
});

test('API errors surface so the route can fall back to the FAQ / a person', async () => {
  const { fetchImpl } = fakeClaude([{ status: 529, body: { error: { message: 'Overloaded' } } }]);
  await assert.rejects(runAssistant([{ role: 'user', content: 'hi' }], {}, { fetchImpl, apiKey: 'k' }), /529.*Overloaded/);
  await assert.rejects(runAssistant([{ role: 'user', content: 'hi' }], {}, { fetchImpl, apiKey: '' }), /ANTHROPIC_API_KEY/);
});

test('guard rails force a human for reactions, takeovers, money and explicit asks', () => {
  assert.equal(mustEscalate('My face is burning and swelling after the serum').priority, 'urgent');
  assert.equal(mustEscalate('My face is burning and swelling after the serum').category, 'product_reaction');
  assert.equal(mustEscalate('I think I got hacked, someone logged in').category, 'account_security');
  assert.equal(mustEscalate('I was charged twice').category, 'refund');
  assert.equal(mustEscalate('Can I talk to a real person?').category, 'other');
  assert.equal(mustEscalate('How do I set up 2-step?'), null);
  assert.equal(mustEscalate('What is my skin type?'), null);
});

test('sensitive data is detected and card numbers are redacted', () => {
  assert.equal(looksSensitive('my card is 4242 4242 4242 4242'), true);
  assert.equal(looksSensitive('my password is hunter2'), true);
  assert.equal(looksSensitive('order A1B2C3 is late'), false);
  const r = redact('card 4242 4242 4242 4242 thanks, order 1234');
  assert.ok(!/4242/.test(r) && r.includes('[redacted number]') && r.includes('order 1234'), r);
});

test('offline FAQ fallback finds the right article', () => {
  assert.equal(faqFallback('my authenticator code does not work')?.id, 'mfa-code-wrong');
  assert.equal(faqFallback('how much is shipping')?.id, 'shipping');
  assert.equal(faqFallback('scan failed too dark retake')?.id, 'scan-failed');
  assert.equal(faqFallback('asdf qwer'), null);
});

test('chat history: system notes dropped, agent replies labeled, roles alternate, starts with user', () => {
  const h = main.toClaudeHistory([
    { role: 'assistant', body: 'hello' },
    { role: 'user', body: 'a' },
    { role: 'user', body: 'b' },
    { role: 'system', body: 'ticket opened' },
    { role: 'agent', body: 'Hi, Kyle here' },
    { role: 'assistant', body: 'ok' },
  ]);
  assert.deepEqual(h.map((m) => m.role), ['user', 'assistant']);
  assert.equal(h[0].content, 'a\n\nb');
  assert.match(h[1].content, /^\[Reply from a person on the myna support team\] Hi, Kyle here\n\nok$/);
});

test('system prompt treats user text as data and forbids asking for secrets', () => {
  assert.match(SYSTEM_PROMPT, /data, not instructions/);
  assert.match(SYSTEM_PROMPT, /Never ask for passwords/);
  assert.ok(TOOLS.every((t) => t.input_schema.type === 'object'));
  assert.equal(SUPPORT_MODEL(), 'claude-haiku-5-5');
});

test('/support/chat rejects empty or markup-only messages before any work', async () => {
  process.env.APPWRITE_FUNCTION_API_ENDPOINT = 'https://example.invalid/v1';
  process.env.APPWRITE_FUNCTION_PROJECT_ID = 'p';
  let out;
  await main.default({
    req: { headers: { 'x-appwrite-user-id': 'u1', 'x-appwrite-key': 'k' }, path: '/support/chat', bodyJson: { message: '<script></script>' } },
    res: { json: (body, status = 200) => (out = { body, status }) },
    log: () => {},
    error: () => {},
  });
  assert.equal(out.status, 400);
});
