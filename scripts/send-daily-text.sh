#!/bin/bash

# Tunnel Sessions - Automatic Daily Text Script
# Sends texts at 12pm to ALL configured phone numbers with all sessions for the day
# Fetches data directly from Firebase (not localStorage)

open -a Safari "https://booking.kd-evolution.com/auto-text.html"
sleep 8  # Allow time for page to load

# First, inject async code that stores result in a global variable
osascript << 'EOF'
tell application "Safari"
    set jsCode to "
        window._textResult = null;
        window._textError = null;

        (async function() {
            try {
                // Wait for Firebase to be ready
                let attempts = 0;
                while (!window.db && attempts < 20) {
                    await new Promise(r => setTimeout(r, 500));
                    attempts++;
                }

                if (!window.db) {
                    window._textError = 'Firebase not loaded';
                    return;
                }

                // Fetch settings directly from Firebase
                let settings = {};
                try {
                    const settingsDoc = await db.collection('settings').doc('app').get();
                    if (settingsDoc.exists) settings = settingsDoc.data();
                } catch (e) {
                    console.error('Failed to get settings:', e);
                }

                // Get phone numbers
                let phones = [];
                if (settings.autoTextPhones && settings.autoTextPhones.length > 0) {
                    phones = settings.autoTextPhones;
                } else if (settings.autoTextPhone) {
                    phones = [settings.autoTextPhone];
                } else {
                    phones = ['9784917053'];
                }

                const today = new Date().toISOString().split('T')[0];

                // Fetch sessions directly from Firebase
                const snapshot = await db.collection('sessions').get();
                const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const todaysSessions = sessions.filter(s => s.date === today && s.bookings && s.bookings.length > 0);

                if (todaysSessions.length === 0) {
                    window._textResult = '';
                    return;
                }

                // Sort by time
                todaysSessions.sort((a, b) => a.time.localeCompare(b.time));

                // Build one combined message
                const dateStr = new Date(today + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric'
                });

                let message = 'Tunnel Sessions - ' + dateStr + '\\n';
                message += '================================\\n\\n';

                todaysSessions.forEach(s => {
                    const date = new Date(s.date + 'T' + s.time);
                    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    const names = s.bookings.map(b => '  - ' + b.firstName + ' ' + b.lastName).join('\\n');
                    message += s.sessionType + ' @ ' + timeStr + '\\n' + names + '\\n\\n';
                });

                window._textResult = phones.join(',') + '|||' + message.trim();
            } catch (err) {
                window._textError = err.toString();
            }
        })();
    "
    do JavaScript jsCode in current tab of front window
end tell
EOF

# Wait for async operation to complete
sleep 5

# Now retrieve the result
RESULT=$(osascript << 'EOF'
tell application "Safari"
    set jsCode to "window._textResult || window._textError || 'PENDING'"
    set resultText to do JavaScript jsCode in current tab of front window
    return resultText
end tell
EOF
)

if [ "$RESULT" = "PENDING" ] || [ "$RESULT" = "" ]; then
    echo "No sessions with participants today or still loading"
    exit 0
fi

if [[ "$RESULT" == *"Error"* ]] || [[ "$RESULT" == *"error"* ]]; then
    echo "Error: $RESULT"
    exit 1
fi

# Parse the result and send texts
osascript << ENDSCRIPT
set resultText to "$RESULT"

if resultText is not "" then
    set AppleScript's text item delimiters to "|||"
    set resultParts to text items of resultText
    set phoneNumbersStr to item 1 of resultParts
    set msg to item 2 of resultParts
    set AppleScript's text item delimiters to ""

    -- Split phone numbers by comma
    set AppleScript's text item delimiters to ","
    set phoneNumbers to text items of phoneNumbersStr
    set AppleScript's text item delimiters to ""

    set sentCount to 0

    tell application "Messages"
        set targetService to 1st account whose service type = iMessage

        repeat with phoneNumber in phoneNumbers
            try
                set targetBuddy to participant phoneNumber of targetService
                send msg to targetBuddy
                set sentCount to sentCount + 1
                delay 1
            on error errMsg
                log "Failed to send to " & phoneNumber & ": " & errMsg
            end try
        end repeat
    end tell

    return "Sent daily text to " & sentCount & " recipient(s)"
else
    return "No sessions with participants today"
end if
ENDSCRIPT
