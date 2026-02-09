// Tunnel Sessions - Core Application Logic
// Data is stored in localStorage

const STORAGE_KEY = 'tunnelSessions';

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
function createSession({ date, time, duration, capacity }) {
    const sessions = getSessions();

    // Check if session already exists for this date/time
    const exists = sessions.some(s => s.date === date && s.time === time);
    if (exists) {
        console.log('Session already exists for this date/time');
        return null;
    }

    const newSession = {
        id: generateId(),
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
