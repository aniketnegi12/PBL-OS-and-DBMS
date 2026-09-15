/**
 * views/dashboard.js — Dashboard View (Presenter Pattern)
 *
 * Solely responsible for rendering the dashboard view.
 * Reads state, generates DOM, registers interactions.
 * Does NOT mutate global state directly — delegates to actions.
 */
import { Store } from '../store.js';
import { ChartFactory } from '../chart.js';
import { fmtRelative, fmtDateTime, randomBetween } from '../data.js';
import { actions } from '../actions.js';

let cpuChart, memChart, procChart;
let _metricsInterval = null;

const PILLARS = [
  {
    icon: '⚙', person: 'Person A', personColor: 'hsl(215 100% 60%)',
    title: 'Process Lifecycle',
    desc: 'POSIX fork(), execvp() for spawning real child processes. waitpid() + status macros for lifecycle tracking.',
    tags: ['fork()', 'exec()', 'waitpid()', 'WIFEXITED'],
  },
  {
    icon: '⚡', person: 'Person B', personColor: 'hsl(45 100% 60%)',
    title: 'Control & Signals',
    desc: 'SIGTERM → grace period → SIGKILL signal chain for graceful shutdown. setrlimit() kernel resource bounds.',
    tags: ['SIGTERM', 'SIGKILL', 'setrlimit()', 'setsid()'],
  },
  {
    icon: '🗄', person: 'Person C', personColor: 'hsl(145 70% 50%)',
    title: 'Schema & Queries',
    desc: 'Oracle RDBMS schema design: CONTAINERS, RESOURCE_LIMITS, CONTAINER_LOGS tables with constraints & indexes.',
    tags: ['schema.sql', 'CRUD', 'CHECK CONSTRAINTS', 'INDEXES'],
  },
  {
    icon: '🔒', person: 'Person D', personColor: 'hsl(280 80% 70%)',
    title: 'PL/SQL & Concurrency',
    desc: 'CREATE_CONTAINER stored procedure with ROLLBACK logic, status audit trigger, and SELECT FOR UPDATE demo.',
    tags: ['PL/SQL', 'TRIGGER', 'FOR UPDATE', 'COMMIT/ROLLBACK'],
  },
];

export function initDashboard() {
  _renderTerminal();
  _renderMetricCards();
  _initCharts();
  _renderPillars();
  _bindActions();
}

export function refreshDashboard(state) {
  _renderMetricCards(state);
  _renderRecentTable(state);
}

function _renderTerminal() {
  const body = document.getElementById('terminal-body');
  if (!body) return;
  const lines = [
    { text: '$ ./containeros-runtime start --cpu 30 --mem 256 -- python3 server.py', cls: '' },
    { text: '{"status": "RUNNING", "pid": 38421, "error": null}', cls: 'terminal__line--accent' },
    { text: '$ ./containeros-runtime status --pid 38421', cls: '' },
    { text: '{"pid": 38421, "status": "RUNNING", "exit_code": 0, "term_sig": 0}', cls: 'terminal__line--info' },
    { text: '$ python3 cli/containeros.py create --name web-nginx --cmd "python3 -m http.server 8080"', cls: '' },
    { text: '[SUCCESS] Created container \'web-nginx\' with ID: 1001', cls: 'terminal__line--accent' },
    { text: '$ python3 cli/containeros.py start --id 1001', cls: '' },
    { text: '[*] Starting container ID 1001 (\'web-nginx\')...', cls: 'terminal__line--dim' },
    { text: '[SUCCESS] Container \'web-nginx\' started with PID 38421.', cls: 'terminal__line--accent' },
    { text: '$ python3 cli/containeros.py list', cls: '' },
    { text: 'ID     NAME                  STATUS       PID      COMMAND', cls: 'terminal__line--dim' },
    { text: '1001   web-nginx             RUNNING      38421    python3 -m http.server 8080', cls: '' },
    { text: '1002   cpu-worker            RUNNING      38499    python3 -c "import time;..."', cls: '' },
    { text: '1003   batch-cleaner         EXITED       0        echo "Batch Job Completed"', cls: 'terminal__line--dim' },
    { text: '█', cls: 'terminal__cursor terminal__line' },
  ];

  body.innerHTML = '';
  let i = 0;
  const write = () => {
    if (i >= lines.length) return;
    const { text, cls } = lines[i++];
    const span = document.createElement('div');
    span.className = `terminal__line ${cls}`;
    span.textContent = text;
    body.appendChild(span);
    body.scrollTop = body.scrollHeight;
    setTimeout(write, 100 + Math.random() * 80);
  };
  setTimeout(write, 600);
}

function _renderMetricCards(state) {
  const store = Store.getInstance();
  const s = state || store.getState();
  const { running, stopped, failed, total } = s.metrics;

  const metrics = [
    {
      icon: '▶', label: 'Running',
      value: running, delta: 'Healthy processes',
      color: 'hsl(145 70% 50%)', glow: 'hsl(145 70% 50% / 0.2)',
      id: 'mc-running',
    },
    {
      icon: '⏸', label: 'Stopped',
      value: stopped, delta: 'Gracefully halted',
      color: 'hsl(45 100% 60%)', glow: 'hsl(45 100% 60% / 0.2)',
      id: 'mc-stopped',
    },
    {
      icon: '✕', label: 'Failed',
      value: failed, delta: 'SIGKILL / non-zero exit',
      color: 'hsl(0 80% 60%)', glow: 'hsl(0 80% 60% / 0.2)',
      id: 'mc-failed',
    },
    {
      icon: '⬡', label: 'Total',
      value: total, delta: 'Registered containers',
      color: 'hsl(215 100% 65%)', glow: 'hsl(215 100% 65% / 0.2)',
      id: 'mc-total',
    },
  ];

  const grid = document.getElementById('metric-grid');
  if (!grid) return;

  // Update if already rendered, else render fresh
  if (grid.children.length > 0) {
    metrics.forEach(m => {
      const valEl = document.getElementById(`${m.id}-val`);
      if (valEl) valEl.textContent = m.value;
    });
    return;
  }

  grid.innerHTML = '';
  grid.classList.add('stagger');
  metrics.forEach(m => {
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.style.setProperty('--mc-color', m.color);
    card.style.setProperty('--mc-glow',  m.glow);
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <span class="metric-card__icon" aria-hidden="true">${m.icon}</span>
      <p class="metric-card__label">${m.label}</p>
      <p class="metric-card__value" id="${m.id}-val">${m.value}</p>
      <p class="metric-card__delta">${m.delta}</p>
    `;
    grid.appendChild(card);
  });
}

function _initCharts() {
  cpuChart  = ChartFactory.create('cpu-canvas',  'cpu');
  memChart  = ChartFactory.create('mem-canvas',  'mem');
  procChart = ChartFactory.create('proc-canvas', 'proc');

  const store = Store.getInstance();

  // Seed with history
  const { cpuHistory, memHistory, procHistory } = store.getState().metrics;
  if (cpuHistory.length > 0) {
    cpuChart.setData(cpuHistory);
    memChart.setData(memHistory);
    procChart.setData(procHistory);
    _updateChartLabels(store.getState());
  }

  // Subscribe to metric updates
  store.on('metrics', (state) => {
    const { cpuHistory, memHistory, procHistory } = state.metrics;
    cpuChart?.push(cpuHistory.at(-1));
    memChart?.push(memHistory.at(-1));
    procChart?.push(procHistory.at(-1));
    _updateChartLabels(state);
  });
}

function _updateChartLabels(state) {
  const { cpuHistory, memHistory, procHistory } = state.metrics;
  const cpu  = cpuHistory.at(-1)  ?? 0;
  const mem  = memHistory.at(-1)  ?? 0;
  const proc = procHistory.at(-1) ?? 0;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('cpu-value',  `${cpu.toFixed(1)}%`);
  set('mem-value',  `${mem.toFixed(0)} MB`);
  set('proc-value', `${proc} procs`);
}

function _renderPillars() {
  const grid = document.getElementById('pillar-grid');
  if (!grid || grid.children.length > 0) return;
  grid.classList.add('stagger');

  PILLARS.forEach(p => {
    const card = document.createElement('div');
    card.className = 'pillar-card';
    card.style.setProperty('--pc-color', p.personColor);
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <div class="pillar-card__glow" aria-hidden="true"></div>
      <span class="pillar-card__icon" aria-hidden="true">${p.icon}</span>
      <span class="pillar-card__person" style="background:${p.personColor}">${p.person}</span>
      <h3 class="pillar-card__title">${p.title}</h3>
      <p class="pillar-card__desc">${p.desc}</p>
      <div class="pillar-card__tags">
        ${p.tags.map(t => `<span class="pillar-card__tag">${t}</span>`).join('')}
      </div>
    `;
    grid.appendChild(card);
  });
}

export function renderRecentTable(state) {
  _renderRecentTable(state);
}

function _renderRecentTable(state) {
  const tbody = document.getElementById('recent-table-body');
  if (!tbody) return;
  const containers = (state?.containers || Store.getInstance().getState().containers).slice(0, 5);
  tbody.innerHTML = containers.map(c => `
    <tr>
      <td class="td-mono">${c.id}</td>
      <td class="td-name">${escHtml(c.name)}</td>
      <td class="td-mono" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(c.command)}</td>
      <td><span class="badge badge--status-${c.status}">${c.status}</span></td>
      <td class="td-mono">${c.pid > 0 ? c.pid : '—'}</td>
      <td>
        ${c.status === 'RUNNING'
          ? `<button class="btn btn--ghost btn--sm" data-action="stop" data-id="${c.id}">Stop</button>`
          : `<button class="btn btn--primary btn--sm" data-action="start" data-id="${c.id}">Start</button>`
        }
      </td>
    </tr>
  `).join('');

  // Wire table action buttons
  tbody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = +btn.dataset.id;
      const action = btn.dataset.action;
      action === 'stop' ? actions.stopContainer(id) : actions.startContainer(id);
    });
  });
}

function _bindActions() {
  document.getElementById('hero-launch-btn')?.addEventListener('click', () => actions.openCreateModal());
  document.getElementById('hero-docs-btn')?.addEventListener('click', () => {
    Router.getInstance?.()?.navigate?.('database');
    document.querySelector('[data-view="database"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
