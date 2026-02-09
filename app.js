// Tunnel Sessions - Core Application Logic
// Data is stored in localStorage

const STORAGE_KEY = 'tunnelSessions';
const ADMIN_KEY = 'tunnelSessionsAdmin';
const SESSION_KEY = 'tunnelSessionsLoggedIn';
const USERS_KEY = 'tunnelSessionsUsers';
const USER_SESSION_KEY = 'tunnelSessionsCurrentUser';
const HOSTS_KEY = 'tunnelSessionsHosts';

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
    sessionStorage.setItem(SESSION_KEY, 'true');
}

// Check if logged in
function isLoggedIn() {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
}

// Logout
function logout() {
    sessionStorage.removeItem(SESSION_KEY);
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

// Save users
function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
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
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);
    return { success: true, user: newUser };
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
    sessionStorage.setItem(USER_SESSION_KEY, JSON.stringify({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
    }));
}

// Check if user is logged in
function isUserLoggedIn() {
    return sessionStorage.getItem(USER_SESSION_KEY) !== null;
}

// Get current logged in user
function getCurrentUser() {
    const data = sessionStorage.getItem(USER_SESSION_KEY);
    return data ? JSON.parse(data) : null;
}

// Logout user
function logoutUser() {
    sessionStorage.removeItem(USER_SESSION_KEY);
}

// ============ HOST AUTHENTICATION ============

// Get all hosts
function getHosts() {
    const data = localStorage.getItem(HOSTS_KEY);
    return data ? JSON.parse(data) : [];
}

// Save hosts
function saveHosts(hosts) {
    localStorage.setItem(HOSTS_KEY, JSON.stringify(hosts));
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

// Get all sessions from storage
function getSessions() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

// Save sessions to storage
function saveSessions(sessions) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
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

// Add a booking to a session (now supports notes)
function addBooking(sessionId, firstName, lastName, notes = '') {
    const sessions = getSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);

    if (sessionIndex === -1) {
        return false;
    }

    const session = sessions[sessionIndex];

    if (session.bookings.length >= session.capacity) {
        return false;
    }

    session.bookings.push({
        firstName,
        lastName,
        notes: notes || '',
        bookedAt: new Date().toISOString()
    });

    saveSessions(sessions);
    return true;
}

// Add multiple bookings to a session at once (for booking multiple slots)
function addMultipleBookings(sessionId, bookings) {
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

    bookings.forEach(booking => {
        session.bookings.push({
            firstName: booking.firstName,
            lastName: booking.lastName,
            notes: booking.notes || '',
            bookedAt: new Date().toISOString()
        });
    });

    saveSessions(sessions);
    return { success: true, added: bookings.length };
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

    return {
        success: true,
        needsNotification,
        session,
        cancelledBooking
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
