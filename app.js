// Tunnel Sessions - Core Application Logic
// Data is stored in localStorage

const STORAGE_KEY = 'tunnelSessions';
const ADMIN_KEY = 'tunnelSessionsAdmin';
const SESSION_KEY = 'tunnelSessionsLoggedIn';

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

// Add a booking to a session
function addBooking(sessionId, firstName, lastName) {
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
        bookedAt: new Date().toISOString()
    });

    saveSessions(sessions);
    return true;
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
