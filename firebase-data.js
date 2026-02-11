// Firebase Data Layer
// This replaces localStorage with Firestore

// ============ SESSIONS ============

// Get all sessions from Firebase
async function getSessionsAsync() {
    try {
        const snapshot = await db.collection('sessions').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error getting sessions:', error);
        return [];
    }
}

// Get sessions (sync wrapper for compatibility)
function getSessions() {
    // Return cached sessions or empty array
    return window._cachedSessions || [];
}

// Save session to Firebase
async function saveSessionAsync(session) {
    try {
        if (session.id) {
            await db.collection('sessions').doc(session.id).set(session);
        } else {
            const docRef = await db.collection('sessions').add(session);
            session.id = docRef.id;
        }
        await refreshSessionsCache();
        return session;
    } catch (error) {
        console.error('Error saving session:', error);
        return null;
    }
}

// Delete session from Firebase
async function deleteSessionAsync(sessionId) {
    try {
        await db.collection('sessions').doc(sessionId).delete();
        await refreshSessionsCache();
        return true;
    } catch (error) {
        console.error('Error deleting session:', error);
        return false;
    }
}

// Refresh sessions cache
async function refreshSessionsCache() {
    window._cachedSessions = await getSessionsAsync();
    return window._cachedSessions;
}

// Listen for real-time session updates
function listenToSessions(callback) {
    return db.collection('sessions').onSnapshot((snapshot) => {
        window._cachedSessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (callback) callback(window._cachedSessions);
    });
}

// ============ HOSTS ============

async function getHostsAsync() {
    try {
        const snapshot = await db.collection('hosts').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error getting hosts:', error);
        return [];
    }
}

function getHosts() {
    return window._cachedHosts || [];
}

async function saveHostAsync(host) {
    try {
        const docRef = await db.collection('hosts').doc(host.email.toLowerCase()).set(host);
        await refreshHostsCache();
        return host;
    } catch (error) {
        console.error('Error saving host:', error);
        return null;
    }
}

async function refreshHostsCache() {
    window._cachedHosts = await getHostsAsync();
    return window._cachedHosts;
}

// ============ USERS ============

async function getUsersAsync() {
    try {
        const snapshot = await db.collection('users').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error getting users:', error);
        return [];
    }
}

function getUsers() {
    return window._cachedUsers || [];
}

async function saveUserAsync(user) {
    try {
        await db.collection('users').doc(user.id).set(user);
        await refreshUsersCache();
        return user;
    } catch (error) {
        console.error('Error saving user:', error);
        return null;
    }
}

async function refreshUsersCache() {
    window._cachedUsers = await getUsersAsync();
    return window._cachedUsers;
}

// ============ SETTINGS ============

async function getSettingsAsync() {
    try {
        const doc = await db.collection('settings').doc('app').get();
        return doc.exists ? doc.data() : {};
    } catch (error) {
        console.error('Error getting settings:', error);
        return {};
    }
}

function getSettings() {
    return window._cachedSettings || {};
}

async function saveSettingsAsync(settings) {
    try {
        await db.collection('settings').doc('app').set(settings, { merge: true });
        window._cachedSettings = { ...window._cachedSettings, ...settings };
        return true;
    } catch (error) {
        console.error('Error saving settings:', error);
        return false;
    }
}

// ============ INITIALIZATION ============

async function initializeFirebaseData() {
    console.log('Loading data from Firebase...');

    try {
        // Load all data in parallel
        const [sessions, hosts, users, settings] = await Promise.all([
            getSessionsAsync(),
            getHostsAsync(),
            getUsersAsync(),
            getSettingsAsync()
        ]);

        window._cachedSessions = sessions;
        window._cachedHosts = hosts;
        window._cachedUsers = users;
        window._cachedSettings = settings;

        console.log(`Loaded: ${sessions.length} sessions, ${hosts.length} hosts, ${users.length} users`);

        // Set up real-time listeners
        listenToSessions(() => {
            if (typeof loadAvailableSessions === 'function') {
                loadAvailableSessions();
            }
            if (typeof loadHostSessions === 'function') {
                loadHostSessions();
            }
        });

        return true;
    } catch (error) {
        console.error('Error initializing Firebase data:', error);
        return false;
    }
}

// ============ MIGRATION HELPER ============

async function migrateFromLocalStorage() {
    console.log('Migrating data from localStorage to Firebase...');

    // Migrate sessions
    const localSessions = JSON.parse(localStorage.getItem('tunnelSessions') || '[]');
    for (const session of localSessions) {
        await db.collection('sessions').doc(session.id).set(session);
    }
    console.log(`Migrated ${localSessions.length} sessions`);

    // Migrate hosts
    const localHosts = JSON.parse(localStorage.getItem('tunnelSessionsHosts') || '[]');
    for (const host of localHosts) {
        await db.collection('hosts').doc(host.email.toLowerCase()).set(host);
    }
    console.log(`Migrated ${localHosts.length} hosts`);

    // Migrate users
    const localUsers = JSON.parse(localStorage.getItem('tunnelSessionsUsers') || '[]');
    for (const user of localUsers) {
        await db.collection('users').doc(user.id).set(user);
    }
    console.log(`Migrated ${localUsers.length} users`);

    // Migrate settings
    const localSettings = JSON.parse(localStorage.getItem('tunnelSessionsSettings') || '{}');
    if (Object.keys(localSettings).length > 0) {
        await db.collection('settings').doc('app').set(localSettings);
    }
    console.log('Migrated settings');

    console.log('Migration complete!');
    return true;
}
