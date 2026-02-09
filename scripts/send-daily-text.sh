#!/bin/bash

# Tunnel Sessions - Daily Auto Text Script
# This script opens the auto-text page at 12pm to send participant lists
#
# To install:
# 1. Make executable: chmod +x send-daily-text.sh
# 2. Install the launch agent: cp com.tunnelsessions.dailytext.plist ~/Library/LaunchAgents/
# 3. Load it: launchctl load ~/Library/LaunchAgents/com.tunnelsessions.dailytext.plist

# Open the auto-text page
open "http://booking.kd-evolution.com/auto-text.html"

# Or for local testing:
# open "file:///Users/kevindrivas/Desktop/projects/tunnel-sessions/auto-text.html"
