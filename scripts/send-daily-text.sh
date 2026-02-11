#!/bin/bash

# Tunnel Sessions - Automatic Daily Text Script
# Sends texts at 12pm to ALL configured phone numbers with all sessions for the day
# Fetches data directly from Firebase REST API

TODAY=$(date +%Y-%m-%d)

# Fetch sessions from Firebase
SESSIONS_JSON=$(curl -s "https://firestore.googleapis.com/v1/projects/tunnel-sessions/databases/(default)/documents/sessions")

# Fetch settings from Firebase
SETTINGS_JSON=$(curl -s "https://firestore.googleapis.com/v1/projects/tunnel-sessions/databases/(default)/documents/settings/app")

# Parse phone numbers from settings
PHONES=$(echo "$SETTINGS_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
fields = data.get('fields', {})
phones = []
if 'autoTextPhones' in fields:
    arr = fields['autoTextPhones'].get('arrayValue', {}).get('values', [])
    phones = [v['stringValue'] for v in arr if 'stringValue' in v]
elif 'autoTextPhone' in fields:
    phones = [fields['autoTextPhone']['stringValue']]
if not phones:
    phones = ['9784917053']
print(','.join(phones))
")

# Parse today's sessions and build message
MESSAGE=$(echo "$SESSIONS_JSON" | python3 -c "
import sys, json
from datetime import datetime

data = json.load(sys.stdin)
today = '$TODAY'

sessions = []
for doc in data.get('documents', []):
    fields = doc.get('fields', {})
    date = fields.get('date', {}).get('stringValue', '')
    if date != today:
        continue

    bookings_arr = fields.get('bookings', {}).get('arrayValue', {}).get('values', [])
    if not bookings_arr:
        continue

    time = fields.get('time', {}).get('stringValue', '')
    session_type = fields.get('sessionType', {}).get('stringValue', '')

    bookings = []
    for b in bookings_arr:
        bf = b.get('mapValue', {}).get('fields', {})
        first = bf.get('firstName', {}).get('stringValue', '')
        last = bf.get('lastName', {}).get('stringValue', '')
        if first or last:
            bookings.append(f'{first} {last}'.strip())

    if bookings:
        sessions.append({
            'time': time,
            'type': session_type,
            'bookings': bookings
        })

if not sessions:
    print('')
    sys.exit(0)

# Sort by time
sessions.sort(key=lambda s: s['time'])

# Format date
dt = datetime.strptime(today, '%Y-%m-%d')
date_str = dt.strftime('%A, %b %d').replace(' 0', ' ')

# Build message
msg = f'Tunnel Sessions - {date_str}\n'
msg += '================================\n\n'

for s in sessions:
    # Convert 24h to 12h time
    h, m = int(s['time'].split(':')[0]), s['time'].split(':')[1]
    ampm = 'AM' if h < 12 else 'PM'
    h = h if h <= 12 else h - 12
    h = 12 if h == 0 else h
    time_str = f'{h}:{m} {ampm}'

    names = '\n'.join([f'  - {name}' for name in s['bookings']])
    msg += f\"{s['type']} @ {time_str}\n{names}\n\n\"

print(msg.strip())
")

if [ -z "$MESSAGE" ]; then
    echo "No sessions with participants today"
    exit 0
fi

echo "Sending to: $PHONES"
echo "Message:"
echo "$MESSAGE"
echo ""

# Send via iMessage
IFS=',' read -ra PHONE_ARRAY <<< "$PHONES"
SENT_COUNT=0

for PHONE in "${PHONE_ARRAY[@]}"; do
    osascript << ENDSCRIPT
tell application "Messages"
    set targetService to 1st account whose service type = iMessage
    set targetBuddy to participant "$PHONE" of targetService
    send "$MESSAGE" to targetBuddy
end tell
ENDSCRIPT
    if [ $? -eq 0 ]; then
        ((SENT_COUNT++))
        echo "Sent to $PHONE"
    else
        echo "Failed to send to $PHONE"
    fi
    sleep 1
done

echo "Sent daily text to $SENT_COUNT recipient(s)"
