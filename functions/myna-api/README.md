# myna-api (Appwrite Function)

The app's backend. It runs on Appwrite Functions (Node 22) and does everything that needs a secret or must not be trusted to the phone: skin analysis with YouCam, pricing and saving orders, handing out encryption keys, the AI support assistant, and cleaning product data.

The app calls it with `functions.createExecution` (see `src/lib/appwrite.ts`). Appwrite adds the caller's user id to every request, so the function always acts as the signed-in user and never trusts a user id sent in the body.

## Routes

| Route | Called by | What it does |
| --- | --- | --- |
| `POST /keyring` | app, after sign-in | Returns the user's AES-256 data key, creating it on first use. Stored wrapped by `MASTER_KEK`. |
| `POST /scan` | Skin scan tab (runs in the background) | Downloads the selfie, runs YouCam SD or HD analysis with the chosen concerns, detects skin type, saves the encrypted result. The app watches the scan row live. |
| `POST /order` | Checkout | Prices items from the database, reserves stock atomically, encrypts the address, saves the order, empties the bag. |
| `POST /support/chat` | Help & support | Sends the message to Claude with read-only tools for the shopper's own orders and account. Opens a ticket for a person when needed. |
| `POST /support/agent-reply` | Admin support inbox | Admin-only (checked against the `admins` team). Posts a person's reply into the shopper's chat and updates the ticket. |

## Events

Set in `appwrite.json`, so the function also runs automatically when:

| Event | Does |
| --- | --- |
| `users.*.create` | Counts a sign-up for the admin dashboard |
| `tablesdb.myna.tables.products.rows.*.create` / `.update` | Strips HTML/code from product text and drops unsafe image links |

## Environment variables

Set these in **Console → Functions → myna-api → Settings → Environment variables**, then redeploy.

| Variable | Required | What it is |
| --- | --- | --- |
| `YOUCAM_API_KEY` | yes | YouCam API key, for skin analysis |
| `MASTER_KEK` | yes | 32 random bytes, base64. Wraps every user's data key. **Back it up; losing it makes encrypted data unreadable.** Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `ANTHROPIC_API_KEY` | recommended | Claude API key for the support assistant. Without it, the bot answers from the FAQ by keyword or opens a ticket. |
| `SUPPORT_MODEL` | no | Claude model id. Default `claude-haiku-5-5`. |
| `PRODUCT_IMAGE_HOSTS` | no | Comma-separated extra hosts allowed for product images. Default `picsum.photos` (your Appwrite host is always allowed). |
| `YOUCAM_ACTIONS` | no | Override the default concern list (comma-separated YouCam action names) |
| `YOUCAM_BASE_URL` | no | Default `https://yce-api-01.makeupar.com/s2s/v2.0` |
| `DB_ID` / `SCANS_BUCKET_ID` | no | Only if you renamed the database (`myna`) or bucket (`scans`) |

Appwrite provides `APPWRITE_FUNCTION_API_ENDPOINT`, `APPWRITE_FUNCTION_PROJECT_ID` and a per-run API key automatically. You don't set those.

## Deploying (recommended)

```bash
npm run deploy:function
```

Run from the project root. It creates or updates this function, sets its variables from `.env.setup` and deploys the code, then waits for the build. See [scripts/README.md](../../scripts/README.md#npm-run-deployfunction).

## Deploying with the Appwrite CLI or by hand

With the Appwrite CLI, from the project root:

```bash
appwrite login
appwrite push functions     # pick myna-api
```

`appwrite.json` sets the runtime, entrypoint, build command, events, scopes, 120-second timeout and execute access (signed-in users).

**Manual upload instead:** zip this folder **without** `node_modules` and create a function in the Console with:

- Runtime: **Node 22**
- Entrypoint: `src/main.js`
- Build command: `npm install --omit=dev`
- Timeout: **120** seconds (scans poll YouCam for up to 90 seconds)
- Execute access: **Users**
- Events and scopes: copy them from `appwrite.json` (Settings → Events, and Settings → Scopes)

Redeploy after any code or environment-variable change.

## Logs

**Console → Functions → myna-api → Executions.** Each call shows its route, status and logs. Errors shown to shoppers are deliberately vague ("Something went wrong"); the real message is here. Common ones are listed in [docs/TROUBLESHOOTING.md](../../docs/TROUBLESHOOTING.md#skin-scan).

## Files

| File | Contents |
| --- | --- |
| `src/main.js` | Request routing, keyring, scan, order and support routes, product sanitizer |
| `src/youcam.js` | YouCam upload → task → poll, SD/HD concern mapping, skin-type detection |
| `src/crypto.js` | AES-256-GCM encryption and key wrapping (matches `src/lib/crypto.ts` in the app) |
| `src/support.js` | Claude prompt, tools and tool loop, escalation rules, FAQ fallback |
| `src/support-faq.js` | **What the support bot knows.** Edit this, then redeploy. Replace the `[POLICY]` placeholders before launch. |
| `src/sanitize.js` | XSS / input cleaning for everything stored |
| `src/analytics.js` | Anonymized dashboard events |

## Testing it locally

There's no local server. The tests import the function directly and fake Appwrite, YouCam and Claude, so they need no keys. From the project root:

```bash
npm test
```
