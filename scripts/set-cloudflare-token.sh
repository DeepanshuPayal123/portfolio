#!/usr/bin/env bash
# Saves the CLOUDFLARE_API_TOKEN repo secret that CI deploys with — but only after Cloudflare
# confirms the token is active and can reach the Pages project. Rerun when the token is
# rotated (it expires after a year).
#
#   bash scripts/set-cloudflare-token.sh
set -euo pipefail

ACCOUNT_ID=f440e2e023984a5032987595cf94b56d
PROJECT=deepanshupayal
REPO=DeepanshuPayal123/portfolio

read -rsp "Paste the Cloudflare API token (it stays hidden), then press Enter: " raw
echo
token=$(printf %s "$raw" | tr -d '[:space:]')

field() { python3 -c "import sys, json; d = json.load(sys.stdin); print($1)" 2>/dev/null || echo "?"; }

status=$(curl -s -H "Authorization: Bearer $token" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/tokens/verify" | field '(d.get("result") or {}).get("status")')
if [ "$status" != "active" ]; then
  echo "✗ Cloudflare did not accept that as an active token (status: $status). Copy only the token value and try again."
  exit 1
fi

pages=$(curl -s -H "Authorization: Bearer $token" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT" | field 'd.get("success")')
if [ "$pages" != "True" ]; then
  echo "✗ The token is active but cannot reach the Pages project — give it Account → Cloudflare Pages → Edit."
  exit 1
fi

printf %s "$token" | gh secret set CLOUDFLARE_API_TOKEN --repo "$REPO"
echo "✓ Token verified and saved as CLOUDFLARE_API_TOKEN."
