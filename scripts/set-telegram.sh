#!/usr/bin/env bash
# Connects the Telegram bot that sends contact-form messages (and visit pings).
# Asks for the bot token, checks it with Telegram, finds the chat to send to, stores both
# as Pages secrets, and sends a test message so you know it works.
#
#   bash scripts/set-telegram.sh
set -euo pipefail

PROJECT=deepanshupayal

read -rsp "Paste the bot token from @BotFather (it stays hidden), then press Enter: " raw
echo
token=$(printf %s "$raw" | tr -d '[:space:]')

field() { python3 -c "import sys, json; d = json.load(sys.stdin); print($1)" 2>/dev/null || echo ""; }

bot=$(curl -s "https://api.telegram.org/bot$token/getMe" | field '(d.get("result") or {}).get("username","") if d.get("ok") else ""')
if [ -z "$bot" ]; then
  echo "✗ Telegram did not accept that token. Copy it again from @BotFather (the long line with a colon in it)."
  exit 1
fi
echo "✓ Bot: @$bot"

chat=$(curl -s "https://api.telegram.org/bot$token/getUpdates" | field '([u for u in d.get("result", []) if u.get("message")] or [{}])[-1].get("message", {}).get("chat", {}).get("id", "")')
if [ -z "$chat" ]; then
  echo "✗ No chat found yet. Open https://t.me/$bot in Telegram, press Start (or send 'hi'), then run this again."
  exit 1
fi

printf %s "$token" | npx wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name "$PROJECT" >/dev/null
printf %s "$chat" | npx wrangler pages secret put TELEGRAM_CHAT_ID --project-name "$PROJECT" >/dev/null

sent=$(curl -s -X POST "https://api.telegram.org/bot$token/sendMessage" \
  -d "chat_id=$chat" --data-urlencode "text=✅ Portfolio bot connected. Contact-form messages will arrive here." | field 'd.get("ok")')
if [ "$sent" != "True" ]; then
  echo "✗ Saved the secrets, but the test message failed. Press Start in the chat with @$bot and run this again."
  exit 1
fi

echo "✓ Saved TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, and sent you a test message."
