/**
 * actions.js — Command Action Layer (Command Pattern + Facade)
 *
 * All state mutations are routed through this module.
 * Keeps UI components decoupled from business logic (SRP + DIP).
 */
import { Store } from './store.js';
import { Toast } from './toast.js';
import { fmtDateTime, randomBetween } from './data.js';

const store = Store.getInstance();

function getState() { return store.getState(); }

export const actions = {

  openCreateModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      overlay.hidden = false;
      document.getElementById('input-name')?.focus();
    }
  },

  closeModal() {
    const overlay = document.getElementById('modal-overlay');
    const form = document.getElementById('create-container-form');
    if (overlay) overlay.hidden = true;
    if (form) form.reset();
    // Clear errors
    ['error-name','error-cmd'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
    ['input-name','input-cmd'].forEach(id => {
      document.getElementById(id)?.classList.remove('error');
    });
  },

  createContainer({ name, command, maxCpu, maxMem }) {
    const state = getState();
    // Validate uniqueness
    if (state.containers.find(c => c.name === name)) {
      Toast.error(`Container "${name}" already exists.`);
      return false;
    }

    const newId = Math.max(...state.containers.map(c => c.id), 1000) + 1;
    const container = {
      id: newId, name, command,
      status: 'PENDING', pid: 0,
      maxCpu, maxMem,
      createdAt: new Date(),
    };

    const updContainers = [...state.containers, container];

    // Add creation log
    const log = {
      id: Date.now(), containerId: newId, containerName: name,
      oldStatus: null, newStatus: 'PENDING',
      message: 'Created new container record via PL/SQL CREATE_CONTAINER procedure',
      time: new Date(),
    };

    store.commit({
      containers: updContainers,
      logs: [log, ...state.logs],
    }, 'containers');

    _recomputeMetrics();
    Toast.success(`Container "${name}" created.`);
    return true;
  },

  startContainer(id) {
    const state = getState();
    const container = state.containers.find(c => c.id === id);
    if (!container) return;

    const fakePid = Math.floor(randomBetween(38000, 49999));
    const log = {
      id: Date.now(), containerId: id, containerName: container.name,
      oldStatus: container.status, newStatus: 'RUNNING',
      message: `Process started via fork()/execvp(). PID: ${fakePid}`,
      time: new Date(),
    };

    _updateContainer(id, { status: 'RUNNING', pid: fakePid });
    store.commit({ logs: [log, ...state.logs] }, 'logs');
    _recomputeMetrics();
    Toast.success(`Container "${container.name}" started (PID ${fakePid}).`);
  },

  stopContainer(id) {
    const state = getState();
    const container = state.containers.find(c => c.id === id);
    if (!container) return;

    const log = {
      id: Date.now(), containerId: id, containerName: container.name,
      oldStatus: container.status, newStatus: 'STOPPED',
      message: 'SIGTERM dispatched → grace period → container stopped cleanly.',
      time: new Date(),
    };

    _updateContainer(id, { status: 'STOPPED', pid: 0 });
    store.commit({ logs: [log, ...state.logs] }, 'logs');
    _recomputeMetrics();
    Toast.warn(`Container "${container.name}" stopped.`);
  },

  restartContainer(id) {
    actions.stopContainer(id);
    setTimeout(() => actions.startContainer(id), 500);
  },

  forceKill(pid) {
    const state = getState();
    const container = state.containers.find(c => c.pid === pid);
    if (!container) {
      Toast.error(`No container with PID ${pid}.`);
      return;
    }
    const log = {
      id: Date.now(), containerId: container.id, containerName: container.name,
      oldStatus: container.status, newStatus: 'FAILED',
      message: `SIGKILL dispatched to PID ${pid}. Process forcibly terminated.`,
      time: new Date(),
    };
    _updateContainer(container.id, { status: 'FAILED', pid: 0 });
    store.commit({ logs: [log, ...state.logs] }, 'logs');
    _recomputeMetrics();
    Toast.error(`PID ${pid} killed with SIGKILL.`);
  },

  deleteContainer(id, cardEl) {
    const state = getState();
    const container = state.containers.find(c => c.id === id);
    if (!container) return;

    if (container.status === 'RUNNING') {
      Toast.error('Stop the container before deleting it.');
      return;
    }

    // Animate card out
    if (cardEl) {
      cardEl.style.transition = 'all 0.3s ease';
      cardEl.style.opacity = '0';
      cardEl.style.transform = 'scale(0.9)';
      setTimeout(() => cardEl.remove(), 300);
    }

    store.commit({
      containers: state.containers.filter(c => c.id !== id),
      logs: state.logs.filter(l => l.containerId !== id),
    }, 'containers');
    _recomputeMetrics();
    Toast.success(`Container "${container.name}" deleted.`);
  },

  viewLogs(id) {
    // Navigate to logs view and filter
    import('./router.js').then(({ Router }) => {
      Router.getInstance().navigate('logs');
      setTimeout(() => {
        const sel = document.getElementById('log-filter-container');
        if (sel) { sel.value = id; sel.dispatchEvent(new Event('change')); }
      }, 100);
    });
  },

  refreshProcesses() {
    const state = getState();
    // Simulate process CPU/memory fluctuations
    const updated = state.processes.map(p => ({
      ...p,
      cpuPct: p.status === 'RUNNING' ? +(randomBetween(1, 40)).toFixed(1) : 0,
      memMb:  p.status === 'RUNNING' ? Math.floor(randomBetween(10, 200)) : 0,
    }));
    store.commit({ processes: updated }, 'processes');
    Toast.info('Process list refreshed.');
  },

  tickMetrics() {
    const state = getState();
    const runningCount = state.containers.filter(c => c.status === 'RUNNING').length;
    const cpu  = +(randomBetween(5, 72)).toFixed(1);
    const mem  = Math.floor(randomBetween(120, 680));
    const proc = runningCount;

    const push = (arr, val, limit = 40) => [...arr, val].slice(-limit);

    store.commit({
      metrics: {
        ...state.metrics,
        cpuHistory:  push(state.metrics.cpuHistory, cpu),
        memHistory:  push(state.metrics.memHistory, mem),
        procHistory: push(state.metrics.procHistory, proc),
      }
    }, 'metrics');
  },
};

/* ── Private Helpers ── */

function _updateContainer(id, patch) {
  const state = getState();
  const containers = state.containers.map(c => c.id === id ? { ...c, ...patch } : c);
  const processes  = containers.filter(c => c.pid > 0).map(c => ({
    pid: c.pid, name: c.name, command: c.command,
    status: c.status, containerId: c.id,
    cpuPct: c.status === 'RUNNING' ? +(randomBetween(2, 35)).toFixed(1) : 0,
    memMb:  c.status === 'RUNNING' ? Math.floor(randomBetween(10, 200)) : 0,
    threads: c.status === 'RUNNING' ? Math.floor(randomBetween(1, 5)) : 0,
    startTime: c.createdAt?.toLocaleTimeString('en-US', { hour12: false }) || '--',
  }));
  store.commit({ containers, processes }, 'containers');
}

function _recomputeMetrics() {
  const state = getState();
  const running = state.containers.filter(c => c.status === 'RUNNING').length;
  const stopped = state.containers.filter(c => c.status === 'STOPPED').length;
  const failed  = state.containers.filter(c => c.status === 'FAILED').length;
  const total   = state.containers.length;
  store.commit({
    metrics: { ...state.metrics, running, stopped, failed, total }
  }, '*');
}
