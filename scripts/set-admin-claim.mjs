#!/usr/bin/env node
// Grant the Firestore `role` custom claim to one or more users.
//
// Usage:
//   1. Download a Firebase service-account JSON one time:
//      Firebase Console → Project settings → Service accounts → Generate new
//      private key → save somewhere local (NEVER commit it).
//   2. Run:
//        export GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/key.json
//        node scripts/set-admin-claim.mjs admin kevin@example.com devin@example.com
//      First arg is the role ("admin" or "secretary"); rest are emails.
//   3. Delete the JSON file afterward. Do not check it in.
//
// The user must sign out + sign back in (or call user.getIdToken(true) in
// the browser console) to pick up the new claim. Firestore rules read it
// from the ID token, so a stale token won't see the role until refreshed.

import admin from "firebase-admin";

const VALID_ROLES = new Set(["admin", "secretary"]);

const [, , roleArg, ...emails] = process.argv;
if (!roleArg || !VALID_ROLES.has(roleArg) || emails.length === 0) {
  console.error("usage: node scripts/set-admin-claim.mjs <admin|secretary> <email> [email...]");
  process.exit(2);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS env var must point at a service-account JSON");
  process.exit(2);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const auth = admin.auth();

for (const raw of emails) {
  const email = raw.trim().toLowerCase();
  try {
    const user = await auth.getUserByEmail(email);
    const existing = user.customClaims || {};
    const next = { ...existing, role: roleArg };
    await auth.setCustomUserClaims(user.uid, next);
    console.log(`  ✓ ${email} (uid ${user.uid}) → role=${roleArg}`);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      console.error(`  ✗ ${email} — no Firebase Auth account. Have them sign up first via the site.`);
    } else {
      console.error(`  ✗ ${email} — ${err.message}`);
    }
  }
}

console.log("\nDone. Affected users must sign out + sign in (or hard-refresh) to pick up the claim.");
