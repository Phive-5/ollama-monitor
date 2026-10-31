# Ollama Monitor

> **⚠️ Early WIP — Work in Progress**
>
> This project is still in early development. Features, APIs, and behavior may change between releases without notice.

## Description

**Ollama Monitor** is a lightweight Node/Express web application that monitors which models are currently loaded and running in your local [Ollama](https://ollama.com/) instance. It polls Ollama's `/api/ps` endpoint, tracks active models, logs start/stop events with duration, and provides a browser-based dashboard plus a slide-out panel for managing each running model (view details, gentle stop, or forced stop).

It runs a small local HTTP server on port `3000` and opens the dashboard in your default browser.

## Screenshots

Dashboard showing active models with VRAM, size, and unload timer:

![Ollama Monitor dashboard](Linux%20snaps/1-Snap.png)

Active model cards with family and quantization info:

![Model cards](Linux%20snaps/2-snap.png)

Sidecar slide-out panel opened by clicking an active model:

![Sidecar panel](Linux%20snaps/3-snap.png)

History table of model start/stop events:

![History log](Linux%20snaps/4-snap.png)

## Supported Systems

Ollama Monitor is a Node.js application, so it can potentially run on any system where Node.js (v18+) and Ollama are installed:

- **Linux** (primary target — developed and tested on Ubuntu/Debian-based systems)
- **macOS** (Node.js + Ollama installed)
- **Windows** (Node.js + Ollama WSL2 or native Ollama)
- Any headless server running Ollama that you can reach at `http://localhost:11434`

The included `ollama-monitor.sh` launcher is written for Linux (bash, systemd --user, zenity, xdg-open), but the core `server.js` + `public/` frontend is cross-platform via `node server.js`.

## Ollama Install Assumptions

The app expects the following about your Ollama installation:

- Ollama is installed and running as a service or process on the same machine as the monitor.
- Ollama's HTTP API is reachable at `http://localhost:11434`.
- The `/api/ps` endpoint is available to list currently loaded models.
- The `/api/show` endpoint is available to retrieve model details.
- The `/api/generate` endpoint is available (used for gentle/forced stop via `keep_alive`).
- You have at least one model pulled (e.g. `ollama pull qwen2.5vl:7b`) so there is something to monitor.

If Ollama is not running or not reachable, the monitor reports "Ollama: down" and no models are listed.

## How to Get the Release

A packaged release zip is included in this project:

- **File:** `release/Ollama monitor.zip`

Extract the zip to your desired location, then run the monitor as described below. The zip contains the full project (server, frontend, start scripts) but excludes `node_modules` — run `npm install` after extracting to install dependencies.

## How to Use the App

### Option 1: Desktop launcher (Linux)

Run the included shell script, which starts the server and opens the dashboard in your browser:

```bash
cd "/home/steve/Documents/Code Testing/Ollama monitor"
chmod +x ollama-monitor.sh
./ollama-monitor.sh
```

The script detects available browsers (Firefox, Chrome, Chromium, Edge, Brave, Vivaldi, Opera, etc., including Flatpak packages) and lets you choose one via a zenity dialog. It also starts the monitor via systemd user service if available.

### Option 2: Manual start

```bash
cd "/home/steve/Documents/Code Testing/Ollama monitor"
npm install
node server.js
# or: npm start
```

Then open your browser to:

```
http://localhost:3000
```

### Option 3: Desktop entry

Install `Ollama Monitor.desktop` to your applications menu (`~/.local/share/applications/`) for one-click launching from your desktop environment.

### Using the dashboard

1. Click **Start Monitor** to begin polling Ollama every 2 seconds.
2. Active models appear as cards showing VRAM usage, model size, unload timer, family, and quantization.
3. Click any active model card to open the left slide-out panel.
4. In the panel you can:
   - **Show info about model** — view name, size, digest, format, family, parameter size, and quantization.
   - **Stop model gentle (5 min)** — sets `keep_alive: 5m` so Ollama unloads the model after 5 minutes of inactivity.
   - **Stop model now (forced)** — sets `keep_alive: 0` to unload the model immediately (confirmation required).
5. The **History** tab logs all model start/stop events with timestamps and durations.
6. Use **Clear History** to wipe the event log, or **Shut Down Server** to exit the monitor.

## Recent Changes

- Added sidecar slide-out panel (left slide-out) opened by clicking an active model card, with "Show info about model", "Stop model gentle (5 min)", and "Stop model now (forced)" actions.
- Added backend API endpoints:
  - `GET /api/model/info/:name` — returns model details from Ollama `/api/show`, enriched with running state.
  - `POST /api/model/action/:name` — accepts `stop-gentle` (keep_alive 5m) or `stop-now` (keep_alive 0).
- Replaced non-functional "Status"/"Progress" fields on model cards with real Ollama data: VRAM size, model size, unload timer (`expires_at`), model family, and quantization level.
- Added `LOCAL_SYNC_INFO.md` documenting sync/backup locations and process (local + network share, Gitea remote excluded from this file).
- Added packaged release at `release/Ollama monitor.zip`.

## Project Layout

```
Ollama monitor/
├── server.js              # Express server + Ollama API proxy
├── package.json           # Node project manifest (express dependency)
├── package-lock.json
├── start.sh               # Minimal: cd + node server.js
├── ollama-monitor.sh      # Full launcher: starts server, picks browser, opens URL
├── Ollama Monitor.desktop # Desktop entry for app menus
├── start-monitor.sh       # Alternate launcher script
├── public/
│   ├── index.html         # Dashboard HTML
│   ├── app.js             # Frontend logic + panel actions
│   └── style.css          # Styling
├── data/                  # Runtime: history.jsonl, config.json
├── Linux snaps/           # Screenshots for README
│   ├── 1-Snap.png
│   ├── 2-snap.png
│   ├── 3-snap.png
│   └── 4-snap.png
├── release/
│   └── Ollama monitor.zip # Packaged release for Gitea
└── LOCAL_SYNC_INFO.md     # Local sync/backup locations (NOT pushed to Gitea)
```

## License

This is a personal utility project. No license specified yet — see `package.json` (private).
