# ContainerLite — ER Diagram

For the PBL project **“A Lightweight Container Runtime with OS-Level Process
Management and an Oracle-Backed State Store”**.

Nine entities. `containers` is the hub: everything the runtime does — spawn
processes, isolate namespaces, cap resources, sample metrics, audit events —
hangs off it.

```mermaid
erDiagram
    USERS ||--o{ CONTAINERS : "owns"
    IMAGES ||--o{ CONTAINERS : "instantiated as"
    CONTAINERS ||--o{ PROCESSES : "runs"
    PROCESSES |o--o{ PROCESSES : "parent of"
    CONTAINERS ||--|| RESOURCE_LIMITS : "capped by"
    CONTAINERS ||--o{ NAMESPACES : "isolated by"
    CONTAINERS ||--o{ METRICS : "sampled in"
    CONTAINERS ||--o{ EVENTS : "audited in"
    PROCESSES ||--o{ LOGS : "emits"

    USERS {
        number user_id PK "seq_users"
        varchar2 username UK "CLI login name"
        varchar2 full_name
        varchar2 email
        varchar2 role "admin|student|viewer"
        timestamp created_at
    }
    IMAGES {
        number image_id PK "seq_images"
        varchar2 name UK
        varchar2 tag UK "unique with name"
        varchar2 entrypoint
        number size_bytes
        varchar2 description
        timestamp created_at
    }
    CONTAINERS {
        number container_id PK "seq_containers"
        varchar2 name UK "unique runtime name"
        number image_id FK "template"
        number owner_id FK "user"
        varchar2 status "CREATED..FAILED"
        number pid "OS pid of init"
        varchar2 hostname "UTS namespace"
        number restart_count
        timestamp started_at
        timestamp stopped_at
        number exit_code "0-255"
    }
    PROCESSES {
        number process_id PK "seq_processes"
        number container_id FK "owner container"
        number parent_process_id FK "self - tree"
        number os_pid "Linux pid"
        varchar2 command
        varchar2 state "RUNNING..DEAD"
        char is_init "Y = tree root"
        timestamp start_time
        timestamp end_time
        number exit_code
    }
```

```

```mermaid
erDiagram
    NAMESPACES {
        number ns_id PK "seq_namespaces"
        number container_id FK
        varchar2 ns_type "PID|NET|MNT|IPC|UTS|USER|CGROUP|TIME"
        number ns_inode "/proc/pid/ns inode"
        timestamp created_at
    }
    RESOURCE_LIMITS {
        number limit_id PK "seq_resource_limits"
        number container_id FK, UK "1:1 with container"
        varchar2 cgroup_path "sys/fs/cgroup path"
        number memory_limit_bytes "memory.max"
        number memory_swap_bytes
        number cpu_shares "cpu.weight"
        number cpu_quota_us "cpu.max quota"
        number cpu_period_us "default 100000"
        number pids_max
        number nofile_limit "RLIMIT_NOFILE"
    }
    METRICS {
        number metric_id PK "seq_metrics"
        number container_id FK
        timestamp captured_at "indexed"
        number cpu_usage_pct "0-100"
        number memory_usage_bytes
        number rx_bytes "net rx"
        number tx_bytes "net tx"
        number pids_count
    }
    EVENTS {
        number event_id PK "seq_events"
        number container_id FK
        varchar2 event_type "CREATED..LIMIT_UPDATED"
        varchar2 old_status
        varchar2 new_status
        varchar2 actor "user|system"
        varchar2 message
        timestamp occurred_at
    }
    LOGS {
        number log_id PK "seq_logs"
        number process_id FK
        varchar2 stream "STDOUT|STDERR"
        varchar2 line_text "up to 4000 chars"
        timestamp logged_at
    }
```

## Cardinality summary

| Relationship | Cardinality | Notes |
|---|---|---|
| USERS → CONTAINERS | 1 : N | `ON DELETE CASCADE` removes a user's containers |
| IMAGES → CONTAINERS | 1 : N | **No cascade** — an image in use cannot be deleted (ORA-02292) |
| CONTAINERS → PROCESSES | 1 : N | cascade delete with container |
| PROCESSES → PROCESSES | 0..1 : N | self-FK builds the OS process tree (`CONNECT BY`) |
| CONTAINERS → RESOURCE_LIMITS | 1 : 0..1 | `UNIQUE(container_id)` enforces one active cap |
| CONTAINERS → NAMESPACES | 1 : N | `UNIQUE(container_id, ns_type)` — one namespace per type |
| CONTAINERS → METRICS | 1 : N | monitor loop appends samples |
| CONTAINERS → EVENTS | 1 : N | rows written automatically by triggers |
| PROCESSES → LOGS | 1 : N | stdout/stderr capture |

Render this in any Mermaid-aware viewer (VS Code extension, GitHub, or open
[er-diagram.html](er-diagram.html) offline).
