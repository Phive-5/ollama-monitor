#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Start server if not running
if ! curl -s --connect-timeout 1 "http://localhost:3000/api/status" >/dev/null 2>&1; then
  systemctl --user start ollama-monitor 2>&1
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    if curl -s --connect-timeout 1 "http://localhost:3000/api/status" >/dev/null 2>&1; then
      break
    fi
  done
fi

# Detect available browsers
declare -A BROWSER_CMDS
BROWSERS=()

# Standard binaries
for b in firefox chromium google-chrome chrome opera vivaldi microsoft-edge brave-browser; do
  if command -v "$b" >/dev/null 2>&1; then
    FRIENDLY="$b"
    case "$b" in google-chrome) FRIENDLY="chrome" ;; brave-browser) FRIENDLY="brave" ;; microsoft-edge) FRIENDLY="edge" ;; esac
    BROWSERS+=("$FRIENDLY")
    BROWSER_CMDS["$FRIENDLY"]="$b"
  fi
done

# Flatpak browsers - check known list and auto-detect
if command -v flatpak >/dev/null 2>&1; then
  # Get flatpak app list once
  FLATPAK_LIST=$(flatpak list --app --columns=application 2>/dev/null)

  # Known flatpak browser app IDs
  declare -A FLATPAK_BROWSERS=(
    ["com.brave.Browser"]="brave"
    ["org.mozilla.firefox"]="firefox"
    ["com.google.Chrome"]="chrome"
    ["com.opera.Opera"]="opera"
    ["com.vivaldi.Vivaldi"]="vivaldi"
    ["com.microsoft.Edge"]="edge"
    ["org.chromium.Chromium"]="chromium"
    ["io.gitlab.librewolf-community"]="librewolf"
    ["net.waterfox.waterfox"]="waterfox"
    ["io.github.ungoogled_software.ungoogled_chromium"]="ungoogled-chromium"
  )

  for APP_ID in "${!FLATPAK_BROWSERS[@]}"; do
    NAME="${FLATPAK_BROWSERS[$APP_ID]}"
    if echo "$FLATPAK_LIST" | grep -qx "$APP_ID"; then
      if [[ ! " ${BROWSERS[*]} " =~ " ${NAME} " ]]; then
        BROWSERS+=("$NAME")
        BROWSER_CMDS["$NAME"]="flatpak run $APP_ID"
      fi
    fi
  done

  # Auto-detect: any flatpak app whose ID contains browser/chrome/firefox/etc.
  while IFS= read -r APP_ID; do
    [ -z "$APP_ID" ] && continue
    # Skip already handled
    [[ -n "${FLATPAK_BROWSERS[$APP_ID]}" ]] && continue
    # Check if it looks like a browser
    if echo "$APP_ID" | grep -qiE "browser|firefox|chrome|chromium|opera|vivaldi|edge|brave"; then
      # Generate friendly name from last part of app ID
      FRIENDLY=$(echo "$APP_ID" | sed 's/.*\.//' | tr '[:upper:]' '[:lower:]')
      if [[ ! " ${BROWSERS[*]} " =~ " ${FRIENDLY} " ]]; then
        BROWSERS+=("$FRIENDLY")
        BROWSER_CMDS["$FRIENDLY"]="flatpak run $APP_ID"
      fi
    fi
  done <<< "$FLATPAK_LIST"
fi

# Fallback to xdg-open
if [ ${#BROWSERS[@]} -eq 0 ]; then
  if command -v xdg-open >/dev/null 2>&1; then
    setsid nohup xdg-open "http://localhost:3000" >/dev/null 2>&1 &
    disown
    sleep 1
    echo "Ollama Monitor running at http://localhost:3000"
    exit 0
  fi
  echo "No browser found"
  exit 1
fi

# If only one browser, use it
if [ ${#BROWSERS[@]} -eq 1 ]; then
  B="${BROWSERS[0]}"
  setsid nohup ${BROWSER_CMDS["$B"]} "http://localhost:3000" >/dev/null 2>&1 &
  disown
  sleep 1
  echo "Ollama Monitor running at http://localhost:3000"
  exit 0
fi

# Present selection dialog with zenity
CHOICE=$(zenity --list --title="Ollama Monitor - Browser Selection" \
  --text="Where do you want to view the monitor?" \
  --width=500 --height=600 \
  --column="Browser" "${BROWSERS[@]}" 2>/dev/null)

if [ -z "$CHOICE" ]; then
  echo "No browser selected"
  exit 0
fi

# Launch selected browser detached
CMD="${BROWSER_CMDS[$CHOICE]}"
setsid nohup $CMD "http://localhost:3000" >/dev/null 2>&1 &
disown
sleep 1
echo "Ollama Monitor running at http://localhost:3000 in $CHOICE"
exit 0
