#!/usr/bin/env python3
"""
Cloud-based daily text sender for Tunnel Sessions.
Fetches today's sessions from Firebase, formats the message,
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

# Email-to-MMS gateways (support longer messages than SMS gateways)
SMS_GATEWAYS = {
    "9784917053": "9784917053@vzwpix.com",      # Verizon MMS
    "9788773600": "9788773600@tmomms.net",       # T-Mobile MMS
}

FIREBASE_SESSIONS_URL = (
    "https://firestore.googleapis.com/v1/projects/tunnel-sessions"
    "/databases/(default)/documents/sessions"
)

def fetch_json(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


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
    date_str = dt.strftime("%A, %b %d").replace(" 0", " ")

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

    today, sessions = get_todays_sessions()

    if not sessions:
        print(f"No sessions with participants for {today}")
        sys.exit(0)

    message = format_message(today, sessions)
    print(f"Message for {today}:\n{message}\n")

    sent = 0
    for phone, gateway in SMS_GATEWAYS.items():
        try:
            send_sms_via_email(gmail_addr, gmail_app_pw, gateway, message)
            print(f"Sent to {phone} via {gateway}")
            sent += 1
        except Exception as e:
            print(f"Failed to send to {phone}: {e}")

    print(f"\nSent to {sent}/{len(SMS_GATEWAYS)} recipients")
    if sent == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
