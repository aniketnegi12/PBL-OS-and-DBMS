# ContainerLite — System Architecture

Three tiers, exactly as proposed in the Phase-1 draft:

```
┌──────────────────────────────────────────────────────────────────┐
│  PRESENTATION — Python CLI (cli/)                                │
│  clite start|stop|restart|list|inspect|remove|logs <container>   │
└──────────────────────────────┬───────────────────────────────────┘
                               │ subprocess / bridge
┌──────────────────────────────▼───────────────────────────────────┐
│  PROCESSING — C runtime core (runtime/) on Linux                 │
│  • unshare(2) namespaces: PID, NET, MNT, IPC, UTS, USER          │
│  • cgroup v2 + setrlimit(2): memory / CPU / pids / nofile caps   │
│  • fork + execvp of image entrypoint; waitpid reaper loop        │
│  • samples /proc + cgroup stats → metrics                        │
└──────────────────────────────┬───────────────────────────────────┘
                               │ python-oracledb (thin, no client)
┌──────────────────────────────▼───────────────────────────────────┐
│  PERSISTENCE — Oracle state store (db/)                          │
│  schema_full.sql: 9 tables · 11 triggers · 4 views · proc · fn   │
│  containers · processes · namespaces · resource_limits ·         │
│  metrics · events (trigger-written audit) · logs · images · users│
└──────────────────────────────────────────────────────────────────┘
```

## Command → data flow (`clite start web-proxy`)

1. CLI resolves the container row (status must be `CREATED`/`STOPPED`…)
   and its `resource_limits` + `images.entrypoint`.
2. Runtime bridge invokes the C core: applies cgroup limits, creates the
   namespaces, `fork`+`execvp(entrypoint)`, returns the init `os_pid`.
3. CLI writes `containers.status='RUNNING', pid=os_pid` →
   **BEFORE trigger** stamps `started_at`, **AFTER trigger** appends a
   `STARTED` row to `events`. The audit trail needs no application code.
4. Monitor loop samples CPU/memory/net/pids into `metrics`; every spawned
   child is recorded in `processes` (self-FK keeps the process tree);
   stdout/stderr land in `logs`.
5. `clite stop web-proxy` → `prc_stop_container(...)` locks the row, sets
   `STOPPED`, reaps children (`waitpid`), and the trigger writes the
   `STOPPED` event.

## Why the DB is the state store, not a log file

- Crash-safe recovery: `SELECT … WHERE status='RUNNING'` reconstructs the
  supervisor's view after a reboot (stale pids are detected and marked).
- History for the report: uptime, restart counts, metric trends, event
  timeline — all plain SQL (`db/queries_full.sql` runs them live in the demo).
- Integrity by construction: CHECK constraints make invalid states
  (exit_code 999, swap < memory, status `PAUSED→CREATED`) impossible.
