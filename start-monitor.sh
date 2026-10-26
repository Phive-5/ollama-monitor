#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if server already running
if [ -f ".server.pid" ]; then
  PID=$(cat ".server.pid")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "Ollama Monitor already running (PID $PID)"
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "http://localhost:3000" >/dev/null 2>&1 &
    fi
    exit 0
  else
    rm -f ".server.pid"
  fi
fi

# Start server
nohup node server.js > nohup.out 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > .server.pid

echo "Starting Ollama Monitor..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  if curl -s --connect-timeout 1 "http://localhost:3000/api/status" >/dev/null 2>&1; then
    echo "Server ready at http://localhost:3000"
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "http://localhost:3000" >/dev/null 2>&1 &
    elif command -v firefox >/dev/null 2>&1; then
      firefox "http://localhost:3000" >/dev/null 2>&1 &
    elif command -v chromium >/dev/null 2>&1; then
      chromium "http://localhost:3000" >/dev/null 2>&1 &
    elif command -v google-chrome >/dev/null 2>&1; then
      google-chrome "http://localhost:3000" >/dev/null 2>&1 &
    fi
    exit 0
  fi
done
echo "Server started (PID $NEW_PID). Check nohup.out if needed."
exit 0
