const statusEl = document.getElementById('ollamaStatus');
const monitorEl = document.getElementById('monitorStatus');
const lastEl = document.getElementById('lastCheck');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const shutdownBtn = document.getElementById('shutdownBtn');
const activeList = document.getElementById('activeList');
const historyBody = document.getElementById('historyBody');

const modelPanel = document.getElementById('modelPanel');
const panelBackdrop = document.getElementById('panelBackdrop');
const panelClose = document.getElementById('panelClose');
const panelModelName = document.getElementById('panelModelName');
const panelContent = document.getElementById('panelContent');
const btnInfo = document.getElementById('btnInfo');
const btnGentle = document.getElementById('btnGentle');
const btnForce = document.getElementById('btnForce');

let selectedModel = null;

function fmtTime(ts) {
  if (!ts) return '--';
  const d = new Date(ts);
  return d.toLocaleString();
}

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const s = await res.json();
    statusEl.textContent = s.ollamaUp ? 'Ollama: up' : 'Ollama: down';
    monitorEl.textContent = s.running ? 'Monitor: running' : 'Monitor: stopped';
    lastEl.textContent = 'Last check: ' + fmtTime(s.lastCheck);
    startBtn.disabled = s.running;
    stopBtn.disabled = !s.running;
    renderActive(s.models);
  } catch (e) {
    statusEl.textContent = 'Ollama: error';
  }
}

async function fetchHistory() {
  try {
    const res = await fetch('/api/history');
    const h = await res.json();
    renderHistory(h);
  } catch (e) {}
}

function fmtSize(bytes) {
  if (!bytes) return '--';
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  return (mb / 1024).toFixed(1) + ' GB';
}

function fmtExpires(iso) {
  if (!iso) return '--';
  try {
    const d = new Date(iso);
    const now = Date.now();
    const sec = Math.floor((d - now) / 1000);
    if (sec <= 0) return 'expiring now';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `unloads in ${m}m${s}s`;
  } catch (e) {
    return escapeHtml(iso);
  }
}

function renderActive(models) {
  if (!models || models.length === 0) {
    activeList.textContent = 'No models currently running';
    activeList.classList.add('empty');
    return;
  }
  activeList.classList.remove('empty');
  activeList.innerHTML = '';
  for (const m of models) {
    const card = document.createElement('div');
    card.className = 'model-card active-bloom';
    const name = m.name || m.model || '';
    const d = m.details || {};
    card.innerHTML = `
      <div class="name">${escapeHtml(name)}</div>
      <div class="meta">VRAM: ${fmtSize(m.size_vram)} | Size: ${fmtSize(m.size)}</div>
      <div class="meta">${fmtExpires(m.expires_at)}</div>
      ${d.family ? `<div class="meta">Family: ${escapeHtml(d.family)}</div>` : ''}
      ${d.quantization_level ? `<div class="meta">Quant: ${escapeHtml(d.quantization_level)}</div>` : ''}
    `;
    card.addEventListener('click', () => openModelPanel(m));
    activeList.appendChild(card);
  }
}

function openModelPanel(m) {
  selectedModel = m;
  const name = m.name || m.model || '';
  panelModelName.textContent = name;
  panelContent.innerHTML = `<div style="color:#94a3b8;font-size:12px">Loading info for ${escapeHtml(name)}...</div>`;
  modelPanel.classList.add('open');
  panelBackdrop.classList.add('open');
  fetchModelInfo(name);
}

function closeModelPanel() {
  modelPanel.classList.remove('open');
  panelBackdrop.classList.remove('open');
  selectedModel = null;
}

async function fetchModelInfo(name) {
  try {
    const res = await fetch(`/api/model/info/${encodeURIComponent(name)}`);
    const data = await res.json();
    const d = data.details || {};
    panelContent.innerHTML = `
      <div class="kv"><b>Name:</b> ${escapeHtml(data.name || name)}</div>
      <div class="kv"><b>Modified:</b> ${escapeHtml(data.modified_at || '--')}</div>
      <div class="kv"><b>Size:</b> ${escapeHtml(data.size ? (data.size / 1024 / 1024).toFixed(2) + ' MB' : '--')}</div>
      <div class="kv"><b>Digest:</b> ${escapeHtml(data.digest || '--')}</div>
      <div class="kv"><b>Format:</b> ${escapeHtml(d.format || '--')}</div>
      <div class="kv"><b>Family:</b> ${escapeHtml(d.family || '--')}</div>
      <div class="kv"><b>Parameter size:</b> ${escapeHtml(d.parameter_size || '--')}</div>
      <div class="kv"><b>Quantization:</b> ${escapeHtml(d.quantization_level || '--')}</div>
    `;
  } catch (e) {
    panelContent.innerHTML = `<div class="error">Error loading info: ${escapeHtml(e.message)}</div>`;
  }
}

async function sendModelAction(action, label) {
  if (!selectedModel) return;
  const name = selectedModel.name || selectedModel.model;
  if (action === 'stop-now') {
    if (!confirm(`Force stop model "${name}" now?`)) return;
  }
  try {
    const res = await fetch(`/api/model/action/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    closeModelPanel();
    fetchStatus();
    fetchHistory();
  } catch (e) {
    alert(`Failed to ${label}: ${e.message}`);
  }
}

function renderHistory(h) {
  historyBody.innerHTML = '';
  for (const rec of h) {
    const tr = document.createElement('tr');
    const etype = rec.type;
    tr.className = `event-${etype.replace(/\s+/g, '_')}`;
    let details = '';
    if (etype === 'state_change') {
      const names = (rec.models || []).map(x => x.name).join(', ') || '(none)';
      details = `<div>Active: ${rec.active_count || 0}</div><div>${escapeHtml(names)}</div>`;
    } else if (etype === 'ollama_down') {
      details = `<div>Error: ${escapeHtml(rec.error || '')}</div>`;
    } else if (etype === 'Started') {
      const d = rec.details || {};
      details = `<div>Model: <b>${escapeHtml(rec.model || d.model || '')}</b></div>
        ${d.status ? `<div>Status: ${escapeHtml(d.status)}</div>` : ''}
        ${d.context_length ? `<div>Context: ${d.context_length}</div>` : ''}`;
    } else if (etype === 'Ended') {
      details = `<div>Model: <b>${escapeHtml(rec.model || '')}</b></div>
        ${rec.duration ? `<div>Duration: <b>${escapeHtml(rec.duration)}</b></div>` : ''}
        ${rec.duration_ms ? `<div>Duration (ms): ${rec.duration_ms}</div>` : ''}`;
    } else {
      details = `<details><summary>json</summary><pre>${escapeHtml(pretty(rec))}</pre></details>`;
    }
    tr.innerHTML = `
      <td>${fmtTime(rec.ts)}</td>
      <td><span class="event-badge">${escapeHtml(etype)}</span></td>
      <td>${details}</td>
    `;
    historyBody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

startBtn.addEventListener('click', async () => {
  await fetch('/api/start', { method: 'POST' });
  fetchStatus();
  fetchHistory();
});

stopBtn.addEventListener('click', async () => {
  await fetch('/api/stop', { method: 'POST' });
  fetchStatus();
  fetchHistory();
});

clearBtn.addEventListener('click', async () => {
  try {
    const confirmed = confirm('Clear history (last few days log)?');
    if (!confirmed) return;
    await fetch('/api/clear', { method: 'POST' });
    fetchHistory();
  } catch (e) {}
});

if (shutdownBtn) {
  shutdownBtn.addEventListener('click', async () => {
    try {
      const confirmed = confirm('Shut down the Ollama Monitor server? This will close the app.');
      if (!confirmed) return;
      await fetch('/api/shutdown', { method: 'POST' }).catch(() => {});
      setTimeout(() => { window.close(); location.href = 'about:blank'; }, 500);
    } catch (e) {}
  });
}

panelClose.addEventListener('click', closeModelPanel);
panelBackdrop.addEventListener('click', closeModelPanel);

btnInfo.addEventListener('click', () => {
  if (!selectedModel) return;
  fetchModelInfo(selectedModel.name || selectedModel.model);
  closeModelPanel();
});

btnGentle.addEventListener('click', () => sendModelAction('stop-gentle', 'gently stop model'));

btnForce.addEventListener('click', () => sendModelAction('stop-now', 'force stop model'));

async function init() {
  await fetch('/api/start', { method: 'POST' }).catch(() => {});
  setInterval(fetchStatus, 1000);
  setInterval(fetchHistory, 5000);
  fetchStatus();
  fetchHistory();
}

init();
