# myna — skin analysis + beauty store

A React Native (Expo) shopping app for the myna store. A selfie goes through YouCam AI skin analysis, which detects skin type and scores up to 16 concerns, then the app recommends products in real time. It has an admin dashboard with live analytics, two-step login, and an AI support assistant that hands off to a person.

- **App:** Expo SDK 58 · React Native 0.88 · Expo Router · TypeScript (iOS, Android, web)
- **Backend:** Appwrite (Auth, TablesDB, Storage, Realtime, Functions)
- **AI:** YouCam skin analysis, Claude (support assistant)

## How to run it

**First time?** Follow **[docs/SETUP.md](docs/SETUP.md)**. It takes about 30 minutes and walks through every account, key and Console setting.

**Already set up?** These are all you need day to day:

```bash
npm ci            # install dependencies (first run or after pulling changes)
npm run doctor    # check the app and Appwrite agree (project, database, function, keys)
npx expo start    # start the app, then press i (iOS), a (Android), w (web) or scan the QR with Expo Go
```

If something goes wrong, check **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)**.

## What you need

| You need | Why | Where |
| --- | --- | --- |
| Node.js 20 or newer (tested on 22) and npm | runs Expo and the scripts | [nodejs.org](https://nodejs.org) |
| An Appwrite project | login, database, files, live updates, backend function | [cloud.appwrite.io](https://cloud.appwrite.io) |
| A YouCam API key | skin analysis (each scan uses units) | [YouCam API console](https://yce.perfectcorp.com/api-console/en/api-keys/) |
| A Claude API key | support assistant (optional, the bot falls back to the FAQ without it) | [platform.claude.com](https://platform.claude.com) |
| A phone with Expo Go, or Xcode / Android Studio | to open the app | App Store / Google Play |

## Test logins

`npm run setup:appwrite` creates these accounts and prints their passwords once. It also saves them to `.credentials.local.txt`, which is git-ignored.

| Login | Email | What it opens |
| --- | --- | --- |
| Admin | `admin@example.com` | Admin dashboard. The first sign-in asks you to set up two-step verification. |
| Test shopper | `tester@example.com` | The store, skin scan, My dashboard and support chat |

Re-running the setup script resets both passwords.

## Commands

| Command | What it does |
| --- | --- |
| `npx expo start` | Start the dev server. Add `-c` to clear the cache after changing `.env`. |
| `npm run ios` / `npm run android` / `npm run web` | Start and open one platform directly |
| `npm run doctor` | Check that `.env`, `.env.setup`, `appwrite.json` and the Appwrite project agree, and say what to fix |
| `npm run setup:appwrite` | Create or update the Appwrite tables, buckets, products and test logins (safe to re-run) |
| `npm run deploy:function` | Create or update the `myna-api` backend function, set its secret keys and deploy its code (safe to re-run) |
| `npm run lint` | ESLint (Expo config) |
| `npm test` | Run the 43 tests (encryption, XSS, YouCam flow, recommendations, dashboard math, support bot) |
| `npm run typecheck` | Check TypeScript types |

## Docs

| Page | Read it for |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | First-time setup, running on a phone, simulator or web, and building the app |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Fixes for common errors |
| [docs/FEATURES.md](docs/FEATURES.md) | Everything the app does, and a script for demoing the real-time features |
| [docs/SECURITY.md](docs/SECURITY.md) | Encryption, two-step login, XSS protection, permissions |
| [functions/myna-api/README.md](functions/myna-api/README.md) | The backend function: routes, environment variables, deploying, logs |
| [scripts/README.md](scripts/README.md) | The setup, seed and test scripts and their options |

## Project layout

```
src/app/              screens (Expo Router: each file is a route)
  (tabs)/             Home · Shop · Skin scan · Bag · Account
  admin/              admin dashboard, orders, products, support inbox
src/components/       shared UI
src/context/          sign-in state and the live bag
src/services/         data + live-update hooks (products, scans, orders, support, admin)
src/lib/              Appwrite client, encryption, input sanitizing, recommendations, theme
functions/myna-api/   the Appwrite Function (skin analysis, orders, encryption keys, support bot)
scripts/              Appwrite setup, seed data, tests
docs/                 setup, troubleshooting, features, security
```
# mynaecommerce-app
