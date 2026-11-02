// myna-api — the app's only trusted backend code (Appwrite Function, Node 20+).
//
// Routes (called from the app with functions.createExecution, xpath = route):
//   POST /keyring  → returns the signed-in user's AES-256 data key (creates it on first call)
//   POST /scan     → runs YouCam skin analysis on an uploaded selfie (call with async=true;
//                    the app watches the scan row over Realtime)
//   POST /order    → prices the cart server-side, reserves stock atomically, saves the order
//   POST /support/chat         → AI support assistant (Claude); hands off to a person when needed
//   POST /support/agent-reply  → admin-only: a person on the team replies in the shopper's chat
//   events         → users.*.create (count sign-ups); products rows create/update (XSS sanitizer)
//
// Appwrite injects x-appwrite-user-id for the caller's session, so a user can only ever act as
// themselves. The API key comes from the per-execution dynamic key (x-appwrite-key).
import { Client, TablesDB, Storage, Teams, Users, Permission, Role, Query, ID } from 'node-appwrite';
import { loadKek, randomKey, wrapDek, unwrapDek, encrypt } from './crypto.js';
import { analyzeSkin, CONCERN_KEYS, MODES, SKIN_TYPES, YouCamError } from './youcam.js';
import { cleanText, isSafeId, pickAllowed, safeHttpsUrl } from './sanitize.js';
import { CATEGORIES as TICKET_CATEGORIES, PRIORITIES, faqFallback, looksSensitive, mustEscalate, redact, runAssistant } from './support.js';
import { logEvent, orderEvent, scanEvent, signupEvent } from './analytics.js';

const DB = process.env.DB_ID || 'myna';
const BUCKET = process.env.SCANS_BUCKET_ID || 'scans';
const FREE_SHIPPING_CENTS = 5000;
const SHIPPING_CENTS = 595;

export default async ({ req, res, log, error }) => {
  const makeClient = () =>
    new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(req.headers['x-appwrite-key'] || process.env.APPWRITE_API_KEY);

  // Event triggers (configured in appwrite.json)
  if (req.headers['x-appwrite-trigger'] === 'event') {
    const event = req.headers['x-appwrite-event'] || '';
    const tables = new TablesDB(makeClient());
    if (/^users\.[^.]+\.create$/.test(event)) {
      await logEvent(tables, DB, signupEvent(), log); // count sign-ups for the admin dashboard
    } else if (/^tablesdb\.[^.]+\.tables\.products\.rows\.[^.]+\.(create|update)$/.test(event)) {
      await sanitizeProductRow(tables, req.bodyJson ?? JSON.parse(req.body || '{}'), log);
    }
    return res.json({ ok: true });
  }

  const userId = req.headers['x-appwrite-user-id'];
  if (!userId) return res.json({ error: 'Sign in required' }, 401);

  const client = makeClient();
  const ctx = { userId, tables: new TablesDB(client), storage: new Storage(client), users: new Users(client), teams: new Teams(client), log, error };

  let body = {};
  try {
    body = req.bodyJson ?? (req.body ? JSON.parse(req.body) : {});
  } catch {
    return res.json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    switch (req.path) {
      case '/keyring':
        return res.json(await keyring(ctx));
      case '/scan':
        return res.json(await scan(ctx, body));
      case '/order':
        return res.json(await placeOrder(ctx, body));
      case '/support/chat':
        return res.json(await supportChat(ctx, body));
      case '/support/agent-reply':
        return res.json(await agentReply(ctx, body));
      default:
        return res.json({ error: `Unknown route ${req.path}` }, 404);
    }
  } catch (e) {
    error(`${req.path} failed: ${e.stack || e.message}`);
    const status = e.status || (e instanceof YouCamError ? 422 : 500);
    return res.json({ error: e.expose || e instanceof YouCamError ? e.message : 'Something went wrong' }, status);
  }
};

const ownerOnly = (userId, { del = false } = {}) => [
  Permission.read(Role.user(userId)),
  ...(del ? [Permission.delete(Role.user(userId))] : []),
];

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// ---------------------------------------------------------------------------
// Keyring: per-user data encryption key, wrapped by MASTER_KEK at rest.
async function getUserDek({ tables, userId }) {
  const kek = loadKek();
  const found = await tables.listRows({ databaseId: DB, tableId: 'profiles', queries: [Query.equal('userId', userId), Query.limit(1)] });
  if (found.rows.length) return unwrapDek(kek, found.rows[0].wrappedDek, userId);

  const dek = randomKey();
  try {
    await tables.createRow({
      databaseId: DB,
      tableId: 'profiles',
      rowId: userId,
      data: { userId, wrappedDek: wrapDek(kek, dek, userId) },
      permissions: ownerOnly(userId),
    });
    return dek;
  } catch (e) {
    // Two devices raced to create it: use the winner's key.
    if (e.code !== 409) throw e;
    const row = await tables.getRow({ databaseId: DB, tableId: 'profiles', rowId: userId });
    return unwrapDek(kek, row.wrappedDek, userId);
  }
}

async function keyring(ctx) {
  const dek = await getUserDek(ctx);
  // Delivered over TLS to the authenticated owner only; the app keeps it in the
  // iOS Keychain / Android Keystore (expo-secure-store) and wipes it on sign-out.
  return { dek: dek.toString('base64'), alg: 'AES-256-GCM', v: 1 };
}

// ---------------------------------------------------------------------------
// Skin scan
async function scan(ctx, { fileId, scanId, mode = 'sd', concerns = [] }) {
  const { tables, storage, userId, log } = ctx;
  if (!isSafeId(fileId) || !isSafeId(scanId)) throw fail(400, 'fileId and scanId are required');
  if (!MODES.includes(mode)) throw fail(400, 'mode must be sd or hd');
  const picked = pickAllowed(concerns, CONCERN_KEYS); // allowlist: nothing else reaches YouCam

  // The selfie must belong to the caller.
  const file = await storage.getFile({ bucketId: BUCKET, fileId });
  if (!file.$permissions.includes(`read("user:${userId}")`)) throw fail(403, 'Not your file');
  if (file.sizeOriginal > 10 * 1024 * 1024) throw fail(413, 'Photo is larger than 10 MB');

  await tables.createRow({
    databaseId: DB,
    tableId: 'scans',
    rowId: scanId,
    data: { userId, status: 'processing', fileId },
    permissions: ownerOnly(userId, { del: true }),
  });

  const setScan = (data) => tables.updateRow({ databaseId: DB, tableId: 'scans', rowId: scanId, data });

  try {
    const bytes = Buffer.from(await storage.getFileDownload({ bucketId: BUCKET, fileId }));
    const result = await analyzeSkin(bytes, { contentType: file.mimeType || 'image/jpeg', mode, concerns: picked, log });
    const dek = await getUserDek(ctx);
    await setScan({ status: 'complete', payloadEnc: encrypt(dek, JSON.stringify(result), `scan:${userId}`), error: null });
    await logEvent(tables, DB, scanEvent(result), log);
    return { scanId, status: 'complete' };
  } catch (e) {
    const message = e instanceof YouCamError ? e.message : 'Analysis failed. Please try again.';
    await setScan({ status: 'error', error: message.slice(0, 250) });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Orders: never trust prices or stock from the client.
async function placeOrder(ctx, { items, shipping }) {
  const { tables, userId } = ctx;
  if (!Array.isArray(items) || items.length === 0) throw fail(400, 'Your cart is empty');
  if (items.length > 50) throw fail(400, 'Too many items');
  const required = ['name', 'line1', 'city', 'postalCode', 'country'];
  if (!shipping || required.some((k) => !cleanText(shipping[k]))) throw fail(400, 'Shipping address is incomplete');

  // Merge duplicate lines and validate quantities.
  const qtyById = new Map();
  for (const it of items) {
    const qty = Math.floor(Number(it.qty));
    if (!isSafeId(it.productId) || !Number.isFinite(qty) || qty < 1 || qty > 10) throw fail(400, 'Invalid item');
    qtyById.set(it.productId, (qtyById.get(it.productId) || 0) + qty);
  }

  const { rows: products } = await tables.listRows({
    databaseId: DB,
    tableId: 'products',
    queries: [Query.equal('$id', [...qtyById.keys()]), Query.limit(100)],
  });
  if (products.length !== qtyById.size) throw fail(400, 'Some items are no longer available');

  // Reserve stock atomically per line (min: 0 makes Appwrite reject an oversell).
  const reserved = [];
  try {
    for (const p of products) {
      const qty = qtyById.get(p.$id);
      await tables.decrementRowColumn({ databaseId: DB, tableId: 'products', rowId: p.$id, column: 'stock', value: qty, min: 0 });
      reserved.push([p.$id, qty]);
    }
  } catch {
    for (const [rowId, qty] of reserved)
      await tables.incrementRowColumn({ databaseId: DB, tableId: 'products', rowId, column: 'stock', value: qty }).catch(() => {});
    throw fail(409, 'Some items just sold out. Your cart has been refreshed.');
  }

  const lines = products.map((p) => ({
    productId: p.$id,
    name: p.name,
    imageUrl: p.imageUrl,
    priceCents: p.priceCents,
    qty: qtyById.get(p.$id),
  }));
  const subtotalCents = lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
  const shippingCents = subtotalCents >= FREE_SHIPPING_CENTS ? 0 : SHIPPING_CENTS;
  const dek = await getUserDek(ctx);
  const address = pick(shipping, ['name', 'line1', 'line2', 'city', 'state', 'postalCode', 'country', 'phone']);

  const order = await tables.createRow({
    databaseId: DB,
    tableId: 'orders',
    rowId: 'unique()',
    data: {
      userId,
      status: 'placed',
      itemsJson: JSON.stringify(lines),
      subtotalCents,
      shippingCents,
      totalCents: subtotalCents + shippingCents,
      shippingEnc: encrypt(dek, JSON.stringify(address), `order:${userId}`),
    },
    permissions: ownerOnly(userId),
  });

  await logEvent(tables, DB, orderEvent(lines, order.totalCents), ctx.log);

  // Empty the cart (every signed-in device sees this instantly over Realtime).
  await tables.updateRow({ databaseId: DB, tableId: 'carts', rowId: userId, data: { items: '[]' } }).catch(() => {});

  return { orderId: order.$id, totalCents: order.totalCents };
}

// Shipping fields are plain text: tags, script URLs and control characters are removed before encrypting.
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, cleanText(o[k], 120)]));

// ---------------------------------------------------------------------------
// Product sanitizer (event trigger). Admins write products straight to the database, so this is the
// server-side guarantee that no product field can carry markup or a script URL to any storefront.
const CATEGORIES = ['cleansers', 'toners', 'serums', 'moisturizers', 'eye-care', 'sunscreen'];
const imageHosts = () => {
  const appwriteHost = (() => {
    try {
      return new URL(process.env.APPWRITE_FUNCTION_API_ENDPOINT).hostname.split('.').slice(-2).join('.');
    } catch {
      return 'appwrite.io';
    }
  })();
  const extra = (process.env.PRODUCT_IMAGE_HOSTS || 'picsum.photos').split(',').map((h) => h.trim()).filter(Boolean);
  return [appwriteHost, ...extra];
};

export function cleanProduct(row) {
  return {
    name: cleanText(row.name, 128) || 'Untitled product',
    brand: cleanText(row.brand, 64) || null,
    description: cleanText(row.description, 2000, { multiline: true }),
    category: CATEGORIES.includes(row.category) ? row.category : 'serums',
    imageUrl: safeHttpsUrl(row.imageUrl, imageHosts()),
    concerns: pickAllowed(row.concerns, CONCERN_KEYS.filter((k) => k !== 'skin_type')),
    skinTypes: pickAllowed(row.skinTypes, [...SKIN_TYPES, 'sensitive']),
  };
}

async function sanitizeProductRow(tables, row, log) {
  if (!row?.$id) return;
  const clean = cleanProduct(row);
  const dirty = Object.entries(clean).filter(([k, v]) => JSON.stringify(v ?? null) !== JSON.stringify(row[k] ?? null));
  if (!dirty.length) return; // already clean, so our own update doesn't loop
  log(`sanitized product ${row.$id}: ${dirty.map(([k]) => k).join(', ')}`);
  await tables.updateRow({ databaseId: DB, tableId: 'products', rowId: row.$id, data: Object.fromEntries(dirty) });
}


// ---------------------------------------------------------------------------
// Support assistant + human handoff
const ACTIVE_TICKET = ['open', 'pending'];
const short = (id) => id.slice(-6).toUpperCase();
const money = (c) => `$${(c / 100).toFixed(2)}`;

async function findActiveTicket(tables, userId) {
  const r = await tables.listRows({
    databaseId: DB,
    tableId: 'tickets',
    queries: [Query.equal('userId', userId), Query.equal('status', ACTIVE_TICKET), Query.orderDesc('$createdAt'), Query.limit(1)],
  });
  return r.rows[0] ?? null;
}

function saveMessage(tables, userId, role, body, extra = {}) {
  return tables.createRow({
    databaseId: DB,
    tableId: 'support_messages',
    rowId: ID.unique(),
    data: { userId, role, body: cleanText(body, 2000, { multiline: true }), ticketId: null, ...extra },
    permissions: ownerOnly(userId), // the shopper reads their own chat; admins read via table permission
  });
}

/** Builds Claude's message history from the stored chat (last 16 messages, roles alternated). */
export function toClaudeHistory(rows) {
  const out = [];
  for (const m of rows) {
    if (m.role === 'system') continue;
    const role = m.role === 'user' ? 'user' : 'assistant';
    const content = m.role === 'agent' ? `[Reply from a person on the myna support team] ${m.body}` : m.body;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n\n${content}`;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

async function supportChat(ctx, { message }) {
  const { tables, users, userId, log } = ctx;
  const raw = cleanText(message, 1000, { multiline: true });
  if (!raw) throw fail(400, 'Type a message');
  const text = redact(raw); // card-like numbers never get stored or sent to the model

  // Rate limit: 8 messages a minute, 150 a day, per shopper.
  const count = async (ms) =>
    (
      await tables.listRows({
        databaseId: DB,
        tableId: 'support_messages',
        queries: [Query.equal('userId', userId), Query.equal('role', 'user'), Query.greaterThan('$createdAt', new Date(Date.now() - ms).toISOString()), Query.limit(1)],
        total: true,
      })
    ).total;
  if ((await count(60_000)) >= 8) throw fail(429, 'You’re sending messages quickly. Wait a moment and try again.');
  if ((await count(86_400_000)) >= 150) throw fail(429, 'You’ve reached today’s chat limit. Our team will still see any open ticket.');

  // A person already owns this conversation: route the message to them, no AI reply.
  const active = await findActiveTicket(tables, userId);
  if (active) {
    await saveMessage(tables, userId, 'user', text, { ticketId: active.$id });
    await tables.updateRow({ databaseId: DB, tableId: 'tickets', rowId: active.$id, data: { status: 'open', lastMessage: text.slice(0, 250) } });
    return { handedOff: true, ticketId: active.$id };
  }

  await saveMessage(tables, userId, 'user', text);

  const recent = await tables.listRows({
    databaseId: DB,
    tableId: 'support_messages',
    queries: [Query.equal('userId', userId), Query.greaterThan('$createdAt', new Date(Date.now() - 86_400_000).toISOString()), Query.orderDesc('$createdAt'), Query.limit(16)],
  });
  const history = toClaudeHistory(recent.rows.reverse());

  let ticket = null;
  const handlers = {
    get_my_orders: async () => {
      const r = await tables.listRows({ databaseId: DB, tableId: 'orders', queries: [Query.equal('userId', userId), Query.orderDesc('$createdAt'), Query.limit(5)] });
      return r.rows.map((o) => ({
        id: short(o.$id),
        placed: o.$createdAt.slice(0, 10),
        status: o.status,
        total: money(o.totalCents),
        items: (JSON.parse(o.itemsJson || '[]') ?? []).map((l) => `${l.qty} x ${l.name}`),
      }));
    },
    get_my_account_status: async () => {
      const u = await users.get({ userId });
      const factors = await users.listMfaFactors({ userId }).catch(() => ({}));
      const scans = await tables.listRows({ databaseId: DB, tableId: 'scans', queries: [Query.equal('userId', userId), Query.orderDesc('$createdAt'), Query.limit(1)], total: true });
      const last = scans.rows[0];
      return {
        emailVerified: u.emailVerification,
        twoStepOn: u.mfa,
        authenticatorSetUp: !!factors.totp,
        emailCodesAvailable: !!factors.email,
        skinScans: scans.total,
        latestScan: last ? { date: last.$createdAt.slice(0, 10), status: last.status, error: last.error ?? null } : null,
      };
    },
    escalate_to_human: async ({ category, priority, summary }) => {
      if (ticket) return { ticketId: ticket.$id, ticket: short(ticket.$id) };
      const u = await users.get({ userId }).catch(() => null);
      ticket = await tables.createRow({
        databaseId: DB,
        tableId: 'tickets',
        rowId: ID.unique(),
        data: {
          userId,
          userName: cleanText(u?.name, 64) || 'Shopper',
          userEmail: u?.email ?? null,
          category: TICKET_CATEGORIES.includes(category) ? category : 'other',
          priority: PRIORITIES.includes(priority) ? priority : 'normal',
          status: 'open',
          subject: cleanText(summary, 120) || 'Support request',
          summary: cleanText(summary, 2000, { multiline: true }),
          lastMessage: text.slice(0, 250),
        },
        permissions: ownerOnly(userId),
      });
      return { ticketId: ticket.$id, ticket: short(ticket.$id) };
    },
  };

  const forced = mustEscalate(text);
  let reply = '';
  try {
    reply = (await runAssistant(history, handlers, { log })).text;
  } catch (e) {
    log(`assistant unavailable: ${e.message}`);
    const hit = faqFallback(text);
    if (hit) reply = `${hit.a} If that doesn’t solve it, tap “Talk to a person”.`;
  }

  // Guard rails the model can't skip: reactions, account takeovers, money, or "get me a person".
  if (forced && !ticket) {
    await handlers.escalate_to_human({ category: forced.category, priority: forced.priority, summary: `${forced.reason}. Shopper wrote: “${text.slice(0, 600)}”` });
  }
  if (!reply && !ticket) {
    await handlers.escalate_to_human({ category: 'technical', priority: 'normal', summary: `Assistant couldn’t answer. Shopper wrote: “${text.slice(0, 600)}”` });
  }
  if (forced?.category === 'product_reaction' && !/medical|emergency/i.test(reply)) {
    reply = `Please stop using the product and rinse with cool water. If you have swelling, trouble breathing or a severe reaction, get medical help right away. ${reply}`;
  }
  if (ticket && !reply) reply = 'I’ve passed this to our support team. A person will reply right here in this chat.';
  if (looksSensitive(raw)) reply = `For your security, never share card numbers, passwords or codes in chat; our team will never ask for them. ${reply}`;

  await saveMessage(tables, userId, 'assistant', reply, { ticketId: ticket?.$id ?? null });
  if (ticket) await saveMessage(tables, userId, 'system', `You’re connected with the myna support team (ticket #${short(ticket.$id)}). A person will reply here.`, { ticketId: ticket.$id });
  return { reply, ticketId: ticket?.$id ?? null };
}

async function agentReply(ctx, { ticketId, message, status = 'pending' }) {
  const { tables, teams, users, userId } = ctx;
  const m = await teams.listMemberships({ teamId: 'admins', queries: [Query.equal('userId', userId)] });
  if (!m.memberships.length) throw fail(403, 'Admins only');
  if (!isSafeId(ticketId)) throw fail(400, 'ticketId is required');
  if (!['open', 'pending', 'resolved'].includes(status)) throw fail(400, 'Invalid status');

  const t = await tables.getRow({ databaseId: DB, tableId: 'tickets', rowId: ticketId });
  const agent = cleanText((await users.get({ userId }).catch(() => null))?.name, 64) || 'myna Support';
  const body = cleanText(message, 2000, { multiline: true });
  if (body) await saveMessage(tables, t.userId, 'agent', body, { ticketId, agentName: agent });
  if (status === 'resolved') await saveMessage(tables, t.userId, 'system', 'This conversation was marked resolved. The assistant is back if you need anything else.', { ticketId });
  await tables.updateRow({ databaseId: DB, tableId: 'tickets', rowId: ticketId, data: { status, assignee: agent, ...(body ? { lastMessage: body.slice(0, 250) } : {}) } });
  return { ok: true };
}
