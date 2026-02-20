-- TunnelDailySync
-- Step 1: Syncs SignUpGenius participant data into Firebase
-- Step 2: Fetches today's session data from Firebase and sends via iMessage
-- Compiled as .app so macOS grants it Automation permissions for Safari and Messages

set syncScript to "/Users/kevindrivas/Desktop/projects/tunnel-sessions/scripts/sync-signupgenius.sh"
set messageScript to "/Users/kevindrivas/Desktop/projects/tunnel-sessions/scripts/get-message-data.sh"

-- Step 1: Sync SignUpGenius → Firebase
try
	do shell script syncScript
on error errMsg
	-- Log error but continue to send texts (Firebase may still have good data)
end try

-- Step 2: Fetch message data and send via iMessage (same as TunnelTextSender)
try
	set rawOutput to do shell script messageScript
on error
	return
end try

if rawOutput is "" then
	return
end if

-- Split output on "===" separator
set oldDelims to AppleScript's text item delimiters
set AppleScript's text item delimiters to "==="
set parts to text items of rawOutput
set AppleScript's text item delimiters to oldDelims

if (count of parts) < 2 then
	return
end if

-- First part is phone numbers, rest is the message
set phoneLine to do shell script "echo " & quoted form of (item 1 of parts) & " | tr -d '[:space:]'"
set messageText to do shell script "echo " & quoted form of (item 2 of parts) & " | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//'"

if messageText is "" then
	return
end if

-- Split phone numbers by comma
set oldDelims to AppleScript's text item delimiters
set AppleScript's text item delimiters to ","
set phoneList to text items of phoneLine
set AppleScript's text item delimiters to oldDelims

-- Send to each phone number via iMessage
repeat with phone in phoneList
	try
		tell application "Messages"
			set targetService to 1st account whose service type = iMessage
			set targetBuddy to participant phone of targetService
			send messageText to targetBuddy
		end tell
		delay 1
	end try
end repeat
