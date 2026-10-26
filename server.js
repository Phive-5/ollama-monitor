const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.jsonl');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
}

ensureDataDir();

function readJson(file, def) {
  try {
    if (!fs.existsSync(file)) return def;
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return def;
  }
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

let currentState = {
  running: false,
  lastCheck: null,
  models: [],
  ollamaUp: false,
  error: null
};

let monitorTimer = null;
let pollInterval = 2000;
let maxAgeDays = 3;

const cfg = readJson(CONFIG_FILE, { pollInterval: 2000, maxAgeDays: 3 });
pollInterval = cfg.pollInterval || 2000;
maxAgeDays = cfg.maxAgeDays || 3;

let lastModelsByName = new Map();

function pruneOldHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return;
    const now = Date.now();
    const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000;
    const lines = fs.readFileSync(HISTORY_FILE, 'utf8').split(/\r?\n/);
    const keep = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.ts >= cutoff) keep.push(line);
      } catch (e) {}
    }
    fs.writeFileSync(HISTORY_FILE, keep.join('\n') + (keep.length ? '\n' : ''));
  } catch (e) {}
}

function appendHistory(entry) {
  const rec = { ts: Date.now(), ...entry };
  fs.appendFileSync(HISTORY_FILE, JSON.stringify(rec) + '\n');
  pruneOldHistory();
}

function formatDuration(ms) {
  if (ms == null || ms < 0) return null;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h${rm}m`;
}

async function fetchRunning() {
  return new Promise((resolve) => {
    const url = 'http://localhost:11434/api/ps';
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ok: true, models: parsed.models || [] });
        } catch (e) {
          resolve({ ok: false, error: 'parse' });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    req.on('error', (err) => {
      resolve({ ok: false, error: err.code || err.message });
    });
  });
}

function buildModelMap(models) {
  const map = new Map();
  for (const m of models) {
    const key = m.name || m.model;
    if (key) map.set(key, m);
  }
  return map;
}

async function pollOnce() {
  const res = await fetchRunning();
  currentState.lastCheck = Date.now();
  if (!res.ok) {
    if (currentState.ollamaUp) {
      appendHistory({ type: 'ollama_down', error: res.error });
    }
    currentState.ollamaUp = false;
    currentState.models = [];
    currentState.error = res.error;
    if (lastModelsByName.size > 0) {
      const now = Date.now();
      for (const [name, info] of lastModelsByName) {
        const durMs = now - (info.startedAt || now);
        appendHistory({
          type: 'Ended',
          model: name,
          duration_ms: durMs,
          duration: formatDuration(durMs)
        });
      }
      lastModelsByName.clear();
    }
    return;
  }

  currentState.ollamaUp = true;
  currentState.error = null;
  const now = Date.now();
  const models = res.models.map(m => ({
    name: m.name,
    model: m.model,
    status: m.status,
    done: m.done,
    total: m.total,
    completed: m.completed,
    duration: m.duration,
    context_length: m.context_length,
    size_vram: m.size_vram
  }));

  const currentMap = buildModelMap(models);

  for (const [name, info] of Array.from(lastModelsByName.entries())) {
    if (!currentMap.has(name)) {
      const durMs = now - (info.startedAt || now);
      appendHistory({
        type: 'Ended',
        model: name,
        duration_ms: durMs,
        duration: formatDuration(durMs)
      });
      lastModelsByName.delete(name);
    }
  }

  for (const [name, m] of currentMap.entries()) {
    if (!lastModelsByName.has(name)) {
      lastModelsByName.set(name, { startedAt: now, meta: m });
      appendHistory({
        type: 'Started',
        model: name,
        details: {
          model: m.model,
          status: m.status,
          context_length: m.context_length
        }
      });
    } else {
      lastModelsByName.set(name, { startedAt: lastModelsByName.get(name).startedAt, meta: m });
    }
  }

  const prevActive = Array.from(lastModelsByName.keys()).sort();
  const currActive = models.map(x => x.name).sort();
  if (JSON.stringify(prevActive) !== JSON.stringify(currActive) || models.length !== prevActive.length) {
    appendHistory({
      type: 'state_change',
      models: models.map(m => ({
        name: m.name,
        status: m.status,
        done: m.done,
        total: m.total,
        completed: m.completed,
        duration: m.duration,
        context_length: m.context_length
      })),
      active_count: models.length
    });
  }

  currentState.models = models;
}

function startMonitor() {
  if (monitorTimer) return;
  currentState.running = true;
  pollOnce();
  monitorTimer = setInterval(pollOnce, pollInterval);
}

function stopMonitor() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
  currentState.running = false;
  const now = Date.now();
  for (const [name, info] of lastModelsByName) {
    const durMs = now - (info.startedAt || now);
    appendHistory({
      type: 'Ended',
      model: name,
      duration_ms: durMs,
      duration: formatDuration(durMs)
    });
  }
  lastModelsByName.clear();
}

app.get('/api/status', (req, res) => {
  res.json(currentState);
});

app.get('/api/history', (req, res) => {
  try {
    pruneOldHistory();
    if (!fs.existsSync(HISTORY_FILE)) {
      return res.json([]);
    }
    const lines = fs.readFileSync(HISTORY_FILE, 'utf8').split(/\r?\n/).reverse();
    const out = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
        if (out.length > 2000) break;
      } catch (e) {}
    }
    res.json(out);
  } catch (e) {
    res.json([]);
  }
});

app.post('/api/clear', (req, res) => {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      fs.unlinkSync(HISTORY_FILE);
    }
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

app.post('/api/start', (req, res) => {
  startMonitor();
  appendHistory({ type: 'monitor_started' });
  res.json({ ok: true });
});

app.post('/api/stop', (req, res) => {
  stopMonitor();
  appendHistory({ type: 'monitor_stopped' });
  res.json({ ok: true });
});

app.post('/api/shutdown', (req, res) => {
  try {
    res.json({ ok: true, message: 'Shutting down server' });
  } catch (e) {}
  // Graceful shutdown after response
  setTimeout(() => {
    stopMonitor();
    process.exit(0);
  }, 200);
});

app.get('/api/config', (req, res) => {
  res.json(readJson(CONFIG_FILE, { pollInterval, maxAgeDays }));
});

app.put('/api/config', (req, res) => {
  const cfg = readJson(CONFIG_FILE, { pollInterval, maxAgeDays });
  if (req.body.pollInterval && Number(req.body.pollInterval) > 500) {
    cfg.pollInterval = Number(req.body.pollInterval);
    pollInterval = cfg.pollInterval;
  }
  if (req.body.maxAgeDays && Number(req.body.maxAgeDays) > 0) {
    cfg.maxAgeDays = Number(req.body.maxAgeDays);
    maxAgeDays = cfg.maxAgeDays;
  }
  writeJson(CONFIG_FILE, cfg);
  res.json({ ok: true, cfg });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('ollama-monitor running on http://localhost:' + PORT);
});
