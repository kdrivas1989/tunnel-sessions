#!/bin/bash

# Tunnel Sessions - Fetch today's session data from Firebase
# Outputs phone numbers and formatted message for the sender app
# Format: PHONES (comma-separated)\n===\nMESSAGE

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
        notes = bf.get('notes', {}).get('stringValue', '')
        if first or last:
            name = f'{first} {last}'.strip()
            if notes:
                name += f' ({notes})'
            bookings.append(name)

    if bookings:
        sessions.append({
            'time': time,
            'type': session_type,
            'bookings': bookings
        })

if not sessions:
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
    exit 0
fi

# Output in parseable format
echo "$PHONES"
echo "==="
echo "$MESSAGE"
