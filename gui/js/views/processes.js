/**
 * views/processes.js — Process Tree View
 */
import { Store } from '../store.js';
import { actions } from '../actions.js';

export function renderProcesses(state) {
  const s = state || Store.getInstance().getState();
  _renderTree(s.processes);
  _bindRefresh();
  _bindSpawn();
}

function _renderTree(processes) {
  const tree = document.getElementById('process-tree');
  if (!tree) return;
  tree.innerHTML = '';

  if (processes.length === 0) {
    tree.innerHTML = `<div class="empty-state"><p class="empty-state__icon">⬡</p><p class="empty-state__text">No active processes</p></div>`;
    return;
  }

  processes.forEach(p => {
    const dotClass = p.status === 'RUNNING' ? 'green' : p.status === 'STOPPED' ? 'yellow' : 'red';
    const node = document.createElement('div');
    node.className = 'process-node';
    node.setAttribute('role', 'treeitem');
    node.setAttribute('aria-label', `Process ${p.name} PID ${p.pid}`);
    node.dataset.pid = p.pid;
    node.innerHTML = `
      <span class="process-node__dot process-node__dot--${dotClass}" aria-hidden="true"></span>
      <span class="process-node__name">${esc(p.name)}</span>
      <span class="process-node__pid">${p.pid}</span>
    `;
    node.addEventListener('click', () => _selectProcess(p, node));
    tree.appendChild(node);
  });
}

function _selectProcess(p, node) {
  document.querySelectorAll('.process-node').forEach(n => n.classList.remove('selected'));
  node.classList.add('selected');
  Store.getInstance().commit({ selectedProcess: p }, 'processes');
  _renderDetail(p);
}

function _renderDetail(p) {
  const panel = document.getElementById('process-detail-content');
  if (!panel) return;

  const statusColor = { RUNNING: 'var(--color-green)', STOPPED: 'var(--color-yellow)', FAILED: 'var(--color-red)' }[p.status] || 'var(--color-text-muted)';

  panel.innerHTML = `
    <div style="margin-bottom:var(--sp-5)">
      <p style="font-size:var(--text-xl);font-weight:700;letter-spacing:-0.02em;margin-bottom:var(--sp-2)">${esc(p.name)}</p>
      <span class="badge badge--status-${p.status}">${p.status}</span>
    </div>
    <div>
      ${detail('PID',        p.pid)}
      ${detail('COMMAND',    `<span style="font-family:var(--font-mono);font-size:var(--text-xs);word-break:break-all">${esc(p.command)}</span>`)}
      ${detail('CPU %',      `<span style="color:var(--color-accent)">${p.cpuPct}%</span>`)}
      ${detail('MEMORY',     `<span style="color:var(--color-green)">${p.memMb} MB</span>`)}
      ${detail('THREADS',    p.threads)}
      ${detail('STARTED',    p.startTime)}
      ${detail('CONTAINER',  `#${p.containerId}`)}
    </div>
    <div style="display:flex;gap:var(--sp-3);margin-top:var(--sp-6)">
      ${p.status === 'RUNNING'
        ? `<button class="btn btn--ghost btn--sm" id="detail-stop-btn">Stop</button>
           <button class="btn btn--danger btn--sm" id="detail-kill-btn">SIGKILL</button>`
        : `<button class="btn btn--primary btn--sm" id="detail-start-btn">Start</button>`
      }
    </div>
  `;

  document.getElementById('detail-stop-btn')?.addEventListener('click', () => actions.stopContainer(p.containerId));
  document.getElementById('detail-kill-btn')?.addEventListener('click', () => actions.forceKill(p.pid));
  document.getElementById('detail-start-btn')?.addEventListener('click', () => actions.startContainer(p.containerId));
}

function detail(key, val) {
  return `
    <div class="detail-row">
      <span class="detail-row__key">${key}</span>
      <span class="detail-row__val">${val}</span>
    </div>
  `;
}

function _bindRefresh() {
  document.getElementById('refresh-proc')?.addEventListener('click', () => {
    actions.refreshProcesses();
  });
}

function _bindSpawn() {
  document.getElementById('btn-spawn')?.addEventListener('click', () => actions.openCreateModal());
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
