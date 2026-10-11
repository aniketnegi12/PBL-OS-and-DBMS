# ContainerOS: Lightweight POSIX Process & Oracle RDBMS Engine

ContainerOS is a hybrid micro-container management control plane that bridges **low-level POSIX C process management** (fork/exec/waitpid/signals/setrlimit) with **Enterprise Database Persistence** (Oracle SQL, PL/SQL stored procedures, audit triggers, and row locking concurrency controls), unified by a **Python CLI (`cli/containeros.py`)**.

---

## 1. System Architecture & Team Deliverables

```
                           +-------------------------------------+
                           |            Python CLI               |
                           |         (cli/containeros.py)        |
                           +------------------+------------------+
                                              |
                   +--------------------------+--------------------------+
                   | (Subprocess / JSON IPC)                             | (oracledb / cx_Oracle)
                   v                                                     v
   +-------------------------------+                     +-------------------------------+
   |        OS C Runtime           |                     |       Oracle Database         |
   |   (process_manager / control) |                     |    (Schema, PL/SQL, Triggers)  |
   +---------------+---------------+                     +---------------+---------------+
                   |                                                     |
       +-----------+-----------+                             +-----------+-----------+
       |                       |                             |                       |
       v                       v                             v                       v
  [ POSIX Kernel ]      [ Kernel Caps ]                 [ Audit Logs ]       [ Lock Management ]
(fork, exec, waitpid)    (setrlimit)                  (Status Triggers)    (SELECT FOR UPDATE)
```

### OS Team (Process & Runtime Side)
* **Person A — Process Lifecycle Core (`src/process_manager.c`, `src/process_manager.h`)**
  * `spawn_process()`: Low-level child process creation via `fork()` and executable image loading via `execvp()`.
  * `monitor_process()`: POSIX process waiting via `waitpid()`, evaluating `WIFEXITED`, `WEXITSTATUS`, `WIFSIGNALED`, `WTERMSIG`, and `kill(pid, 0)` PID existence checks.
  * State Machine Mapping: `RUNNING` $\rightarrow$ `EXITED` / `FAILED`.
* **Person B — Control & Signals & Resource Limits (`src/control_manager.c`, `src/control_manager.h`)**
  * `stop_process()`: Graceful signal sequence (`SIGTERM` followed by grace period polling and `SIGKILL` escalation).
  * `apply_resource_limits()`: Enforces kernel bounds (`setrlimit`) for CPU execution time (`RLIMIT_CPU`) and virtual memory address space (`RLIMIT_AS`).
  * `src/main_runtime.c`: Unified C CLI binary (`containeros-runtime`) producing structured JSON telemetry. Calls `setsid()` for process group detachment.

### DBMS Team (Oracle Persistence Side)
* **Person C — Schema & Core Operations (`db/schema.sql`, `db/seed.sql`)**
  * Tables: `CONTAINERS`, `RESOURCE_LIMITS`, `CONTAINER_LOGS`.
  * Constraints: Primary Keys, Foreign Keys (cascading log deletes), Check constraints (`status IN ('PENDING', 'RUNNING', 'STOPPED', 'EXITED', 'FAILED')`), and performance indexes.
  * Seed Data: Baseline dataset for demonstration (`web-nginx`, `cpu-worker`, `batch-cleaner`).
* **Person D — Transactions, PL/SQL & Concurrency (`db/procedures.sql`, `db/triggers.sql`, `db/concurrency_demo.sql`)**
  * Stored Procedure `CREATE_CONTAINER`: Atomic transaction insertion of container + resource limit metadata with explicit exception handling (`ROLLBACK` on error, `COMMIT` on success).
  * Audit Trigger `TRG_CONTAINER_STATUS_LOG`: `AFTER UPDATE OF status ON CONTAINERS` trigger automatically recording state changes into `CONTAINER_LOGS`.
  * Live Concurrency Script (`concurrency_demo.sql`): Demonstrates row-level locking via `SELECT ... FOR UPDATE` across competing database sessions.

### Integration Layer (Everyone)
* **`cli/containeros.py`**: Python control plane orchestrating POSIX process management and Oracle database persistence. Dual-backend architecture supports live Oracle DB connections as well as a standalone SQLite fallback.

---

## 2. Directory Structure

```
container_os/
├── src/
│   ├── process_manager.h    # Person A: fork(), execvp(), waitpid() declarations
│   ├── process_manager.c    # Person A: Process lifecycle implementation
│   ├── control_manager.h    # Person B: Signals & setrlimit declarations
│   ├── control_manager.c    # Person B: Signal management & resource limits
│   └── main_runtime.c       # C runtime CLI binary entry point (JSON output)
├── db/
│   ├── schema.sql           # Person C: Database tables, indexes & constraints
│   ├── seed.sql             # Person C: Seed dataset for viva demos
│   ├── procedures.sql       # Person D: PL/SQL CREATE_CONTAINER procedure
│   ├── triggers.sql         # Person D: Audit trigger for container status changes
│   └── concurrency_demo.sql # Person D: SELECT ... FOR UPDATE live concurrency script
├── cli/
│   └── containeros.py       # Integration Glue: Python CLI
├── tests/
│   └── test_runtime.py      # Automated unit & integration test suite
├── Makefile                 # C build configuration
└── README.md                # Project documentation & Viva guide
```
