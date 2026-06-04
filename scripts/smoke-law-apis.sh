#!/usr/bin/env bash
set -euo pipefail

echo "== korean-law CLI =="
if command -v korean-law >/dev/null 2>&1; then
  korean-law list | head -5
  korean-law help search_law | head -8
else
  echo "SKIP: korean-law not in PATH (npm install -g korean-law-mcp)"
fi

echo ""
echo "== korean-law-mcp remote (HEAD) =="
curl -sS -o /dev/null -w "korean-law-mcp.fly.dev/mcp → HTTP %{http_code}\n" \
  -I "https://korean-law-mcp.fly.dev/mcp" || echo "FAIL: remote MCP unreachable"

echo ""
echo "== beopmang REST search =="
RESP=$(curl -sS -A "LawMap-smoke/1.0" \
  "https://api.beopmang.org/api/v4/law?action=search&q=근로기준법" || true)
if [ -n "$RESP" ]; then
  echo "$RESP" | head -c 500
  echo ""
else
  echo "WARN: empty response (network or upstream); use MCP beopmang as fallback"
fi

echo ""
echo "Done. Configure Cursor MCP: .cursor/mcp.json"
