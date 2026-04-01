#!/usr/bin/env python3
"""
Cloud-based daily text sender for Tunnel Sessions.
Fetches today's sessions and phone list from Firebase, formats the message,
and sends via Gmail SMTP to email-to-SMS gateways.

Uses only Python stdlib — no pip dependencies needed.
"""

import json
import os
import smtplib
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText

# Carrier → email-to-MMS gateway suffix
CARRIER_GATEWAYS = {
    "verizon": "vzwpix.com",
    "tmobile": "tmomail.net",
    "att": "mms.att.net",
    "sprint": "pm.sprint.com",
}

FIREBASE_BASE_URL = (
    "https://firestore.googleapis.com/v1/projects/tunnel-sessions"
    "/databases/(default)/documents"
)
FIREBASE_SESSIONS_URL = f"{FIREBASE_BASE_URL}/sessions"
FIREBASE_SETTINGS_URL = f"{FIREBASE_BASE_URL}/settings/app"


def fetch_json(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def get_phone_list():
    """Fetch phone numbers + carriers from Firebase settings."""
    try:
        data = fetch_json(FIREBASE_SETTINGS_URL)
    except Exception as e:
        print(f"Warning: Could not fetch settings from Firebase: {e}")
        return []

    fields = data.get("fields", {})

    # New format: autoTextPhonesWithCarrier array of {number, carrier}
    arr = (
        fields.get("autoTextPhonesWithCarrier", {})
        .get("arrayValue", {})
        .get("values", [])
    )
    if arr:
        phones = []
        for item in arr:
            mf = item.get("mapValue", {}).get("fields", {})
            number = mf.get("number", {}).get("stringValue", "")
            carrier = mf.get("carrier", {}).get("stringValue", "verizon")
            if number:
                phones.append({"number": number, "carrier": carrier})
        return phones

    # Fall back to old format: autoTextPhones array of strings
    old_arr = (
        fields.get("autoTextPhones", {})
        .get("arrayValue", {})
        .get("values", [])
    )
    if old_arr:
        return [
            {"number": v.get("stringValue", ""), "carrier": "verizon"}
            for v in old_arr
            if v.get("stringValue")
        ]

    return []


def get_todays_sessions():
    # Use Eastern Time for "today"
    eastern = timezone(timedelta(hours=-5))
    today = datetime.now(eastern).strftime("%Y-%m-%d")

    data = fetch_json(FIREBASE_SESSIONS_URL)

    sessions = []
    for doc in data.get("documents", []):
        fields = doc.get("fields", {})
        date = fields.get("date", {}).get("stringValue", "")
        if date != today:
            continue

        bookings_arr = (
            fields.get("bookings", {})
            .get("arrayValue", {})
            .get("values", [])
        )
        if not bookings_arr:
            continue

        time = fields.get("time", {}).get("stringValue", "")
        session_type = fields.get("sessionType", {}).get("stringValue", "")

        bookings = []
        for b in bookings_arr:
            bf = b.get("mapValue", {}).get("fields", {})
            first = bf.get("firstName", {}).get("stringValue", "")
            last = bf.get("lastName", {}).get("stringValue", "")
            notes = bf.get("notes", {}).get("stringValue", "")
            if first or last:
                name = f"{first} {last}".strip()
                if notes:
                    name += f" ({notes})"
                bookings.append(name)

        if bookings:
            sessions.append({
                "time": time,
                "type": session_type,
                "bookings": bookings,
            })

    return today, sessions


def format_time(time_24):
    h, m = int(time_24.split(":")[0]), time_24.split(":")[1]
    ampm = "AM" if h < 12 else "PM"
    h = h if h <= 12 else h - 12
    h = 12 if h == 0 else h
    return f"{h}:{m} {ampm}"


def format_message(today, sessions):
    dt = datetime.strptime(today, "%Y-%m-%d")
    date_str = dt.strftime("%B %d").replace(" 0", " ")

    msg = f"{date_str}\n\n"

    sessions.sort(key=lambda s: s["time"])

    for s in sessions:
        time_str = format_time(s["time"])
        names = "\n".join(f"  - {name}" for name in s["bookings"])
        msg += f"{s['type']} @ {time_str}\n{names}\n\n"

    return msg.strip()


def send_sms_via_email(gmail_addr, gmail_app_pw, gateway_addr, message):
    mime = MIMEText(message)
    mime["From"] = gmail_addr
    mime["To"] = gateway_addr
    # Keep subject empty — SMS gateways prepend subject to body
    mime["Subject"] = ""

    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        server.login(gmail_addr, gmail_app_pw)
        server.sendmail(gmail_addr, gateway_addr, mime.as_string())


def main():
    gmail_addr = os.environ.get("GMAIL_ADDRESS", "")
    gmail_app_pw = os.environ.get("GMAIL_APP_PASSWORD", "")

    if not gmail_addr or not gmail_app_pw:
        print("ERROR: GMAIL_ADDRESS and GMAIL_APP_PASSWORD must be set")
        sys.exit(1)

    # Fetch phone list from Firebase
    phones = get_phone_list()
    if not phones:
        print("No phone numbers configured in Firebase settings")
        sys.exit(0)

    print(f"Recipients: {', '.join(p['number'] + ' (' + p['carrier'] + ')' for p in phones)}")

    today, sessions = get_todays_sessions()

    if not sessions:
        print(f"No sessions with participants for {today}")
        sys.exit(0)

    message = format_message(today, sessions)
    print(f"Message for {today}:\n{message}\n")

    sent = 0
    for phone in phones:
        gateway_domain = CARRIER_GATEWAYS.get(phone["carrier"])
        if not gateway_domain:
            print(f"Unknown carrier '{phone['carrier']}' for {phone['number']}, skipping")
            continue

        gateway_addr = f"{phone['number']}@{gateway_domain}"
        try:
            send_sms_via_email(gmail_addr, gmail_app_pw, gateway_addr, message)
            print(f"Sent to {phone['number']} via {gateway_addr}")
            sent += 1
        except Exception as e:
            print(f"Failed to send to {phone['number']}: {e}")

    print(f"\nSent to {sent}/{len(phones)} recipients")
    if sent == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
