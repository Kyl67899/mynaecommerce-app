# Setting up and running myna

This guide takes you from a fresh download to the app running on your phone, with the admin and shopper test accounts working. Do the steps in order; each one needs the one before it.

**Time:** about 30 minutes. **Cost:** Appwrite Cloud's free plan is enough. YouCam scans use paid units, and Claude API calls are billed per use.

Checklist:

- [ ] 1. Install the tools
- [ ] 2. Create the Appwrite project
- [ ] 3. Get the YouCam and Claude keys
- [ ] 4. Make your encryption key
- [ ] 5. Create the database and test logins
- [ ] 6. Deploy the backend function
- [ ] 7. Turn on sign-in options
- [ ] 8. Configure the app
- [ ] 9. Run it
- [ ] 10. First sign-in as admin and as the tester

---

## 1. Install the tools

1. Install **Node.js 20 or newer** from [nodejs.org](https://nodejs.org). Check it with `node -v`.
2. Install the project's packages. From the project folder:

   ```bash
   npm ci
   ```

   Use `npm ci`, not `npm install`. It installs the exact tested versions from `package-lock.json`.
3. Install the **Appwrite CLI** (used to deploy the backend function):

   ```bash
   npm i -g appwrite-cli
   ```
4. Choose how you'll open the app:

   - **Your phone (easiest):** install **Expo Go** from the App Store or Google Play. Its SDK version must match the project (SDK 58). If it doesn't, see [Troubleshooting](TROUBLESHOOTING.md#expo-go-says-the-project-is-incompatible).
   - **iOS Simulator:** a Mac with Xcode.
   - **Android emulator:** Android Studio with a virtual device.
   - **Web browser:** nothing extra.

## 2. Create the Appwrite project

1. Sign in at [cloud.appwrite.io](https://cloud.appwrite.io) and create a project, for example "myna".
2. From the project's **Overview** page, note:

   - the **API endpoint**, like `https://nyc.cloud.appwrite.io/v1`
   - the **Project ID**
3. **Add apps.** Appwrite only accepts requests from apps you register (this is also your CORS protection). Go to **Overview → Apps → Add app** and add:

   | App type                          | Identifier                                     | When you need it                                       |
   | --------------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
   | React Native (or Android + Apple) | `com.myna.skin` for both                     | **always**: Expo Go, dev builds and store builds |
   | Web                               | `localhost`                                  | `npx expo start --web` on your computer              |
   | Web                               | your real domain, e.g. `myna-app.vercel.app` | a deployed web version                                 |

   The app tells Appwrite it is `com.myna.skin` (the `EXPO_PUBLIC_APPWRITE_PLATFORM` value in `.env`) on every request, including in Expo Go, so that's the identifier Appwrite checks. You don't need `host.exp.exponent` entries.
4. **Create a setup API key.** Go to **Overview → Integrations → API keys → Create API key**. Give it these scopes: Databases, Tables, Columns, Indexes, Rows, Buckets, Files, Users and Teams (read and write). The setup script uses it once. Keep it out of the app and out of git.

## 3. Get the YouCam and Claude keys

1. **YouCam:** sign up at the [YouCam API console](https://yce.perfectcorp.com/api-console/en/api-keys/), add units, and create an API key.
2. **Claude (support assistant):** create a key at [platform.claude.com](https://platform.claude.com). This one is optional: without it, the support bot answers from the FAQ by keyword and sends everything else to a person.

Both keys go only into the backend function's settings (step 6), never into the app.

## 4. Make your encryption key

The backend encrypts skin results and addresses with a master key you generate:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output. This is your `MASTER_KEK`.

> **Save it in a password manager now.** If you lose it, every user's encrypted skin results and addresses become unreadable, and nothing can recover them. Use the same value everywhere this guide asks for it.

## 5. Fill in your settings

There are two settings files. Both are git-ignored.

| File           | Holds                                                             | Read by                           |
| -------------- | ----------------------------------------------------------------- | --------------------------------- |
| `.env`       | the endpoint and project ID (not secret)                          | the app **and** the scripts |
| `.env.setup` | secrets: Appwrite API key, YouCam key, `MASTER_KEK`, Claude key | the scripts only, never the app   |

Because the scripts read the project ID from the app's `.env`, the database, the function and the app always land in the **same** Appwrite project.

```bash
cp .env.example .env                    # Windows: copy .env.example .env
cp .env.setup.example .env.setup        # Windows: copy .env.setup.example .env.setup
```

In `.env`, set `EXPO_PUBLIC_APPWRITE_ENDPOINT` and `EXPO_PUBLIC_APPWRITE_PROJECT_ID` (step 2). Put the **same** Project ID in `appwrite.json` → `"projectId"`.

In `.env.setup`, set:

- `APPWRITE_API_KEY`: the key from step 2. Add the **functions.read**, **functions.write** and **executions.read** scopes so it can deploy the function.
- `YOUCAM_API_KEY`: the key from the YouCam console (step 3). It is **not** the Appwrite key; Appwrite keys start with `standard_`.
- `MASTER_KEK`: the key from step 4.
- `ANTHROPIC_API_KEY`: optional (step 3).

Then check everything:

```bash
npm run doctor
```

It lists each problem with the command that fixes it, and never prints secret values.

## 6. Create the database and deploy the backend

```bash
npm run setup:appwrite      # database "myna", tables, buckets, products, test logins
npm run deploy:function     # the myna-api function that runs YouCam, checkout and support
npm run doctor              # should end with "Everything checks out"
```

`setup:appwrite` prints the **admin and tester passwords** at the end and saves them in `.credentials.local.txt`. It's safe to re-run: it skips what exists, updates permissions and resets the two test passwords. See [scripts/README.md](../scripts/README.md).

`deploy:function` creates or updates `myna-api` from `appwrite.json` (Node 22, execute access **Users**, 120 s timeout, events and scopes), copies `YOUCAM_API_KEY`, `MASTER_KEK` and the optional Claude key in as **secret** variables, uploads the code and waits for the build. Run it again whenever you change the function's code or a key. Without this step the scan fails with "Function with the requested ID could not be found".

Prefer the Appwrite CLI? `appwrite login` then `appwrite push functions` deploys the same function; add the variables under **Functions → myna-api → Settings** and redeploy. Details are in [functions/myna-api/README.md](../functions/myna-api/README.md).

## 7. Turn on sign-in options

In the Console, go to **Auth → Settings** and make sure these are enabled:

- **Email/Password**
- **Email OTP** (for "Email code" sign-in and the email second step)

Two-step verification (MFA) needs no switch. Users turn it on in the app.

Optional hardening under **Auth → Security**: password dictionary, password history, session limits.

## 8. Check the app settings

`.env` from step 5 is all the app needs. Leave the other values as they are unless you renamed something, and restart with `npx expo start -c` after any change.

> Everything in `.env` starting with `EXPO_PUBLIC_` is built into the app and visible to anyone who has it. Never put the YouCam key, Claude key, Appwrite API key or `MASTER_KEK` in `.env`; they belong in `.env.setup`.

## 9. Run it

```bash
npx expo start
```

A QR code and a menu appear in the terminal:

| To open on       | Do this                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Your phone       | Scan the QR code: with the Camera app on iPhone, or from inside Expo Go on Android. Phone and computer must be on the same Wi-Fi. |
| iOS Simulator    | Press `i`                                                                                                                       |
| Android emulator | Press `a` (start the emulator in Android Studio first)                                                                          |
| Web browser      | Press `w`                                                                                                                       |

Different networks, or a work/school Wi-Fi that blocks devices? Run `npx expo start --tunnel` instead.

Changed `.env`? Stop the server and restart with `npx expo start -c` to clear the cache.

## 10. First sign-in

**Admin**

1. In the app, go to **Account → Sign in** and use `admin@example.com` with the password from step 5.
2. The dashboard asks for two-step verification first. Tap **Set up 2-step**, scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password), and enter the 6-digit code. The QR code refreshes every 2 minutes until you finish, so if it changes, scan the new one.
3. Save the recovery codes, turn on 2-step, and open the dashboard.

**Test shopper**

1. Sign out, then sign in as `tester@example.com`.
2. Try the **Skin scan** tab, the shop and bag, **Account → Help & support** and **My dashboard**.

**Demo the live features:** run the admin on one device and the tester on another. The list of things to try is in [FEATURES.md](FEATURES.md#try-the-real-time-features).

The `@example.com` accounts can't receive email, so use the authenticator app with them. To test email codes, re-run the setup script with `ADMIN_EMAIL` and `TEST_EMAIL` set to inboxes you control.

---

## Before you launch

- [ ] Replace the **[POLICY]** placeholders (shipping times, returns) in `functions/myna-api/src/support-faq.js`, then redeploy the function. The support bot repeats them to customers.
- [ ] Replace the seed product photos and details in `scripts/seed-products.mjs`, or edit products in the admin dashboard.
- [ ] Match the brand colors and fonts in `src/lib/theme.ts`.
- [ ] Remove the Expo Go and `localhost` platforms from Appwrite (step 2), keeping only your real app IDs and domain.
- [ ] Delete the demo analytics rows (tagged `demo:true`) from the `events` table if you seeded them.
- [ ] Change or delete the test accounts.
- [ ] Add payments. Checkout places orders but doesn't charge yet; see the next steps in [FEATURES.md](FEATURES.md#good-next-steps).

## Building the app for real devices and stores

Expo Go is for development. To install the app like a normal app, or publish it, build it with EAS (Expo's build service, no Xcode or Android Studio needed):

```bash
npm i -g eas-cli
eas login
eas build:configure                     # creates eas.json the first time
eas build --profile preview --platform android   # Android test build you can install directly
eas build --profile production --platform all    # store builds
eas submit                              # upload to the App Store / Google Play
```

Builds read `EXPO_PUBLIC_` values at build time. Add them as EAS environment variables (`eas env:create`) or keep them in `.env` when building locally.

For a development build with live reload on your own device, install `expo-dev-client` (`npx expo install expo-dev-client`) and run `eas build --profile development`.

## Deploying the web version

```bash
npx vercel
```

`vercel.json` builds the web app with `expo export --platform web` and adds the security headers (Content-Security-Policy and others). Set `EXPO_PUBLIC_APPWRITE_ENDPOINT` and `EXPO_PUBLIC_APPWRITE_PROJECT_ID` in the Vercel project's environment variables, and add your Vercel domain as a **Web** platform in Appwrite.
