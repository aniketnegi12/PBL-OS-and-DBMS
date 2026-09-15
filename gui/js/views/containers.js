/**
 * views/containers.js — Containers Grid View
 *
 * Renders container cards with filter/search.
 * Uses Decorator Pattern to augment cards with actions.
 */
import { Store } from '../store.js';
import { actions } from '../actions.js';
import { fmtRelative } from '../data.js';

const ESC = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

export function initContainers() {
  _bindFilters();
  _bindSearch();
}

export function renderContainers(state) {
  const s = state || Store.getInstance().getState();
  const { containers, containerFilter, containerSearch } = s;

  const filtered = containers.filter(c => {
    const matchFilter = containerFilter === 'all' || c.status === containerFilter;
    const q = containerSearch.toLowerCase();
    const matchSearch = !q || c.name.toLowerCase().includes(q) || c.command.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const grid = document.getElementById('container-grid');
  if (!grid) return;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <p class="empty-state__icon" aria-hidden="true">⬡</p>
        <p class="empty-state__text">No containers match your filter</p>
        <button class="btn btn--primary btn--sm" style="margin-top:1.5rem" id="empty-new-btn">+ New Container</button>
      </div>
    `;
    document.getElementById('empty-new-btn')?.addEventListener('click', () => actions.openCreateModal());
    return;
  }

  // Diff-render: update existing cards before clearing
  grid.innerHTML = '';
  grid.classList.add('stagger');

  filtered.forEach((c, i) => {
    const card = _buildContainerCard(c);
    card.style.animationDelay = `${i * 50}ms`;
    grid.appendChild(card);
  });
}

function _buildContainerCard(c) {
  const isRunning = c.status === 'RUNNING';
  const card = document.createElement('article');
  card.className = 'container-card';
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', `Container ${c.name}`);
  card.dataset.cid = c.id;

  card.innerHTML = `
    <div class="container-card__header">
      <div>
        <p class="container-card__name">${ESC(c.name)}</p>
        <p class="container-card__id"># ${c.id}</p>
      </div>
      <span class="badge badge--status-${c.status}" aria-label="Status: ${c.status}">${c.status}</span>
    </div>
    <p class="container-card__cmd" title="${ESC(c.command)}">${ESC(c.command)}</p>
    <div class="container-card__meta">
      <span class="container-card__meta-item" aria-label="PID">
        PID&nbsp;<strong>${c.pid > 0 ? c.pid : '—'}</strong>
      </span>
      <span class="container-card__meta-item" aria-label="CPU limit">
        CPU&nbsp;<strong>${c.maxCpu > 0 ? c.maxCpu + 's' : '∞'}</strong>
      </span>
      <span class="container-card__meta-item" aria-label="Memory limit">
        MEM&nbsp;<strong>${c.maxMem > 0 ? c.maxMem + 'MB' : '∞'}</strong>
      </span>
    </div>
    <div class="container-card__actions">
      ${isRunning
        ? `<button class="btn btn--ghost btn--sm" data-action="stop" aria-label="Stop container ${ESC(c.name)}">Stop</button>
           <button class="btn btn--ghost btn--sm" data-action="restart" aria-label="Restart container ${ESC(c.name)}">↺ Restart</button>`
        : `<button class="btn btn--primary btn--sm" data-action="start" aria-label="Start container ${ESC(c.name)}">▶ Start</button>`
      }
      <button class="btn btn--ghost btn--sm" data-action="logs" aria-label="View logs for container ${ESC(c.name)}" style="margin-left:auto">Logs</button>
      <button class="btn btn--ghost btn--sm" data-action="delete" aria-label="Delete container ${ESC(c.name)}" style="color:var(--color-red)">✕</button>
    </div>
  `;

  // Bind buttons
  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const a = btn.dataset.action;
      if (a === 'start')   actions.startContainer(c.id);
      if (a === 'stop')    actions.stopContainer(c.id);
      if (a === 'restart') actions.restartContainer(c.id);
      if (a === 'delete')  actions.deleteContainer(c.id, card);
      if (a === 'logs')    actions.viewLogs(c.id);
    });
  });

  return card;
}

function _bindFilters() {
  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      Store.getInstance().commit({ containerFilter: btn.dataset.filter }, 'containers');
    });
  });
}

function _bindSearch() {
  const input = document.getElementById('container-search');
  if (!input) return;
  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      Store.getInstance().commit({ containerSearch: input.value }, 'containers');
    }, 200);
  });
}
