// Tunnel Sessions - Core Application Logic
// Data is stored in Firebase (with localStorage fallback)

const STORAGE_KEY = 'tunnelSessions';
const ADMIN_KEY = 'tunnelSessionsAdmin';
const SESSION_KEY = 'tunnelSessionsLoggedIn';
const USERS_KEY = 'tunnelSessionsUsers';
const USER_SESSION_KEY = 'tunnelSessionsCurrentUser';
const HOSTS_KEY = 'tunnelSessionsHosts';
const FAVORITES_KEY = 'tunnelSessionsFavorites';
const SETTINGS_KEY = 'tunnelSessionsSettings';

// Firebase state
let useFirebase = false;
let firebaseReady = false;
let dataListeners = [];

// Check if Firebase is available and configured
function isFirebaseConfigured() {
    return typeof firebase !== 'undefined' &&
           typeof db !== 'undefined' &&
           firebase.apps &&
           firebase.apps.length > 0;
}

// Initialize Firebase data and set up listeners
async function initFirebase() {
    if (!isFirebaseConfigured()) {
        console.log('Firebase not configured, using localStorage');
        return false;
    }

    try {
        useFirebase = true;
        console.log('Initializing Firebase...');

        // Set up real-time listener for sessions
        db.collection('sessions').onSnapshot((snapshot) => {
            const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Update localStorage cache for offline support
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
            // Notify listeners
            dataListeners.forEach(fn => fn());
        });

        // Set up listener for hosts
        db.collection('hosts').onSnapshot((snapshot) => {
            const hosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            localStorage.setItem(HOSTS_KEY, JSON.stringify(hosts));
        });

        // Set up listener for users
        db.collection('users').onSnapshot((snapshot) => {
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            localStorage.setItem(USERS_KEY, JSON.stringify(users));
        });

        firebaseReady = true;
        console.log('Firebase initialized successfully');
        return true;
    } catch (error) {
        console.error('Firebase initialization failed:', error);
        useFirebase = false;
        return false;
    }
}

// Register a listener for data changes
function onDataChange(callback) {
    dataListeners.push(callback);
}

// Auto-initialize Firebase when DOM is ready
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initFirebase, 100);
    });
}

// ============ ADMIN AUTHENTICATION ============

// Simple hash function for password (works on both HTTP and HTTPS)
function hashPassword(password) {
    const str = password + 'tunnelSalt2024';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    // Convert to positive hex string
    return Math.abs(hash).toString(16) + str.length.toString(16);
}

// Check if admin account exists
function adminExists() {
    return localStorage.getItem(ADMIN_KEY) !== null;
}

// Get admin data
function getAdmin() {
    const data = localStorage.getItem(ADMIN_KEY);
    return data ? JSON.parse(data) : null;
}

// Create admin account
function createAdmin(username, password) {
    const hashedPassword = hashPassword(password);
    const admin = {
        username: username,
        passwordHash: hashedPassword,
        createdAt: new Date().toISOString()
    };
    localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
    return true;
}

// Verify admin login
function verifyAdmin(username, password) {
    const admin = getAdmin();
    if (!admin) return false;

    const hashedPassword = hashPassword(password);
    return admin.username === username && admin.passwordHash === hashedPassword;
}

// Set logged in session
function setLoggedIn() {
    localStorage.setItem(SESSION_KEY, 'true');
}

// Check if logged in
function isLoggedIn() {
    return localStorage.getItem(SESSION_KEY) === 'true';
}

// Logout
function logout() {
    localStorage.removeItem(SESSION_KEY);
}

// Change password
function changePassword(currentPassword, newPassword) {
    const admin = getAdmin();
    if (!admin) return false;

    const currentHash = hashPassword(currentPassword);
    if (admin.passwordHash !== currentHash) return false;

    admin.passwordHash = hashPassword(newPassword);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
    return true;
}

// ============ USER AUTHENTICATION ============

// Get all users
function getUsers() {
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : [];
}

// Save users (and Firebase if available)
function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));

    // Sync to Firebase if available
    if (useFirebase && firebaseReady) {
        users.forEach(user => {
            db.collection('users').doc(user.id).set(user)
                .catch(err => console.error('Error syncing user to Firebase:', err));
        });
    }
}

// Create user account
function createUser(firstName, lastName, email, password) {
    const users = getUsers();

    // Check if email already exists
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        return { success: false, error: 'Email already registered' };
    }

    const newUser = {
        id: generateId(),
        firstName: firstName,
        lastName: lastName,
        email: email.toLowerCase(),
        passwordHash: hashPassword(password),
        permissions: [], // Can include: 'secretary' (add/remove empty sessions)
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);
    return { success: true, user: newUser };
}

// Update user permissions
function updateUserPermissions(userId, permissions) {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) return false;

    users[userIndex].permissions = permissions;
    saveUsers(users);
    return true;
}

// Check if user has permission
function userHasPermission(userId, permission) {
    const users = getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return false;
    return user.permissions && user.permissions.includes(permission);
}

// Get user by email
function getUserByEmail(email) {
    const users = getUsers();
    return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

// Verify user login
function verifyUser(email, password) {
    const user = getUserByEmail(email);
    if (!user) return null;

    const hashedPassword = hashPassword(password);
    if (user.passwordHash === hashedPassword) {
        return user;
    }
    return null;
}

// Set user logged in
function setUserLoggedIn(user) {
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
    }));
}

// Check if user is logged in
function isUserLoggedIn() {
    return localStorage.getItem(USER_SESSION_KEY) !== null;
}

// Get current logged in user
function getCurrentUser() {
    const data = localStorage.getItem(USER_SESSION_KEY);
    return data ? JSON.parse(data) : null;
}

// Logout user
function logoutUser() {
    localStorage.removeItem(USER_SESSION_KEY);
}

// ============ USER FAVORITES ============

// Get all favorites (keyed by user ID)
function getAllFavorites() {
    const data = localStorage.getItem(FAVORITES_KEY);
    return data ? JSON.parse(data) : {};
}

// Get favorites for current user
function getUserFavorites() {
    const user = getCurrentUser();
    if (!user) return [];
    const allFavorites = getAllFavorites();
    return allFavorites[user.id] || [];
}

// Check if session is favorited by current user
function isSessionFavorited(sessionId) {
    const favorites = getUserFavorites();
    return favorites.includes(sessionId);
}

// Toggle favorite for a session
function toggleFavorite(sessionId) {
    const user = getCurrentUser();
    if (!user) return false;

    const allFavorites = getAllFavorites();
    if (!allFavorites[user.id]) {
        allFavorites[user.id] = [];
    }

    const index = allFavorites[user.id].indexOf(sessionId);
    if (index === -1) {
        allFavorites[user.id].push(sessionId);
    } else {
        allFavorites[user.id].splice(index, 1);
    }

    localStorage.setItem(FAVORITES_KEY, JSON.stringify(allFavorites));
    return index === -1; // Returns true if now favorited
}

// ============ HOST AUTHENTICATION ============

// Get all hosts
function getHosts() {
    const data = localStorage.getItem(HOSTS_KEY);
    return data ? JSON.parse(data) : [];
}

// Save hosts (and Firebase if available)
function saveHosts(hosts) {
    localStorage.setItem(HOSTS_KEY, JSON.stringify(hosts));

    // Sync to Firebase if available
    if (useFirebase && firebaseReady) {
        hosts.forEach(host => {
            db.collection('hosts').doc(host.email.toLowerCase()).set(host)
                .catch(err => console.error('Error syncing host to Firebase:', err));
        });
    }
}

// Create host account (admin only)
function createHost(email, password) {
    const hosts = getHosts();

    // Check if email already exists
    if (hosts.some(h => h.email.toLowerCase() === email.toLowerCase())) {
        return { success: false, error: 'Email already registered as host' };
    }

    const newHost = {
        id: generateId(),
        email: email.toLowerCase(),
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString()
    };

    hosts.push(newHost);
    saveHosts(hosts);
    return { success: true, host: newHost };
}

// Verify host login
function verifyHost(email, password) {
    const hosts = getHosts();
    const host = hosts.find(h => h.email.toLowerCase() === email.toLowerCase());
    if (!host) return null;

    const hashedPassword = hashPassword(password);
    if (host.passwordHash === hashedPassword) {
        return host;
    }
    return null;
}

// Delete host account
function deleteHost(hostId) {
    let hosts = getHosts();
    hosts = hosts.filter(h => h.id !== hostId);
    saveHosts(hosts);
}

// ============ SESSIONS & BOOKINGS ============

// Get CSS class for session type badge
function getSessionTypeClass(sessionType) {
    if (!sessionType) return '';
    const type = sessionType.toLowerCase();
    if (type.includes('shredclub') || type.includes('shred')) return 'shredclub';
    if (type.includes('rookie')) return 'rookie';
    if (type.includes('advanced')) return 'advanced';
    return '';
}

// Generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Generate cancellation token for guest bookings
function generateCancellationToken() {
    return 'cancel_' + Date.now().toString(36) + Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
}

// Get booking by cancellation token
function getBookingByToken(token) {
    const sessions = getSessions();
    for (const session of sessions) {
        for (let i = 0; i < session.bookings.length; i++) {
            if (session.bookings[i].cancellationToken === token) {
                return { session, booking: session.bookings[i], bookingIndex: i };
            }
        }
    }
    return null;
}

// Cancel booking by token (for guests)
function cancelBookingByToken(token) {
    const result = getBookingByToken(token);
    if (!result) {
        return { success: false, error: 'Booking not found or already cancelled' };
    }

    const { session, booking, bookingIndex } = result;
    const sessionDateTime = new Date(session.date + 'T' + session.time);
    const now = new Date();
    const hoursUntilSession = (sessionDateTime - now) / (1000 * 60 * 60);

    // Check if session is in the past
    if (hoursUntilSession < 0) {
        return { success: false, error: 'This session has already occurred' };
    }

    // Must be at least 72 hours before session
    if (hoursUntilSession < 72) {
        return { success: false, error: 'Cancellations must be made at least 72 hours before the session' };
    }

    // Remove the booking
    const sessions = getSessions();
    const sessionIndex = sessions.findIndex(s => s.id === session.id);
    if (sessionIndex === -1) {
        return { success: false, error: 'Session not found' };
    }

    const cancelledBooking = sessions[sessionIndex].bookings[bookingIndex];
    sessions[sessionIndex].bookings.splice(bookingIndex, 1);
    saveSessions(sessions);

    // Check if within a week (168 hours) - need to notify host
    const needsNotification = hoursUntilSession <= 168;

    // Get waitlist info for notification
    const waitlist = sessions[sessionIndex].waitlist || [];
    const nextOnWaitlist = waitlist.length > 0 ? waitlist[0] : null;

    return {
        success: true,
        needsNotification,
        session: sessions[sessionIndex],
        cancelledBooking,
        nextOnWaitlist
    };
}

// Get all sessions from storage
function getSessions() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

// Save sessions to storage (and Firebase if available)
function saveSessions(sessions) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));

    // Sync to Firebase if available
    if (useFirebase && firebaseReady) {
        sessions.forEach(session => {
            db.collection('sessions').doc(session.id).set(session)
                .catch(err => console.error('Error syncing session to Firebase:', err));
        });
    }
}

// Save a single session to Firebase
async function saveSessionToFirebase(session) {
    if (!useFirebase || !firebaseReady) return;
    try {
        await db.collection('sessions').doc(session.id).set(session);
    } catch (error) {
        console.error('Error saving session to Firebase:', error);
    }
}

// Delete session from Firebase
async function deleteSessionFromFirebase(sessionId) {
    if (!useFirebase || !firebaseReady) return;
    try {
        await db.collection('sessions').doc(sessionId).delete();
    } catch (error) {
        console.error('Error deleting session from Firebase:', error);
    }
}

// Get session by ID
function getSessionById(sessionId) {
    const sessions = getSessions();
    return sessions.find(s => s.id === sessionId);
}

// Create a new session
function createSession({ sessionType, date, time, duration, capacity }) {
    const sessions = getSessions();

    // Check if session already exists for this date/time/type
    const exists = sessions.some(s => s.date === date && s.time === time && s.sessionType === sessionType);
    if (exists) {
        console.log('Session already exists for this date/time/type');
        return null;
    }

    const newSession = {
        id: generateId(),
        sessionType,
        date,
        time,
        duration,
        capacity,
        bookings: [],
        createdAt: new Date().toISOString()
    };

    sessions.push(newSession);
    saveSessions(sessions);
    return newSession;
}

// Delete a session
function deleteSessionById(sessionId) {
    let sessions = getSessions();
    sessions = sessions.filter(s => s.id !== sessionId);
    saveSessions(sessions);
}

// Add a booking to a session (now supports notes and email for guests)
function addBooking(sessionId, firstName, lastName, notes = '', email = '', isGuest = false) {
    const sessions = getSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);

    if (sessionIndex === -1) {
        return { success: false };
    }

    const session = sessions[sessionIndex];

    if (session.bookings.length >= session.capacity) {
        return { success: false };
    }

    const booking = {
        firstName,
        lastName,
        notes: notes || '',
        bookedAt: new Date().toISOString()
    };

    // Add email and cancellation token for guest bookings
    if (isGuest && email) {
        booking.email = email.toLowerCase();
        booking.cancellationToken = generateCancellationToken();
        booking.isGuest = true;
    }

    session.bookings.push(booking);
    saveSessions(sessions);
    return { success: true, booking };
}

// Add multiple bookings to a session at once (for booking multiple slots)
// email is shared across all bookings in a group (the person making the booking)
function addMultipleBookings(sessionId, bookings, email = '') {
    const sessions = getSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);

    if (sessionIndex === -1) {
        return { success: false, error: 'Session not found' };
    }

    const session = sessions[sessionIndex];
    const spotsLeft = session.capacity - session.bookings.length;

    if (bookings.length > spotsLeft) {
        return { success: false, error: `Only ${spotsLeft} spot(s) available` };
    }

    const addedBookings = [];

    bookings.forEach(booking => {
        const newBooking = {
            firstName: booking.firstName,
            lastName: booking.lastName,
            notes: booking.notes || '',
            bookedAt: new Date().toISOString()
        };

        // Add email and cancellation token for guest bookings
        if (email) {
            newBooking.email = email.toLowerCase();
            newBooking.cancellationToken = generateCancellationToken();
            newBooking.isGuest = true;
        }

        session.bookings.push(newBooking);
        addedBookings.push(newBooking);
    });

    saveSessions(sessions);
    return { success: true, added: bookings.length, bookings: addedBookings };
}

// Remove a booking from a session (host only)
function removeBookingFromSession(sessionId, bookingIndex) {
    const sessions = getSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);

    if (sessionIndex === -1) {
        return false;
    }

    sessions[sessionIndex].bookings.splice(bookingIndex, 1);
    saveSessions(sessions);
    return true;
}

// Cancel a user's own booking (72 hours before session required)
function cancelUserBooking(sessionId, firstName, lastName) {
    const sessions = getSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);

    if (sessionIndex === -1) {
        return { success: false, error: 'Session not found' };
    }

    const session = sessions[sessionIndex];
    const sessionDateTime = new Date(session.date + 'T' + session.time);
    const now = new Date();
    const hoursUntilSession = (sessionDateTime - now) / (1000 * 60 * 60);

    // Must be at least 72 hours before session
    if (hoursUntilSession < 72) {
        return { success: false, error: 'Cancellations must be made at least 72 hours before the session' };
    }

    // Find and remove the booking
    const bookingIndex = session.bookings.findIndex(b =>
        b.firstName.toLowerCase() === firstName.toLowerCase() &&
        b.lastName.toLowerCase() === lastName.toLowerCase()
    );

    if (bookingIndex === -1) {
        return { success: false, error: 'Booking not found' };
    }

    const cancelledBooking = session.bookings[bookingIndex];
    session.bookings.splice(bookingIndex, 1);
    saveSessions(sessions);

    // Check if within a week (168 hours) - need to notify host
    const needsNotification = hoursUntilSession <= 168;

    // Get waitlist info for notification
    const waitlist = session.waitlist || [];
    const nextOnWaitlist = waitlist.length > 0 ? waitlist[0] : null;

    return {
        success: true,
        needsNotification,
        session,
        cancelledBooking,
        nextOnWaitlist
    };
}

// Update a session
function updateSession(sessionId, updates) {
    const sessions = getSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);

    if (sessionIndex === -1) {
        return false;
    }

    sessions[sessionIndex] = { ...sessions[sessionIndex], ...updates };
    saveSessions(sessions);
    return true;
}

// Clear all past sessions (utility)
function clearPastSessions() {
    const sessions = getSessions();
    const now = new Date();
    const futureSessions = sessions.filter(session => {
        const sessionDate = new Date(session.date + 'T' + session.time);
        return sessionDate > now;
    });
    saveSessions(futureSessions);
}

// ============ CALENDAR EXPORT ============

// Generate ICS file content for a session
function generateICS(session, participantName = '') {
    const startDate = new Date(session.date + 'T' + session.time);
    const endDate = new Date(startDate.getTime() + session.duration * 60000);

    // Format dates for ICS (YYYYMMDDTHHMMSS)
    const formatICSDate = (date) => {
        return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    };

    const uid = `${session.id}-${Date.now()}@tunnelsessions`;
    const title = `${session.sessionType} - Tunnel Session`;
    const description = participantName ? `Booked for: ${participantName}` : 'Indoor Skydiving Session';

    const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Tunnel Sessions//Booking//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${formatICSDate(new Date())}`,
        `DTSTART:${formatICSDate(startDate)}`,
        `DTEND:${formatICSDate(endDate)}`,
        `SUMMARY:${title}`,
        `DESCRIPTION:${description}`,
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');

    return icsContent;
}

// Download ICS file for a session
function downloadICS(sessionId, participantName = '') {
    const session = getSessionById(sessionId);
    if (!session) return;

    const icsContent = generateICS(session, participantName);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);

    const dateStr = session.date.replace(/-/g, '');
    link.download = `tunnel-session-${dateStr}.ics`;
    link.click();
    URL.revokeObjectURL(link.href);
}

// Generate Google Calendar URL for a session
function generateGoogleCalendarLink(sessionId, participantName = '') {
    const session = getSessionById(sessionId);
    if (!session) return '';

    const startDate = new Date(session.date + 'T' + session.time);
    const endDate = new Date(startDate.getTime() + session.duration * 60000);

    // Format dates for Google Calendar (YYYYMMDDTHHMMSS)
    const formatGoogleDate = (date) => {
        return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    };

    const title = encodeURIComponent(`${session.sessionType} - Tunnel Session`);
    const description = participantName
        ? encodeURIComponent(`Booked for: ${participantName}`)
        : encodeURIComponent('Indoor Skydiving Session');
    const dates = `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`;

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${description}`;
}

// Open Google Calendar with session details
function openGoogleCalendar(sessionId, participantName = '') {
    const url = generateGoogleCalendarLink(sessionId, participantName);
    if (url) {
        window.open(url, '_blank');
    }
}

// ============ WAITLIST ============

// Join waitlist for a full session
function joinWaitlist(sessionId, email, firstName, lastName) {
    const sessions = getSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);

    if (sessionIndex === -1) {
        return { success: false, error: 'Session not found' };
    }

    const session = sessions[sessionIndex];

    // Initialize waitlist if it doesn't exist
    if (!session.waitlist) {
        session.waitlist = [];
    }

    // Check if already on waitlist
    const alreadyOnWaitlist = session.waitlist.some(
        w => w.email.toLowerCase() === email.toLowerCase()
    );
    if (alreadyOnWaitlist) {
        return { success: false, error: 'You are already on the waitlist for this session' };
    }

    // Check if already booked
    const alreadyBooked = session.bookings.some(
        b => b.firstName.toLowerCase() === firstName.toLowerCase() &&
             b.lastName.toLowerCase() === lastName.toLowerCase()
    );
    if (alreadyBooked) {
        return { success: false, error: 'You are already booked for this session' };
    }

    // Add to waitlist
    session.waitlist.push({
        email: email.toLowerCase(),
        firstName,
        lastName,
        addedAt: new Date().toISOString()
    });

    saveSessions(sessions);
    return { success: true, position: session.waitlist.length };
}

// Get waitlist for a session
function getWaitlist(sessionId) {
    const session = getSessionById(sessionId);
    if (!session) return [];
    return session.waitlist || [];
}

// Remove from waitlist
function removeFromWaitlist(sessionId, email) {
    const sessions = getSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);

    if (sessionIndex === -1) return false;

    const session = sessions[sessionIndex];
    if (!session.waitlist) return false;

    const originalLength = session.waitlist.length;
    session.waitlist = session.waitlist.filter(
        w => w.email.toLowerCase() !== email.toLowerCase()
    );

    if (session.waitlist.length < originalLength) {
        saveSessions(sessions);
        return true;
    }
    return false;
}

// Get waitlist info for notification when a spot opens
function getNextOnWaitlist(sessionId) {
    const session = getSessionById(sessionId);
    if (!session || !session.waitlist || session.waitlist.length === 0) {
        return null;
    }
    return session.waitlist[0];
}
