/**
 * data.js — Mock Data Service Layer (Repository Pattern)
 *
 * Abstracts data sources behind a clean interface.
 * Swap mock → real API without changing callers (Dependency Inversion Principle).
 * Simulates real process lifecycle with believable timing & IDs.
 */

/** @returns {Container[]} */
export function createSeedContainers() {
  return [
    {
      id: 1001, name: 'web-nginx',
      command: 'python3 -m http.server 8080',
      status: 'RUNNING', pid: 38421,
      maxCpu: 60, maxMem: 512,
      createdAt: offsetDate(-86400),
    },
    {
      id: 1002, name: 'cpu-worker',
      command: 'python3 -c "import time; time.sleep(30)"',
      status: 'RUNNING', pid: 38499,
      maxCpu: 10, maxMem: 128,
      createdAt: offsetDate(-3600),
    },
    {
      id: 1003, name: 'batch-cleaner',
      command: 'echo "Batch Job Completed"',
      status: 'EXITED', pid: 0,
      maxCpu: 5, maxMem: 64,
      createdAt: offsetDate(-7200),
    },
    {
      id: 1004, name: 'db-backup',
      command: 'pg_dump -Fc dbname > backup.dump',
      status: 'STOPPED', pid: 0,
      maxCpu: 120, maxMem: 256,
      createdAt: offsetDate(-21600),
    },
    {
      id: 1005, name: 'monitor-agent',
      command: 'python3 ./agents/monitor.py --interval 5',
      status: 'RUNNING', pid: 38577,
      maxCpu: 30, maxMem: 96,
      createdAt: offsetDate(-1800),
    },
    {
      id: 1006, name: 'asset-compiler',
      command: 'node ./build/compiler.js --minify',
      status: 'FAILED', pid: 0,
      maxCpu: 60, maxMem: 512,
      createdAt: offsetDate(-900),
    },
  ];
}

/** @returns {ProcessNode[]} */
export function createSeedProcesses(containers) {
  return containers
    .filter(c => c.pid > 0)
    .map(c => ({
      pid: c.pid,
      name: c.name,
      command: c.command,
      status: c.status,
      containerId: c.id,
      cpuPct: c.status === 'RUNNING' ? +(Math.random() * 35 + 2).toFixed(1) : 0,
      memMb: c.status === 'RUNNING' ? Math.floor(Math.random() * c.maxMem * 0.6 + 10) : 0,
      threads: c.status === 'RUNNING' ? Math.floor(Math.random() * 4 + 1) : 0,
      startTime: fmtTime(c.createdAt),
    }));
}

/** @returns {LogEntry[]} */
export function createSeedLogs(containers) {
  const logs = [];
  const events = [
    { from: null, to: 'PENDING',  msg: 'Created new container record' },
    { from: 'PENDING', to: 'RUNNING', msg: 'Process started via fork()/execvp()' },
    { from: 'RUNNING', to: 'EXITED',  msg: 'Process exited with code 0' },
    { from: 'RUNNING', to: 'STOPPED', msg: 'SIGTERM dispatched, process stopped cleanly' },
    { from: 'RUNNING', to: 'FAILED',  msg: 'SIGKILL after grace period, exit code 1' },
  ];

  for (const c of containers) {
    logs.push({ id: logs.length + 9001, containerId: c.id, containerName: c.name,
      oldStatus: null, newStatus: 'PENDING', message: 'Created new container record',
      time: new Date(c.createdAt.getTime() - 1000) });
    logs.push({ id: logs.length + 9001, containerId: c.id, containerName: c.name,
      oldStatus: 'PENDING', newStatus: 'RUNNING', message: 'Process started via fork()/execvp()',
      time: c.createdAt });

    if (c.status === 'EXITED') {
      logs.push({ id: logs.length + 9001, containerId: c.id, containerName: c.name,
        oldStatus: 'RUNNING', newStatus: 'EXITED', message: 'Process exited with code 0',
        time: offsetDate(-600) });
    } else if (c.status === 'STOPPED') {
      logs.push({ id: logs.length + 9001, containerId: c.id, containerName: c.name,
        oldStatus: 'RUNNING', newStatus: 'STOPPED', message: 'SIGTERM dispatched, process stopped cleanly',
        time: offsetDate(-3600) });
    } else if (c.status === 'FAILED') {
      logs.push({ id: logs.length + 9001, containerId: c.id, containerName: c.name,
        oldStatus: 'RUNNING', newStatus: 'FAILED', message: 'SIGKILL after grace period — exit code 137',
        time: offsetDate(-900) });
    }
  }

  return logs.sort((a, b) => b.time - a.time);
}

/* ── Utilities ── */
function offsetDate(seconds) {
  return new Date(Date.now() + seconds * 1000);
}

export function fmtTime(d) {
  return d.toLocaleTimeString('en-US', { hour12: false });
}

export function fmtDateTime(d) {
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}

export function fmtRelative(d) {
  const delta = Math.floor((Date.now() - d) / 1000);
  if (delta < 60)  return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}
