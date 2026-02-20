#!/bin/bash

# Tunnel Sessions - Sync SignUpGenius → Firebase
# Uses Safari automation (osascript) to load the SignUpGenius page,
# extracts rendered text, parses participant data, and pushes to Firebase.
#
# Usage:
#   ./sync-signupgenius.sh                  # Normal sync (URL from Firebase settings or default)
#   ./sync-signupgenius.sh --dump           # Dump raw page text for debugging
#   ./sync-signupgenius.sh --dry-run        # Parse but don't push to Firebase
#   ./sync-signupgenius.sh "https://..."    # Use a specific URL

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
FIREBASE_BASE="https://firestore.googleapis.com/v1/projects/tunnel-sessions/databases/(default)/documents"
DEFAULT_URL="https://www.signupgenius.com/go/10C094CA9AB29A3F9C16-60797878-february"
TODAY=$(date +%Y-%m-%d)
LOG_PREFIX="[sync-signupgenius]"

DUMP_MODE=false
DRY_RUN=false
SG_URL=""

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --dump)   DUMP_MODE=true ;;
        --dry-run) DRY_RUN=true ;;
        https://*) SG_URL="$arg" ;;
    esac
done

# Get URL from Firebase settings if not provided
if [ -z "$SG_URL" ]; then
    SG_URL=$(curl -s "$FIREBASE_BASE/settings/app" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('fields', {}).get('signupGeniusUrl', {}).get('stringValue', ''))
except:
    pass
" 2>/dev/null)
fi

# Fall back to default URL
if [ -z "$SG_URL" ]; then
    SG_URL="$DEFAULT_URL"
fi

echo "$LOG_PREFIX Syncing from: $SG_URL"
echo "$LOG_PREFIX Date: $TODAY"

# ============================================================
# Step 1: Use Safari to load the page and extract rendered text
# ============================================================

PAGE_TEXT=$(osascript <<APPLESCRIPT
tell application "Safari"
    activate

    -- Ensure we have a window
    if (count of windows) = 0 then
        make new document with properties {URL:"$SG_URL"}
    else
        tell window 1
            set newTab to make new tab with properties {URL:"$SG_URL"}
            set current tab to newTab
        end tell
    end if

    -- Wait for page to load (up to 15 seconds)
    repeat 15 times
        delay 1
        try
            set readyState to do JavaScript "document.readyState" in current tab of window 1
            if readyState is "complete" then exit repeat
        end try
    end repeat

    -- Additional wait for SPA JavaScript rendering
    delay 3
    repeat 10 times
        try
            set pageText to do JavaScript "document.body.innerText" in current tab of window 1
            if pageText contains "Minutes" or pageText contains "Sign Up" or pageText contains "Full" then
                exit repeat
            end if
        end try
        delay 2
    end repeat

    -- Final text extraction
    set pageText to do JavaScript "document.body.innerText" in current tab of window 1

    -- Close the tab we opened
    try
        close current tab of window 1
    end try

    return pageText
end tell
APPLESCRIPT
)

if [ -z "$PAGE_TEXT" ]; then
    echo "$LOG_PREFIX ERROR: Failed to extract page text from Safari"
    exit 1
fi

echo "$LOG_PREFIX Extracted $(echo "$PAGE_TEXT" | wc -l | tr -d ' ') lines of text"

# Dump mode: just print the raw text and exit
if $DUMP_MODE; then
    echo "=== RAW PAGE TEXT ==="
    echo "$PAGE_TEXT"
    echo "=== END RAW TEXT ==="
    exit 0
fi

# ============================================================
# Step 2: Fetch existing sessions from Firebase
# ============================================================

SESSIONS_JSON=$(curl -s "$FIREBASE_BASE/sessions")

# ============================================================
# Step 3: Parse page text and sync to Firebase
# ============================================================

# Write data to temp files (avoids shell escaping issues with large text)
PAGE_TMPFILE=$(mktemp)
SESSIONS_TMPFILE=$(mktemp)
echo "$PAGE_TEXT" > "$PAGE_TMPFILE"
echo "$SESSIONS_JSON" > "$SESSIONS_TMPFILE"

DRY_RUN_FLAG=""
if $DRY_RUN; then
    DRY_RUN_FLAG="--dry-run"
fi

python3 - "$PAGE_TMPFILE" "$SESSIONS_TMPFILE" "$FIREBASE_BASE" "$TODAY" $DRY_RUN_FLAG <<'PYEOF'
import sys, json, re, subprocess
from datetime import datetime

page_text_file = sys.argv[1]
sessions_file = sys.argv[2]
firebase_base = sys.argv[3]
today = sys.argv[4]
dry_run = '--dry-run' in sys.argv

with open(page_text_file) as f:
    page_text = f.read()

with open(sessions_file) as f:
    existing_data = json.load(f)

# ---- Patterns (matched to actual SignUpGenius innerText format) ----
#
# Actual page format:
#   02/18/2026              <- date (MM/DD/YYYY)
#   Wednesday               <- day of week (ignored)
#   7:00pm-                 <- time range start (note trailing dash)
#   8:00pm                  <- time range end
#    Full                   <- slot status (leading space)
#   15 Minutes              <- slot duration
#   All slots filled        <- availability
#   Chris Mangano           <- participant name
#   CM                      <- initials (skip)
#    Full
#   15 Minutes
#   All slots filled
#   Jon Mortison            <- name
#    Back Fly               <- notes (leading space)
#   JM                      <- initials (skip)

# Date: MM/DD/YYYY
DATE_RE = re.compile(r'^(\d{2})/(\d{2})/(\d{4})$')

# Time range start: "7:00pm-" (trailing dash, end time on next line)
TIME_START_RE = re.compile(r'^(\d{1,2}:\d{2}[ap]m)-$', re.IGNORECASE)

# Slot status
FULL_RE = re.compile(r'^\s*Full\s*$', re.IGNORECASE)
SIGNUP_RE = re.compile(r'^\s*Sign\s*Up\s*$', re.IGNORECASE)

# Lines to skip within a slot block
SLOT_DURATION_RE = re.compile(r'^\s*15\s+Minutes?\s*$', re.IGNORECASE)
SLOTS_FILLED_RE = re.compile(r'(All\s+slots?\s+filled|\d+\s+of\s+\d+\s+slots?\s+filled)', re.IGNORECASE)

# Initials: exactly 2 uppercase letters (avatar badge on SignUpGenius)
INITIALS_RE = re.compile(r'^[A-Z]{2}$')

# Session type detection
SESSION_TYPE_RE = re.compile(r'(ShredClub|Shred\s*Club|Rookie|Advanced)', re.IGNORECASE)

def normalize_session_type(raw):
    lower = raw.lower().replace(' ', '')
    if lower == 'shredclub':
        return 'ShredClub'
    return raw.strip().title()

def parse_time_to_24h(time_str):
    """Parse '7:00pm' to '19:00' format."""
    clean = time_str.strip().upper().replace(' ', '')
    try:
        t = datetime.strptime(clean, '%I:%M%p')
        return t.strftime('%H:%M')
    except ValueError:
        return None

# ---- Detect session type from page header ----

lines = page_text.split('\n')
session_type = 'ShredClub'  # default
for line in lines[:25]:
    stm = SESSION_TYPE_RE.search(line)
    if stm:
        session_type = normalize_session_type(stm.group(1))
        break

# ---- Parse page text (state machine) ----

sessions = {}  # key: "YYYY-MM-DD_HH:MM" -> {date, time, sessionType, bookings: [...]}
current_date = None
current_time = None

i = 0
while i < len(lines):
    line = lines[i]
    stripped = line.strip()

    if not stripped:
        i += 1
        continue

    # --- Date: MM/DD/YYYY ---
    dm = DATE_RE.match(stripped)
    if dm:
        month = int(dm.group(1))
        day = int(dm.group(2))
        year = int(dm.group(3))
        current_date = f'{year}-{month:02d}-{day:02d}'
        i += 1
        continue

    # --- Time range: "7:00pm-" on this line, "8:00pm" on next ---
    tm = TIME_START_RE.match(stripped)
    if tm:
        parsed = parse_time_to_24h(tm.group(1))
        if parsed:
            current_time = parsed
        i += 2  # skip this line and the end-time line
        continue

    # --- Filled slot: " Full" ---
    if FULL_RE.match(stripped):
        i += 1

        # Skip "15 Minutes" and "All slots filled" lines
        while i < len(lines):
            s = lines[i].strip()
            if not s or SLOT_DURATION_RE.match(s) or SLOTS_FILLED_RE.match(s):
                i += 1
                continue
            break

        if i >= len(lines):
            break

        # This line should be the participant name
        name = lines[i].strip()
        i += 1
        notes = ''

        # Next line: could be notes (leading space), initials, or next slot
        if i < len(lines):
            next_raw = lines[i]
            next_stripped = next_raw.strip()

            # Notes line: has leading space and is more than just initials
            if next_raw.startswith(' ') and next_stripped and not INITIALS_RE.match(next_stripped):
                notes = next_stripped
                i += 1
                # Skip the initials line that follows notes
                if i < len(lines) and INITIALS_RE.match(lines[i].strip()):
                    i += 1
            elif INITIALS_RE.match(next_stripped):
                # Just initials, no notes - skip
                i += 1

        # Add booking to session
        if name and current_date and current_time:
            # Skip if name looks like an initials line we missed
            if INITIALS_RE.match(name):
                continue

            key = f'{current_date}_{current_time}'
            if key not in sessions:
                sessions[key] = {
                    'date': current_date,
                    'time': current_time,
                    'sessionType': session_type,
                    'bookings': []
                }

            parts = name.split(None, 1)
            first_name = parts[0] if parts else name
            last_name = parts[1] if len(parts) > 1 else ''

            sessions[key]['bookings'].append({
                'firstName': first_name,
                'lastName': last_name,
                'notes': notes
            })

        continue

    # --- Empty slot: " Sign Up" ---
    if SIGNUP_RE.match(stripped):
        i += 1
        # Skip "15 Minutes" and "0 of N slots filled"
        while i < len(lines):
            s = lines[i].strip()
            if not s or SLOT_DURATION_RE.match(s) or SLOTS_FILLED_RE.match(s):
                i += 1
                continue
            break
        continue

    i += 1

# ---- Summary ----

print(f'\n[parser] Found {len(sessions)} session(s) from SignUpGenius:')
total_bookings = 0
for key in sorted(sessions.keys()):
    s = sessions[key]
    n = len(s['bookings'])
    total_bookings += n
    names = ', '.join([f"{b['firstName']} {b['lastName']}".strip() for b in s['bookings']])
    print(f'  {s["date"]} {s["time"]} ({s["sessionType"]}): {n} booking(s) - {names}')

if not sessions:
    print('[parser] No sessions found in page text. Try --dump to see raw text.')
    sys.exit(0)

# ---- Build index of existing Firebase sessions ----

existing_docs = {}  # key: "YYYY-MM-DD_HH:MM" -> document ID
for doc in existing_data.get('documents', []):
    fields = doc.get('fields', {})
    date = fields.get('date', {}).get('stringValue', '')
    time = fields.get('time', {}).get('stringValue', '')
    if date and time:
        key = f'{date}_{time}'
        doc_id = doc['name'].split('/')[-1]
        existing_docs[key] = doc_id

# ---- Push to Firebase ----

if dry_run:
    print('\n[dry-run] Would sync the following to Firebase:')

synced = 0
skipped = 0

for key in sorted(sessions.keys()):
    session = sessions[key]

    # Only sync today or future dates
    if session['date'] < today:
        skipped += 1
        continue

    # Build Firestore-format bookings array
    bookings_values = []
    for b in session['bookings']:
        booking_fields = {
            'firstName': {'stringValue': b['firstName']},
            'lastName': {'stringValue': b['lastName']},
            'notes': {'stringValue': b['notes']},
            'bookedAt': {'stringValue': datetime.now().strftime('%Y-%m-%dT%H:%M:%S.000Z')}
        }
        bookings_values.append({'mapValue': {'fields': booking_fields}})

    bookings_field = {'arrayValue': {'values': bookings_values}} if bookings_values else {'arrayValue': {}}

    if key in existing_docs:
        # Update existing session's bookings
        doc_id = existing_docs[key]
        url = f'{firebase_base}/sessions/{doc_id}?updateMask.fieldPaths=bookings'
        payload = {'fields': {'bookings': bookings_field}}

        if dry_run:
            print(f'  PATCH {session["date"]} {session["time"]}: {len(session["bookings"])} booking(s) (doc: {doc_id})')
        else:
            result = subprocess.run(
                ['curl', '-s', '-X', 'PATCH', url,
                 '-H', 'Content-Type: application/json',
                 '-d', json.dumps(payload)],
                capture_output=True, text=True
            )
            if '"fields"' in result.stdout:
                print(f'[sync] Updated {session["date"]} {session["time"]}: {len(session["bookings"])} booking(s)')
            else:
                print(f'[sync] ERROR updating {key}: {result.stdout[:200]}')
                continue
    else:
        # Create new session document
        url = f'{firebase_base}/sessions'
        now = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.000Z')
        payload = {
            'fields': {
                'date': {'stringValue': session['date']},
                'time': {'stringValue': session['time']},
                'sessionType': {'stringValue': session['sessionType']},
                'duration': {'integerValue': '60'},
                'capacity': {'integerValue': '4'},
                'bookings': bookings_field,
                'createdAt': {'stringValue': now}
            }
        }

        if dry_run:
            print(f'  POST {session["date"]} {session["time"]} ({session["sessionType"]}): {len(session["bookings"])} booking(s)')
        else:
            result = subprocess.run(
                ['curl', '-s', '-X', 'POST', url,
                 '-H', 'Content-Type: application/json',
                 '-d', json.dumps(payload)],
                capture_output=True, text=True
            )
            if '"fields"' in result.stdout:
                print(f'[sync] Created {session["date"]} {session["time"]} ({session["sessionType"]}): {len(session["bookings"])} booking(s)')
            else:
                print(f'[sync] ERROR creating {key}: {result.stdout[:200]}')
                continue

    synced += 1

print(f'\n[sync] Done: {synced} session(s) synced, {skipped} past session(s) skipped')
PYEOF

SYNC_EXIT=$?

# Cleanup temp files
rm -f "$PAGE_TMPFILE" "$SESSIONS_TMPFILE"

if [ $SYNC_EXIT -ne 0 ]; then
    echo "$LOG_PREFIX Sync failed with exit code $SYNC_EXIT"
    exit $SYNC_EXIT
fi

echo "$LOG_PREFIX Sync complete"
