# myna security

How the app protects accounts, skin data and payments, and what it doesn't protect against.

1. **In transit:** everything is HTTPS/WSS (Appwrite, YouCam).
2. **Selfies at rest:** the `scans` bucket is created with Appwrite's built-in encryption (AES-256) and antivirus on. Each file is readable/deletable only by its owner (`fileSecurity`).
3. **Application-level AES-256-GCM (envelope encryption)** for the sensitive fields: skin results (`scans.payloadEnc`) and shipping addresses (`orders.shippingEnc`).
   - `MASTER_KEK` (32 random bytes) lives only in the function's environment variables.
   - Each user gets a random 256-bit **data key (DEK)**, stored only *wrapped* by the KEK in `profiles.wrappedDek`.
   - The app fetches its DEK once over TLS, keeps it in the iOS Keychain / Android Keystore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), and deletes it on sign-out.
   - Every ciphertext is bound to its owner and purpose with GCM additional data (`scan:<userId>`, `order:<userId>`), so a value copied into someone else's row fails to decrypt. Tampering is detected by the GCM auth tag.
   - Format shared by app and server: `v1:` + base64(`iv[12] ‖ ciphertext ‖ tag[16]`). `npm test` proves the two implementations interoperate.
4. **Authorization:** every table uses row-level security. Users can't create scans/orders/profiles directly; only the function can, and it grants read to the owner only. The function trusts `x-appwrite-user-id` (set by Appwrite from the session), never a user id in the body.
5. **Admin access** is an Appwrite **team** (`admins`), not a flag in the app. Table and bucket permissions grant product writes, all-order read/update, and analytics read to `team:admins` only, so a modified app still can't do admin things. Admins can't read customers' skin results or decrypt their addresses.
6. **Analytics are anonymized:** the `events` table stores totals, product ids and concern scores, never user ids, emails or addresses.
7. **Two-step verification:** built on Appwrite MFA, so it's enforced by the server: with MFA on, a password-only session can't read or write anything until a TOTP, email or recovery code is verified. The authenticator QR is drawn on the device (the secret never goes to a QR web service or into a URL), and an unverified secret is discarded and replaced every 2 minutes. Note: authenticator apps show a new 6-digit code every 30 seconds; that's the TOTP standard and what every app supports.
8. **Cross-site scripting (XSS):**
   - The app renders text, never HTML (no WebView, no `dangerouslySetInnerHTML`).
   - Everything typed is sanitized twice: in the app, and again in the function before it's stored. Tags, `javascript:`/`data:` URLs, inline `on*=` handlers and control characters are removed (`npm test` runs OWASP payloads through both and checks they match).
   - Admins write products straight to the database, so an **event-triggered sanitizer** re-cleans every product create/update on the server and drops image URLs that aren't https on an allowed host.
   - Deep-link parameters (`myna://product/<id>`) are validated as Appwrite ids before use; scan modes, concerns and order items are allowlisted on the server.
   - Web build: `vercel.json` sends a strict **Content-Security-Policy** (scripts only from your domain plus one hashed Expo hydration line; network only to Appwrite), `frame-ancestors 'none'`, HSTS, `nosniff` and a referrer policy.
9. **CORS:** Appwrite only accepts browser requests from hostnames you register as Web platforms. Add just your real domain(s); never `*`.
10. **Support chat:** the assistant's tools only read the signed-in shopper's own data (the user id comes from Appwrite's session header, never from the AI or the message). Messages are sanitized, card-like numbers are redacted before storage or the AI sees them, chats are rate-limited (8/minute, 150/day), and the system prompt treats shopper text as data, not instructions. Only the function writes chat rows; agent replies go through an admin-checked route. If Claude is unreachable, the bot answers from the FAQ by keyword or opens a ticket, so shoppers are never stuck.
11. **Money:** the client never sends prices. The server reads prices from `products` and uses `decrementRowColumn(min: 0)` to reserve stock, rolling back if any line fails.

**Limits to know:** this is encryption against database leaks and other users, not end-to-end against yourself as the operator: the function holds the KEK, because it must write results. The selfie is sent to Perfect Corp for analysis (disclosed in the app). Treat skin scores as cosmetic guidance, not medical advice; the app says so.
