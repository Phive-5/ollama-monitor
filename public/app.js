const statusEl = document.getElementById('ollamaStatus');
const monitorEl = document.getElementById('monitorStatus');
const lastEl = document.getElementById('lastCheck');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const shutdownBtn = document.getElementById('shutdownBtn');
const activeList = document.getElementById('activeList');
const historyBody = document.getElementById('historyBody');

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
    const done = m.done != null ? m.done : (m.completed || 0);
    const total = m.total || 1;
    const pct = Math.min(100, Math.max(0, (done / total) * 100));
    const name = m.name || m.model || '';
    const duration = m.duration ? `<div class="meta">Duration: <b>${escapeHtml(m.duration)}</b></div>` : '';
    card.innerHTML = `
      <div class="name">${escapeHtml(name)}</div>
      <div class="meta">Status: ${escapeHtml(m.status || '--')} | Context: ${m.context_length || '--'}</div>
      <div class="meta">Progress: ${done}/${total} (${pct.toFixed(0)}%)</div>
      ${duration}
      <div class="progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
    `;
    activeList.appendChild(card);
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

async function init() {
  await fetch('/api/start', { method: 'POST' }).catch(() => {});
  setInterval(fetchStatus, 1000);
  setInterval(fetchHistory, 5000);
  fetchStatus();
  fetchHistory();
}

init();
