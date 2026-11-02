// The knowledge the support assistant answers from. Edit this file to change what it knows.
// Anything marked [POLICY] is a placeholder: replace it with your real store policy before launch.
// The assistant is told to answer only from this text and the tools, and to hand off otherwise.

export const FAQ = [
  {
    id: 'scan-how',
    q: 'How does the skin analysis work?',
    a: 'Open the Skin scan tab (it lives in your account). Pick SD or HD mode and the concerns you want, then take a selfie or choose a photo. YouCam AI scores each concern from 0 to 100 (higher is healthier), detects your skin type, and builds a routine from our products. Results are encrypted with AES-256 and only your signed-in device can read them. It is cosmetic guidance, not a medical diagnosis.',
  },
  {
    id: 'scan-failed',
    q: 'My scan failed or says retake',
    a: 'Most failures are photo issues. Face a window or soft even light, remove glasses, pull hair back, no makeup or filters, hold the phone at eye level, and keep your whole face inside the frame. "Too dark" means more light; "face too small" means move closer. HD mode needs a sharp photo at least 1080 pixels on its short side; if HD fails, try SD. If it still fails after two tries, we can escalate it.',
  },
  {
    id: 'scan-sd-hd',
    q: 'What is the difference between SD and HD?',
    a: 'SD is fast and works with any phone camera. HD analyzes finer detail for each concern but needs a sharper, higher-resolution photo (at least 1080px on the short side). You choose concerns all in SD or all in HD, not mixed.',
  },
  {
    id: 'skin-type',
    q: 'How is my skin type detected?',
    a: 'Tick "Skin type" in the concern picker. You will see Normal, Oily, Dry or Combination, plus Redness-prone if that applies, with T-zone and U-zone detail when available. If the AI does not return a label, the app estimates the type from your oil, hydration and redness scores and says so. Your "For your skin type" product shelf updates live as products and stock change.',
  },
  {
    id: 'scan-privacy',
    q: 'Who can see my selfie and results?',
    a: 'Only you. Your selfie is stored encrypted and readable only by your account. It is sent to Perfect Corp YouCam for analysis. Scores are encrypted with a key unique to your account before they are saved, and our staff cannot read them. Delete any scan from its report screen.',
  },
  {
    id: 'mfa-setup',
    q: 'How do I set up two-step verification?',
    a: 'Go to Account, then Security & 2-step, then "Set up authenticator". Scan the QR code with Google Authenticator, Microsoft Authenticator, 1Password or any TOTP app. For safety the setup QR code changes every 2 minutes until you finish, so if it refreshes just scan the new one. Enter the 6-digit code, save your recovery codes, then turn on 2-step.',
  },
  {
    id: 'mfa-code-wrong',
    q: 'My authenticator code does not work',
    a: 'Authenticator codes change every 30 seconds, so type the current one. Make sure your phone clock is set automatically (Settings, Date & Time). If you scanned an older setup QR, delete that entry in your app and scan again. Lost your phone? Choose "Use a recovery code" at sign-in, or "Email me a code" if your email is verified.',
  },
  {
    id: 'email-code',
    q: 'How do email sign-in codes work?',
    a: 'On Sign in, choose "Email code (OTP)". We email a 6-digit code. The app shows a security phrase; only use the code if the email shows the same phrase. Codes expire after a short time. Check spam if it does not arrive, then tap "Send a new code".',
  },
  {
    id: 'password',
    q: 'I forgot my password',
    a: 'Use "Email code (OTP)" on the Sign in screen to get in without a password. If two-step verification is on you will also need your authenticator or a recovery code.',
  },
  {
    id: 'account-locked',
    q: 'I lost my phone and my recovery codes',
    a: 'This needs a person to verify your identity. The assistant will connect you to our support team.',
  },
  {
    id: 'order-status',
    q: 'Where is my order?',
    a: 'Account, then Orders shows each order with a live tracker (placed, packed, shipped, delivered). It updates the moment our team moves your order.',
  },
  {
    id: 'shipping',
    q: 'How much is shipping?',
    a: 'Shipping is free on orders of $50 or more; otherwise it is $5.95. [POLICY] Orders usually ship within 1 to 2 business days.',
  },
  {
    id: 'returns',
    q: 'Returns and refunds',
    a: '[POLICY] Unopened items can be returned within 30 days. Damaged or wrong items are replaced free. Refunds go back to the original payment method. The assistant cannot issue refunds itself; it hands refund requests to the support team.',
  },
  {
    id: 'cancel',
    q: 'Can I cancel or change my order?',
    a: 'Orders can be changed or cancelled before they are packed. The assistant will pass the request to the support team, who can cancel it while it is still "placed".',
  },
  {
    id: 'bag-sync',
    q: 'My bag is different on another device',
    a: 'Your bag syncs live when you are signed in to the same account. Items added while signed out are merged into your account bag when you sign in. Pull down to refresh if a device was offline.',
  },
  {
    id: 'out-of-stock',
    q: 'An item sold out while it was in my bag',
    a: 'Stock is checked on our server when you place the order, so you are never charged for something we cannot ship. Remove the item or try again later; product pages show live stock.',
  },
  {
    id: 'reaction',
    q: 'I had a skin reaction to a product',
    a: 'Stop using the product and rinse the area with cool water. If you have swelling, trouble breathing, or a severe or spreading reaction, get medical help right away (call your local emergency number). Our team will follow up about the product and a refund.',
  },
  {
    id: 'delete-data',
    q: 'How do I delete my data?',
    a: 'Delete individual scans from their report. To delete your whole account and data, the assistant will pass the request to our team.',
  },
  {
    id: 'app-issue',
    q: 'The app is slow, crashing or not loading',
    a: 'Check your internet connection, fully close and reopen the app, and make sure you are on the latest version from the App Store or Google Play. If a screen keeps failing, tell the assistant what you tapped and what you saw, and it can escalate it to our team.',
  },
];

export const FAQ_TEXT = FAQ.map((f) => `### ${f.q}\n${f.a}`).join('\n\n');
