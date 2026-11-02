# scripts

Setup, seed data and tests. Run them from the project root.

## `npm run setup:appwrite`

Creates everything the app needs in your Appwrite project. It's safe to run again: anything that already exists is skipped, and table permissions are updated to the current version.

### Settings

All three scripts (`setup:appwrite`, `doctor`, `deploy:function`) read the same two git-ignored files through `scripts/lib/env.mjs`: `.env` (the app's settings) and `.env.setup` (script-only secrets). Values set in your shell win over both.

| Variable | File | Value |
| --- | --- | --- |
| `EXPO_PUBLIC_APPWRITE_ENDPOINT` | `.env` | e.g. `https://nyc.cloud.appwrite.io/v1` |
| `EXPO_PUBLIC_APPWRITE_PROJECT_ID` | `.env` | your project ID; the scripts use the app's own value, so they always provision the project the app talks to |
| `APPWRITE_API_KEY` | `.env.setup` | a server API key with Databases, Tables, Columns, Indexes, Rows, Buckets, Files, Users, Teams and Functions scopes |

`APPWRITE_ENDPOINT` / `APPWRITE_PROJECT_ID` still work as overrides, but if they name a different project than `.env` or `appwrite.json`, every script stops and lists the mismatch.

Needs Node 20.12 or newer (for reading the settings files).

### Optional settings

These go in `.env.setup` too.

| Variable | Effect |
| --- | --- |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin login. Default `admin@example.com` with a random password. A real email is also marked verified so it can receive email codes. |
| `TEST_EMAIL` / `TEST_PASSWORD` | Test shopper login. Default `tester@example.com` with a random password. |
| `MASTER_KEK` | The same value as the function's. Gives the test shopper one encrypted skin report and two orders. |
| `SEED_DEMO_ANALYTICS=1` | Adds 30 days of sample orders, scans and sign-ups for the admin charts, tagged `demo:true` |

### What it creates

| Kind | Name | Notes |
| --- | --- | --- |
| Database | `myna` | |
| Team | `admins` | members get admin access |
| Table | `products` | public read, admin write |
| Table | `profiles` | each user's wrapped encryption key |
| Table | `carts` | one live bag per user |
| Table | `scans` | encrypted skin results, owner-only |
| Table | `orders` | encrypted addresses; owner reads their own, admins read and update all |
| Table | `events` | anonymized analytics, admin read |
| Table | `tickets` | support tickets |
| Table | `support_messages` | support chat |
| Bucket | `scans` | selfies, encrypted at rest, owner-only |
| Bucket | `product-images` | public product photos, admin upload |
| Rows | 12 products | from `seed-products.mjs` |
| Users | `myna-admin`, `myna-tester` | printed once and saved to `.credentials.local.txt` (git-ignored) |

Re-running resets both test passwords.

## `npm run doctor`

Read-only health check. Confirms the project IDs agree, the keys are set (it never prints them, and flags a `standard_…` Appwrite key pasted as the YouCam key), and that the database, tables, buckets, `admins` team and `myna-api` function exist, with execute access for users, a ready deployment and its variables. Each ✗ line names the fix.

## `npm run deploy:function`

Creates or updates `myna-api` from `appwrite.json`, sets `YOUCAM_API_KEY`, `MASTER_KEK`, `ANTHROPIC_API_KEY` (if present), `DB_ID` and `SCANS_BUCKET_ID` as function variables (keys marked secret), packages `functions/myna-api` without `node_modules`, uploads it, and waits until the build is ready. Safe to re-run.

## Files

| File | What it is |
| --- | --- |
| `setup-appwrite.mjs` | The setup script above, including the table schema |
| `doctor.mjs` / `deploy-function.mjs` | The checks and the function deploy above |
| `lib/env.mjs` | Shared settings loader and project-ID check |
| `seed-products.mjs` | The starter catalog. Each product lists the skin concerns it treats and the skin types it suits, which drives recommendations. Replace the sample photos with real ones. |
| `seed-users.mjs` | Admin and tester accounts, tester demo data, demo analytics |
| `*.test.mjs` | Tests (see below) |
| `test-shims/` | A small stand-in for `expo-crypto` so app code can be tested in Node |

## `npm test`

Runs 43 tests with Node's built-in test runner. They need no keys or network: Appwrite, YouCam and Claude are faked.

| File | Covers |
| --- | --- |
| `crypto-interop.test.mjs` | The app and server encrypt and decrypt each other's data; tampering, wrong keys and moved data are rejected |
| `function.test.mjs` | The YouCam flow end to end, error messages, function sign-in and input checks |
| `admin.test.mjs` | Dashboard math (totals, changes, gaps, reach), anonymized events, admin/tester seeding |
| `security.test.mjs` | Known XSS attack strings, link and id checks, the product sanitizer, SD/HD mapping, skin-type detection |
| `recommend.test.mjs` | Skin-type-aware product recommendations |
| `support.test.mjs` | The support bot's Claude tool loop, forced handoffs, hiding card numbers, FAQ fallback |

Run one file: `node --test scripts/support.test.mjs`
