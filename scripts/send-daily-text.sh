#!/bin/bash

# Tunnel Sessions - Automatic Daily Text Script
# Sends ONE text at 12pm with all sessions for the day

open -a Safari "http://booking.kd-evolution.com/auto-text.html"
sleep 4

osascript << 'EOF'
tell application "Safari"
    -- Get phone number and combined message from the page
    set jsCode to "
        (function() {
            const settings = JSON.parse(localStorage.getItem('tunnelSessionsSettings') || '{}');
            const phoneNumber = settings.autoTextPhone || '9784917053';

            const today = new Date().toISOString().split('T')[0];
            const sessions = JSON.parse(localStorage.getItem('tunnelSessions') || '[]');
            const todaysSessions = sessions.filter(s => s.date === today && s.bookings && s.bookings.length > 0);

            if (todaysSessions.length === 0) return JSON.stringify({phone: phoneNumber, message: ''});

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

            return JSON.stringify({phone: phoneNumber, message: message.trim()});
        })();
    "
    set jsonResult to do JavaScript jsCode in current tab of front window

    -- Parse the phone number
    set phoneCode to "JSON.parse('" & jsonResult & "').phone"
    set phoneNumber to do JavaScript phoneCode in current tab of front window

    -- Parse message
    set msgCode to "JSON.parse('" & jsonResult & "').message"
    set msg to do JavaScript msgCode in current tab of front window
end tell

if msg is not "" then
    tell application "Messages"
        set targetService to 1st account whose service type = iMessage
        set targetBuddy to participant phoneNumber of targetService
        send msg to targetBuddy
    end tell
    return "Sent daily text to " & phoneNumber
else
    return "No sessions with participants today"
end if
EOF
