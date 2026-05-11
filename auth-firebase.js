// Firebase Auth integration layer.
//
// Drop-in replacement for the legacy localStorage + 10-char-hash auth in
// app.js. Same function names so the existing index.html handlers keep
// working — only difference is these are async (callers must `await`).
//
// Model:
//   - The 29 existing /users records are "claimable" by their email owner.
//   - To claim, the user signs up via Firebase Auth with their email.
//     On success we link auth.uid into the existing /users doc as
//     `firebaseUid`.
//   - Hosts/admins get the role via custom claim (set by Admin SDK script).
//
// Load order: index.html must include firebase-auth-compat.js BEFORE this
// file, and this file AFTER app.js so its functions override the legacy
// synchronous ones.

(function () {
  if (typeof firebase === 'undefined') {
    console.error('[auth-firebase] firebase global is missing — check script order');
    return;
  }

  // Lightweight cache of the merged "user" object (Firebase Auth + matching /users doc).
  // Updated on every onAuthStateChanged tick. getCurrentUser() returns this cache
  // synchronously so legacy callers don't need to await.
  let cachedUser = null;
  let cacheReadyResolve;
  const cacheReady = new Promise((r) => { cacheReadyResolve = r; });

  function getDb() { return firebase.firestore(); }

  // Look up /users doc whose email matches (case-insensitive).
  async function findUserDocByEmail(email) {
    const lower = (email || '').toLowerCase().trim();
    if (!lower) return null;
    const snap = await getDb().collection('users')
      .where('email', '==', lower)
      .limit(1)
      .get();
    if (!snap.empty) return { id: snap.docs[0].id, ref: snap.docs[0].ref, data: snap.docs[0].data() };
    // Fall back to scanning a small page if email field was stored with mixed case
    // (legacy records use exact-match queries which miss mixed-case rows).
    const scan = await getDb().collection('users').get();
    for (const doc of scan.docs) {
      const d = doc.data();
      if ((d.email || '').toLowerCase() === lower) {
        return { id: doc.id, ref: doc.ref, data: d };
      }
    }
    return null;
  }

  async function buildCachedUser(authUser) {
    if (!authUser) return null;
    const idTokenResult = await authUser.getIdTokenResult();
    const role = idTokenResult.claims.role || null;
    const linked = await findUserDocByEmail(authUser.email);
    const merged = {
      id: linked ? linked.id : authUser.uid,
      uid: authUser.uid,
      email: authUser.email,
      firstName: linked ? (linked.data.firstName || '') : '',
      lastName: linked ? (linked.data.lastName || '') : '',
      permissions: linked ? (Array.isArray(linked.data.permissions) ? linked.data.permissions : []) : [],
      role: role,
      isAdmin: role === 'admin' || role === 'secretary',
      _linkedDocId: linked ? linked.id : null,
    };
    return merged;
  }

  // ── Public API (overrides legacy synchronous functions in app.js) ──────────

  // createUser is the "Sign Up / Claim Account" flow.
  //   1. Make sure a /users doc exists for this email (pre-created by admin).
  //   2. Create the Firebase Auth account.
  //   3. Link firebaseUid into the matching /users doc.
  // Returns { success, user, error }
  window.createUser = async function (firstName, lastName, email, password) {
    const lower = (email || '').toLowerCase().trim();
    if (!lower || !password) return { success: false, error: 'Email and password required' };
    if (password.length < 8) return { success: false, error: 'Password must be at least 8 characters' };

    // We allow account creation only for emails that exist in /users.
    // Walk-up bookers don't need accounts at all.
    const linked = await findUserDocByEmail(lower);
    if (!linked) {
      return { success: false, error: 'No member record found for this email. Ask an admin to add you to the roster first.' };
    }

    let cred;
    try {
      cred = await firebase.auth().createUserWithEmailAndPassword(lower, password);
    } catch (err) {
      // Map a few common cases to friendlier messages.
      if (err.code === 'auth/email-already-in-use') {
        return { success: false, error: 'This email already has an account. Try logging in or click "Forgot password?"' };
      }
      if (err.code === 'auth/invalid-email') return { success: false, error: 'Invalid email address' };
      if (err.code === 'auth/weak-password') return { success: false, error: 'Password is too weak' };
      return { success: false, error: err.message || 'Sign-up failed' };
    }

    // Best-effort: update the /users doc to record the Firebase Auth uid.
    try {
      await linked.ref.update({
        firebaseUid: cred.user.uid,
        claimedAt: new Date().toISOString(),
        firstName: firstName || linked.data.firstName || '',
        lastName: lastName || linked.data.lastName || '',
        email: lower,
      });
    } catch (err) {
      console.warn('[auth-firebase] failed to link firebaseUid to /users doc', err);
      // Non-fatal: account is created and they can sign in, just won't have permissions linked.
    }

    const built = await buildCachedUser(cred.user);
    cachedUser = built;
    return { success: true, user: built };
  };

  // verifyUser is the legacy "log in" entry point.
  // Returns the merged user object on success, null on failure.
  window.verifyUser = async function (email, password) {
    const lower = (email || '').toLowerCase().trim();
    if (!lower || !password) return null;
    try {
      const cred = await firebase.auth().signInWithEmailAndPassword(lower, password);
      const built = await buildCachedUser(cred.user);
      cachedUser = built;
      return built;
    } catch (err) {
      console.warn('[auth-firebase] sign-in failed', err.code || err.message);
      return null;
    }
  };

  // The legacy code uses setUserLoggedIn(user) as a side-effect step after
  // verifyUser succeeds (it persisted to localStorage). With Firebase Auth
  // the SDK manages the session itself — this is a no-op now, but kept
  // to avoid touching every caller.
  window.setUserLoggedIn = function (_user) { /* no-op: Firebase Auth handles persistence */ };

  window.isUserLoggedIn = function () {
    return cachedUser !== null;
  };

  window.getCurrentUser = function () {
    return cachedUser;
  };

  window.logoutUser = async function () {
    try {
      await firebase.auth().signOut();
    } catch (err) {
      console.warn('[auth-firebase] sign-out failed', err);
    }
    cachedUser = null;
  };

  // Send password-reset email. Used by the "Forgot password?" link.
  window.sendPasswordReset = async function (email) {
    const lower = (email || '').toLowerCase().trim();
    if (!lower) return { success: false, error: 'Email required' };
    try {
      await firebase.auth().sendPasswordResetEmail(lower);
      return { success: true };
    } catch (err) {
      // Don't leak which emails exist — return success for unknown emails too.
      if (err.code === 'auth/user-not-found') return { success: true };
      return { success: false, error: err.message || 'Could not send reset email' };
    }
  };

  // Wait for the very first auth state determination (used by app.js on boot
  // to decide whether to render the logged-in or logged-out UI).
  window.waitForAuth = function () { return cacheReady; };

  // ── Boot ──────────────────────────────────────────────────────────────────
  firebase.auth().onAuthStateChanged(async (authUser) => {
    cachedUser = await buildCachedUser(authUser);
    if (cacheReadyResolve) {
      cacheReadyResolve();
      cacheReadyResolve = null;
    }
    // Let the rest of the app re-render. Calling updateUserBar / loadAvailableSessions
    // would create coupling — instead emit an event the app can listen for.
    document.dispatchEvent(new CustomEvent('authstatechange', { detail: cachedUser }));
  });
})();
