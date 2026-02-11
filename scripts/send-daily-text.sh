#!/bin/bash

# Tunnel Sessions - Automatic Daily Text Script
# Sends texts at 12pm to ALL configured phone numbers with all sessions for the day

open -a Safari "http://localhost:8080/auto-text.html"
sleep 4

osascript << 'EOF'
tell application "Safari"
    -- Get combined message and phone numbers from the page
    set jsCode to "
        (function() {
            const settings = JSON.parse(localStorage.getItem('tunnelSessionsSettings') || '{}');

            // Get phone numbers (support both old and new format)
            let phones = [];
            if (settings.autoTextPhones && settings.autoTextPhones.length > 0) {
                phones = settings.autoTextPhones;
            } else if (settings.autoTextPhone) {
                phones = [settings.autoTextPhone];
            } else {
                phones = ['9784917053'];
            }

            const today = new Date().toISOString().split('T')[0];
            const sessions = JSON.parse(localStorage.getItem('tunnelSessions') || '[]');
            const todaysSessions = sessions.filter(s => s.date === today && s.bookings && s.bookings.length > 0);

            if (todaysSessions.length === 0) return '';

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

            // Return phones joined by comma, then ||| separator, then message
            return phones.join(',') + '|||' + message.trim();
        })();
    "
    set resultText to do JavaScript jsCode in current tab of front window
end tell

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
EOF
