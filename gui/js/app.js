/**
 * app.js — Application Bootstrap (Composition Root)
 *
 * This is the ONLY place where all modules are wired together.
 * Dependency Injection: modules receive their dependencies here.
 * Follows the Composition Root pattern — one location owns all wiring.
 *
 * Architecture summary:
 *   Store (Observable)          ← Single source of truth
 *   ├── Router (Strategy)       ← View navigation
 *   ├── Actions (Command)       ← All state mutations
 *   ├── Views/Dashboard         ← Dashboard presenter
 *   ├── Views/Containers        ← Container grid presenter
 *   ├── Views/Processes         ← Process tree presenter
 *   ├── Views/Database          ← SQL/PL/SQL viewer
 *   ├── Views/Logs              ← Audit log stream
 *   ├── Chart (Factory)         ← Sparkline chart instances
 *   └── Toast (Facade)          ← Notification service
 */

import { Store }     from './store.js';
import { Router }    from './router.js';
import { actions }   from './actions.js';
import { Toast }     from './toast.js';

import { createSeedContainers, createSeedProcesses, createSeedLogs, randomBetween } from './data.js';

import { initDashboard, refreshDashboard, renderRecentTable } from './views/dashboard.js';
import { initContainers, renderContainers }  from './views/containers.js';
import { renderProcesses }                   from './views/processes.js';
import { initDatabase, renderDatabase }      from './views/database.js';
import { renderLogs }                        from './views/logs.js';

/* ── Bootstrap ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const store  = Store.getInstance();
  const router = Router.getInstance();

  // ── 1. Seed initial state ──
  const containers = createSeedContainers();
  const processes  = createSeedProcesses(containers);
  const logs       = createSeedLogs(containers);

  const running = containers.filter(c => c.status === 'RUNNING').length;
  const stopped = containers.filter(c => c.status === 'STOPPED').length;
  const failed  = containers.filter(c => c.status === 'FAILED').length;
  const cpuSeed  = Array.from({ length: 30 }, () => +randomBetween(8, 65).toFixed(1));
  const memSeed  = Array.from({ length: 30 }, () => Math.floor(randomBetween(120, 580)));
  const procSeed = Array.from({ length: 30 }, () => Math.floor(randomBetween(1, running + 1)));

  store.commit({
    containers,
    processes,
    logs,
    metrics: {
      running, stopped, failed,
      total: containers.length,
      cpuHistory: cpuSeed,
      memHistory: memSeed,
      procHistory: procSeed,
    },
  });

  // ── 2. Apply saved theme ──
  applyTheme(store.getState().theme);

  // ── 3. Register routes ──
  router.register('dashboard',  (s) => { refreshDashboard(s); renderRecentTable(s); });
  router.register('containers', (s) => renderContainers(s));
  router.register('processes',  (s) => renderProcesses(s));
  router.register('database',   (s) => renderDatabase(s));
  router.register('logs',       (s) => renderLogs(s));

  // ── 4. Wire navigation links ──
  router.bindLinks();

  // ── 5. Init view-specific components ──
  initDashboard();
  initContainers();
  initDatabase();

  // ── 6. Initial render for default view ──
  renderRecentTable(store.getState());

  // ── 7. Subscribe to state changes → re-render active view ──
  store.on('containers', s => {
    const view = s.currentView;
    if (view === 'dashboard')  { refreshDashboard(s); renderRecentTable(s); }
    if (view === 'containers') renderContainers(s);
    if (view === 'processes')  renderProcesses(s);
    if (view === 'logs')       renderLogs(s);
  });

  store.on('processes', s => {
    if (s.currentView === 'processes') renderProcesses(s);
  });

  store.on('logs', s => {
    if (s.currentView === 'logs') renderLogs(s);
  });

  // ── 8. Bind global UI ──
  _bindNavbar();
  _bindModal();
  _bindThemeToggle(store);

  // ── 9. Simulate live metrics polling ──
  setInterval(() => actions.tickMetrics(), 2500);

  // ── 10. Navbar scroll enhancement ──
  window.addEventListener('scroll', () => {
    document.getElementById('navbar')?.classList.toggle('navbar--scrolled', window.scrollY > 20);
  }, { passive: true });
});

/* ── Navbar ─────────────────────────────────────────────────── */
function _bindNavbar() {
  const hamburger = document.getElementById('hamburger');
  hamburger?.addEventListener('click', () => {
    const links = document.querySelector('.navbar__links');
    const expanded = hamburger.getAttribute('aria-expanded') === 'true';
    hamburger.setAttribute('aria-expanded', String(!expanded));
    if (links) {
      links.style.display = expanded ? 'none' : 'flex';
      links.style.flexDirection = 'column';
      links.style.position = 'absolute';
      links.style.top = '64px';
      links.style.left = '0';
      links.style.right = '0';
      links.style.background = 'var(--color-bg-elevated)';
      links.style.padding = 'var(--sp-4)';
      links.style.borderBottom = '1px solid var(--color-border)';
      links.style.zIndex = 'var(--z-nav)';
    }
  });

  // New Container button
  document.getElementById('btn-new-container')?.addEventListener('click', () => actions.openCreateModal());
}

/* ── Modal ──────────────────────────────────────────────────── */
function _bindModal() {
  const overlay = document.getElementById('modal-overlay');
  const form    = document.getElementById('create-container-form');
  const submit  = document.getElementById('modal-submit');

  // Close on overlay click
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) actions.closeModal();
  });

  // Close button
  document.getElementById('modal-close')?.addEventListener('click', () => actions.closeModal());
  document.getElementById('modal-cancel')?.addEventListener('click', () => actions.closeModal());

  // ESC key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay?.hidden) actions.closeModal();
  });

  // Form submission
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('input-name').value.trim();
    const cmd  = document.getElementById('input-cmd').value.trim();
    const cpu  = parseInt(document.getElementById('input-cpu').value) || 0;
    const mem  = parseInt(document.getElementById('input-mem').value) || 0;

    let valid = true;

    // Validate name
    if (!name) {
      showFieldError('input-name', 'error-name', 'Container name is required.');
      valid = false;
    } else if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      showFieldError('input-name', 'error-name', 'Only letters, numbers, hyphens, dots, underscores allowed.');
      valid = false;
    } else {
      clearFieldError('input-name', 'error-name');
    }

    // Validate command
    if (!cmd) {
      showFieldError('input-cmd', 'error-cmd', 'Command is required.');
      valid = false;
    } else {
      clearFieldError('input-cmd', 'error-cmd');
    }

    if (!valid) return;

    // Simulate async submit
    const spinner = submit.querySelector('.btn__spinner');
    const label   = submit.querySelector('.btn__label');
    if (spinner) spinner.hidden = false;
    if (label)   label.textContent = 'Launching…';
    submit.disabled = true;

    await new Promise(r => setTimeout(r, 700));

    const success = actions.createContainer({ name, command: cmd, maxCpu: cpu, maxMem: mem });

    if (spinner) spinner.hidden = true;
    if (label)   label.textContent = 'Launch';
    submit.disabled = false;

    if (success) actions.closeModal();
  });
}

/* ── Theme toggle ───────────────────────────────────────────── */
function _bindThemeToggle(store) {
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = store.getState().theme;
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    store.commit({ theme: next });
    localStorage.setItem('cos-theme', next);
  });
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '☀' : '☾';
}

/* ── Form helpers ───────────────────────────────────────────── */
function showFieldError(inputId, errorId, msg) {
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errorId);
  if (input) input.classList.add('error');
  if (err)   err.textContent = msg;
}

function clearFieldError(inputId, errorId) {
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errorId);
  if (input) input.classList.remove('error');
  if (err)   err.textContent = '';
}
