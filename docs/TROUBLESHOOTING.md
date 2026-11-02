# Troubleshooting

Find the message or symptom you're seeing. Most problems come down to a missing setting in the Appwrite Console or a function environment variable.

**Start here:** run `npm run doctor`. It checks that the app, the scripts and `appwrite.json` point at the same Appwrite project, that the database, tables, buckets and function exist, and that the function's keys are set.

**Then, for any backend problem:** open **Appwrite Console → Functions → myna-api → Executions**, click the failed execution, and read its **Logs** and **Errors**. The app shows shoppers friendly messages like "Something went wrong" on purpose, so the real cause is only in these logs.

---

## Starting the app

### "Missing EXPO_PUBLIC_APPWRITE_ENDPOINT. Copy .env.example to .env and fill it in."
The app can't find its settings.
1. Make sure a file named exactly `.env` exists in the project folder (not `.env.txt`).
2. Fill in `EXPO_PUBLIC_APPWRITE_ENDPOINT` and `EXPO_PUBLIC_APPWRITE_PROJECT_ID`.
3. Restart with the cache cleared: `npx expo start -c`.

### "Package subpath './src/lib/TerminalReporter' is not defined by "exports" in …/metro/package.json"
An older Expo CLI is starting the project. The project uses Metro 0.87, which no longer exposes `metro/src/...` files; the SDK 58 CLI loads them a different way. Usually a global `expo` or `expo-cli` is installed, or `node_modules` came from `npm install --force` or `--legacy-peer-deps`.

1. Remove any global Expo CLI:
   ```bash
   npm ls -g --depth=0        # look for expo or expo-cli
   npm uninstall -g expo-cli expo
   ```
2. Reinstall cleanly from the lockfile:
   ```bash
   rm -rf node_modules .expo
   npm ci
   ```
3. Check the versions. `npx expo --version` should print `58.x`, and `npm ls metro` should show `metro@0.87.1`.
4. Start with `npx expo start -c` (always `npx expo`, never a bare `expo`).

### `npm ci` fails with ERESOLVE … eslint
Fixed: the project now uses ESLint 9 (`eslint.config.js`). Pull the latest code, then `rm -rf node_modules && npm ci`.

### `npm install` fails with ERESOLVE or peer dependency errors
Use `npm ci` instead. It installs the exact versions in `package-lock.json`. If it still fails, delete `node_modules` and run `npm ci` again. Don't use `--force` or `--legacy-peer-deps`.

### Expo Go says the project is incompatible
Expo Go only runs projects built for its SDK version, and this project uses **SDK 58**.
- Update Expo Go from the App Store or Google Play.
- If the store version doesn't support SDK 58 yet, use a simulator/emulator, or make a development build: `npx expo install expo-dev-client`, then `eas build --profile development`. See [SETUP.md](SETUP.md#building-the-app-for-real-devices-and-stores).

### Phone can't connect to the dev server
- Phone and computer must be on the same Wi-Fi.
- Office, school and hotel networks often block this. Run `npx expo start --tunnel`.
- Turn off VPNs on both devices.

---

## Setup script

### "Missing: EXPO_PUBLIC_APPWRITE_ENDPOINT, EXPO_PUBLIC_APPWRITE_PROJECT_ID, APPWRITE_API_KEY"
The scripts read the endpoint and project ID from `.env` and the API key from `.env.setup`. Create both from their `.example` files, replace everything in `< >`, and run the command again.

### "These point at DIFFERENT Appwrite projects"
`.env`, `.env.setup` (if it sets `APPWRITE_PROJECT_ID`) and `appwrite.json` name different projects, so the database or function ends up in a project the app isn't using. Open the project you use in the Console, copy its ID from **Overview**, and put that one ID in all of them. You can delete `APPWRITE_PROJECT_ID` from `.env.setup`; the scripts use the app's ID.

### "fetch failed" on the first step
The endpoint is wrong or unreachable. Copy it exactly from **Overview** in the Console, e.g. `https://nyc.cloud.appwrite.io/v1`, including `/v1`.

## Signing in

### "Invalid Origin. Register your new client …" or every request fails right away
Appwrite doesn't recognize the app. In **Console → Overview → Apps → Add app**, register the identifier the app sends:
- Phones (Expo Go and your own builds): React Native, or Android and Apple, with `com.myna.skin`. It must match `EXPO_PUBLIC_APPWRITE_PLATFORM` in `.env` exactly.
- Web on your computer: Web, `localhost`
- Deployed web: Web, your exact domain

### "Missing EXPO_PUBLIC_APPWRITE_PLATFORM"
Set `EXPO_PUBLIC_APPWRITE_PLATFORM=com.myna.skin` in `.env`, then restart with `npx expo start -c`.

### "That email and password don't match."
- The test passwords change every time the setup script runs. Use the latest ones from `.credentials.local.txt`.
- Emails are case-insensitive, but check for typos.

### Email codes never arrive
- Check **Auth → Settings → Email OTP** is enabled.
- `@example.com` addresses can't receive mail. Re-run the setup script with `ADMIN_EMAIL` and `TEST_EMAIL` set to real inboxes, or use the authenticator app instead.
- Check the spam folder.
- Self-hosted Appwrite needs SMTP configured under **Settings → SMTP**.

### "That code is wrong or has expired."
- Email codes expire quickly. Tap **Send a new code**.
- Authenticator codes change every 30 seconds. Type the current one.
- Set your phone's clock to automatic (**Settings → Date & Time**). A clock that's off by even a minute breaks authenticator codes.
- If you scanned a setup QR code that later refreshed, delete that entry in the authenticator app and scan the new one.

### Locked out of the admin account
- At the two-step screen, choose **Use a recovery code**.
- No recovery codes either? Re-run the setup script to reset the password, then in **Console → Auth → Users → myna-admin**, turn off MFA or delete the authenticator, and set it up again.

### Stuck on "Verify it's you" after reopening the app
The session is waiting for its second step. Finish it, or tap **Cancel and sign out** and sign in again.

---

## Admin dashboard

### "Admins only" when signing in as admin
- The account must be in the `admins` team. Check **Console → Auth → Teams → admins → Members**. Re-running the setup script adds `myna-admin` again.
- Sign out and back in after changing team membership.

### "Turn on two-step verification" blocks the dashboard
Admin accounts must use 2-step. Tap **Set up 2-step** and follow [SETUP.md step 10](SETUP.md#10-first-sign-in).

### Dashboard charts are empty
Analytics come from real orders, scans and sign-ups. To see sample data, re-run the setup script with `SEED_DEMO_ANALYTICS=1`. New sign-ups only count once the function is deployed with its `users.*.create` event.

### Saving a product fails
- Only `admins` team members can write products. Re-run the setup script to apply the table permissions.
- Image links must start with `https://`. Uploaded photos always work.

### A product's name or image changed by itself after saving
That's the server's XSS sanitizer. It strips HTML and code from product text, and drops image links that aren't https on an allowed host. To allow another image host, set `PRODUCT_IMAGE_HOSTS` on the function (see [functions/myna-api/README.md](../functions/myna-api/README.md)).

---

## Skin scan

### "Could not start your scan" — "Function with the requested ID could not be found"
The Appwrite project the app uses has no `myna-api` function. Either it was never deployed, or it was deployed to a different project.
1. `npm run doctor`. If it reports different project IDs, make them match first.
2. `npm run deploy:function`. Wait for "myna-api is live".
3. Restart the app with `npx expo start -c` and scan again.

The app now says this in plain words: "The myna-api backend function isn't deployed in this Appwrite project yet."

### "Database "myna" doesn't exist in this Appwrite project"
`npm run setup:appwrite` hasn't run against this project, or `EXPO_PUBLIC_APPWRITE_DB_ID` names a database you made by hand. Leave `EXPO_PUBLIC_APPWRITE_DB_ID=myna`, run `npm run setup:appwrite`, then `npm run deploy:function` (the function's `DB_ID` follows the app's value).

### YouCam `http_401` right after deploying
`YOUCAM_API_KEY` holds the wrong key. A value starting with `standard_` is an Appwrite key. Put the key from the YouCam API console in `.env.setup` and run `npm run deploy:function`.

### Scan stays on "Analyzing…" forever
The function didn't finish. Check **Functions → myna-api → Executions** for a failed `/scan`:
- `YOUCAM_API_KEY is not set`: add it to `.env.setup` and run `npm run deploy:function`.
- `MASTER_KEK is not set` or `MASTER_KEK must be 32 bytes, base64-encoded`: put the exact value you generated in `.env.setup` and run `npm run deploy:function`.
- A YouCam `http_401` or `http_403` error: the key is wrong, or the account is out of units.
- Timeout: the function timeout must be 120 seconds (set in `appwrite.json`).

### "Let's retake that" with a photo message
These come from YouCam and describe the photo: too dark, face too small, face out of frame, no face found. Use soft, even light, face the camera, and fill more of the frame.

### "HD analysis needs a photo at least 1080px on its short side."
Switch to **SD**, or use a sharper, higher-resolution photo. Front cameras on some phones are below 1080px.

### Skin type shows "Estimated from your oil, hydration and redness scores"
YouCam didn't return a skin-type label the app could read, so it estimated the type instead. Check one real HD scan's raw result in the function logs, and if YouCam uses a different field name, update `findLabel` in `functions/myna-api/src/youcam.js`.

### "Could not decrypt this scan on this device."
The function's `MASTER_KEK` changed after the scan was saved. Put the original value back and redeploy. Data encrypted with a lost key can't be recovered.

---

## Shop

### No products on Home or Shop
Run `npm run doctor` and look at the products lines:
- **"the products table is empty"**: `npm run setup:appwrite` didn't reach "Seed products" (it stops at the first ✗; fix that line and run it again), or it ran against another project.
- **"shoppers aren't allowed to read products"** or **"see 0 products"**: run `npm run setup:appwrite` to reset the table permissions.
- **"the Shop tab's query fails"**: the table was made by hand and is missing columns. Delete the `products` table in the Console and run `npm run setup:appwrite`.
- All green but the app still shows nothing: the app is pointed somewhere else. Check `.env` has the same project and `EXPO_PUBLIC_APPWRITE_DB_ID=myna` (or blank), then restart with `npx expo start -c`. The Shop tab shows the exact error under "Could not load products".

## Orders and bag

### "Something went wrong" at checkout
Check the `/order` execution logs. The usual cause is `MASTER_KEK` missing on the function.

### "Some items just sold out. Your cart has been refreshed."
Working as intended: stock is checked and reserved on the server at checkout.

### Bag or order status doesn't update live
- Both devices must be signed into the same account, and online.
- Pull down to refresh after a device was offline.
- Re-run the setup script so table permissions are current. Realtime only delivers rows you're allowed to read.

---

## Support chat

### The assistant only gives FAQ-style answers, or hands everything to a person
`ANTHROPIC_API_KEY` is missing or invalid on the function. Add it and redeploy. Without it, the bot falls back to keyword answers from the FAQ.

### "You're sending messages quickly. Wait a moment and try again."
The chat allows 8 messages a minute and 150 a day per shopper. Change the limits in `supportChat` in `functions/myna-api/src/main.js`.

### Admin replies don't show up for the shopper
Re-run the setup script so the `tickets` and `support_messages` tables exist with current permissions, and check the `/support/agent-reply` execution logs.

---

## Web version

### Blank page in the browser after deploying
Open the browser console. A Content-Security-Policy error naming a `sha256-…` hash means an Expo update changed its inline startup script. Copy the new hash into `script-src` in `vercel.json` and redeploy.

### Requests blocked with a CORS error
Add your exact web domain as a **Web** platform in Appwrite. Don't use a wildcard.

---

## Still stuck?

Run the checks:

```bash
npm run doctor
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

`expo-doctor` finds dependency versions that don't match the Expo SDK, and `npx expo install --fix` fixes them.
