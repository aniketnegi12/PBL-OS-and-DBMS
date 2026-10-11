-- ============================================================================
--  ContainerLite - Oracle 11g+/XE schema
--  PBL Sem-5: "A Lightweight Container Runtime with OS-Level Process
--              Management and an Oracle-Backed State Store"
--
--  Run order:  @db/schema_full.sql -> @db/seed_full.sql -> @db/queries_full.sql
--  Teardown:   @db/drop_full.sql
--  Entities:   users, images, containers, processes, namespaces,
--              resource_limits, metrics, events, logs
-- ============================================================================

PROMPT == Creating sequences ==

CREATE SEQUENCE seq_users            START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_images           START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_containers       START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_processes        START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_namespaces       START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_resource_limits  START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_metrics          START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_events           START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_logs             START WITH 1 INCREMENT BY 1;

PROMPT == Creating tables ==

-- ---------------------------------------------------------------- users ----
CREATE TABLE users (
  user_id     NUMBER(5)       NOT NULL,
  username    VARCHAR2(30)    NOT NULL,
  full_name   VARCHAR2(80)    NOT NULL,
  email       VARCHAR2(120),
  role        VARCHAR2(20)    DEFAULT 'student' NOT NULL,
  created_at  TIMESTAMP(3)    DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_users        PRIMARY KEY (user_id),
  CONSTRAINT uq_users_username UNIQUE (username),
  CONSTRAINT ck_users_role   CHECK (role IN ('admin','student','viewer'))
);
-- --------------------------------------------------------------- images ----
CREATE TABLE images (
  image_id     NUMBER(7)     NOT NULL,
  name         VARCHAR2(80)  NOT NULL,
  tag          VARCHAR2(30)  DEFAULT 'latest' NOT NULL,
  entrypoint   VARCHAR2(255),
  size_bytes   NUMBER(12),
  description  VARCHAR2(400),
  created_at   TIMESTAMP(3)  DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_images         PRIMARY KEY (image_id),
  CONSTRAINT uq_images_name_tag UNIQUE (name, tag),
  CONSTRAINT ck_images_size    CHECK (size_bytes IS NULL OR size_bytes >= 0)
);

-- ----------------------------------------------------------- containers ----
CREATE TABLE containers (
  container_id   NUMBER(7)    NOT NULL,
  name           VARCHAR2(64) NOT NULL,
  image_id       NUMBER(7)    NOT NULL,
  owner_id       NUMBER(5)    NOT NULL,
  status         VARCHAR2(16) DEFAULT 'CREATED' NOT NULL,
  pid            NUMBER(10),            -- OS pid of the init process
  hostname       VARCHAR2(64),          -- UTS namespace hostname
  restart_count  NUMBER(5)    DEFAULT 0 NOT NULL,
  created_at     TIMESTAMP(3) DEFAULT SYSTIMESTAMP NOT NULL,
  started_at     TIMESTAMP(3),
  stopped_at     TIMESTAMP(3),
  exit_code      NUMBER(5),
  CONSTRAINT pk_containers      PRIMARY KEY (container_id),
  CONSTRAINT uq_containers_name UNIQUE (name),
  CONSTRAINT fk_cont_image      FOREIGN KEY (image_id)
               REFERENCES images(image_id),          -- no cascade: image in use
  CONSTRAINT fk_cont_owner      FOREIGN KEY (owner_id)
               REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT ck_cont_status     CHECK (status IN
               ('CREATED','RUNNING','PAUSED','STOPPED','EXITED','FAILED')),
  CONSTRAINT ck_cont_pid        CHECK (pid IS NULL OR pid > 1),
  CONSTRAINT ck_cont_exit       CHECK (exit_code IS NULL
                                       OR exit_code BETWEEN 0 AND 255),
  CONSTRAINT ck_cont_host       CHECK (hostname IS NULL OR LENGTH(hostname) <= 64)
);
-- ------------------------------------------------------------- processes ----
CREATE TABLE processes (
  process_id        NUMBER(10)    NOT NULL,
  container_id      NUMBER(7)     NOT NULL,
  parent_process_id NUMBER(10),             -- NULL = init process (tree root)
  os_pid            NUMBER(10)    NOT NULL,
  command           VARCHAR2(255) NOT NULL,
  state             VARCHAR2(12)  DEFAULT 'RUNNING' NOT NULL,
  is_init           CHAR(1)       DEFAULT 'N' NOT NULL,
  start_time        TIMESTAMP(3)  DEFAULT SYSTIMESTAMP NOT NULL,
  end_time          TIMESTAMP(3),
  exit_code         NUMBER(5),
  CONSTRAINT pk_processes        PRIMARY KEY (process_id),
  CONSTRAINT uq_proc_container_pid UNIQUE (container_id, os_pid),
  CONSTRAINT fk_proc_container   FOREIGN KEY (container_id)
               REFERENCES containers(container_id) ON DELETE CASCADE,
  CONSTRAINT fk_proc_parent      FOREIGN KEY (parent_process_id)
               REFERENCES processes(process_id) ON DELETE CASCADE,
  CONSTRAINT ck_proc_state       CHECK (state IN
               ('RUNNING','SLEEPING','STOPPED','ZOMBIE','DEAD')),
  CONSTRAINT ck_proc_isinit      CHECK (is_init IN ('Y','N')),
  CONSTRAINT ck_proc_exit        CHECK (exit_code IS NULL
                                        OR exit_code BETWEEN 0 AND 255)
);

-- ------------------------------------------------------------ namespaces ----
CREATE TABLE namespaces (
  ns_id         NUMBER(7)   NOT NULL,
  container_id  NUMBER(7)   NOT NULL,
  ns_type       VARCHAR2(8) NOT NULL,   -- PID/NET/MNT/IPC/UTS/USER/CGROUP/TIME
  ns_inode      NUMBER(12)  NOT NULL,   -- /proc/<pid>/ns/<type> inode
  created_at    TIMESTAMP(3) DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_namespaces        PRIMARY KEY (ns_id),
  CONSTRAINT uq_ns_container_type UNIQUE (container_id, ns_type),
  CONSTRAINT fk_ns_container      FOREIGN KEY (container_id)
               REFERENCES containers(container_id) ON DELETE CASCADE,
  CONSTRAINT ck_ns_type           CHECK (ns_type IN
               ('PID','NET','MNT','IPC','UTS','USER','CGROUP','TIME'))
);
-- -------------------------------------------------------- resource_limits ----
-- One ACTIVE limit row per container (1:1). Limits mirror cgroup v2 / setrlimit.
CREATE TABLE resource_limits (
  limit_id           NUMBER(7)   NOT NULL,
  container_id       NUMBER(7)   NOT NULL,
  cgroup_path        VARCHAR2(255),        -- /sys/fs/cgroup/clite/<name>
  memory_limit_bytes NUMBER(12),           -- memory.max
  memory_swap_bytes  NUMBER(12),           -- memory.swap.max
  cpu_shares         NUMBER(5),            -- cpu.weight
  cpu_quota_us       NUMBER(10),           -- cpu.max quota
  cpu_period_us      NUMBER(10)  DEFAULT 100000,
  pids_max           NUMBER(6),            -- pids.max
  nofile_limit       NUMBER(8),            -- RLIMIT_NOFILE
  updated_at         TIMESTAMP(3) DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_resource_limits  PRIMARY KEY (limit_id),
  CONSTRAINT uq_rlim_container   UNIQUE (container_id),
  CONSTRAINT fk_rlim_container   FOREIGN KEY (container_id)
               REFERENCES containers(container_id) ON DELETE CASCADE,
  CONSTRAINT ck_rlim_mem     CHECK (memory_limit_bytes IS NULL
                                    OR memory_limit_bytes >= 1048576),
  CONSTRAINT ck_rlim_swap    CHECK (memory_swap_bytes IS NULL
                                    OR memory_limit_bytes IS NULL
                                    OR memory_swap_bytes >= memory_limit_bytes),
  CONSTRAINT ck_rlim_shares  CHECK (cpu_shares IS NULL
                                    OR cpu_shares BETWEEN 2 AND 262144),
  CONSTRAINT ck_rlim_period  CHECK (cpu_period_us IS NULL OR cpu_period_us > 0),
  CONSTRAINT ck_rlim_pids    CHECK (pids_max IS NULL OR pids_max >= 1)
);

-- --------------------------------------------------------------- metrics ----
-- Periodic samples collected by the monitor loop (cgroup counters).
CREATE TABLE metrics (
  metric_id          NUMBER(12)  NOT NULL,
  container_id       NUMBER(7)   NOT NULL,
  captured_at        TIMESTAMP(3) DEFAULT SYSTIMESTAMP NOT NULL,
  cpu_usage_pct      NUMBER(5,2),
  memory_usage_bytes NUMBER(12),
  rx_bytes           NUMBER(14),
  tx_bytes           NUMBER(14),
  pids_count         NUMBER(6),
  CONSTRAINT pk_metrics         PRIMARY KEY (metric_id),
  CONSTRAINT fk_metric_container FOREIGN KEY (container_id)
               REFERENCES containers(container_id) ON DELETE CASCADE,
  CONSTRAINT ck_metric_cpu   CHECK (cpu_usage_pct IS NULL
                                    OR cpu_usage_pct BETWEEN 0 AND 100),
  CONSTRAINT ck_metric_pids  CHECK (pids_count IS NULL OR pids_count >= 0)
);
-- ---------------------------------------------------------------- events ----
-- Lifecycle audit trail. Populated automatically by container triggers.
CREATE TABLE events (
  event_id     NUMBER(12)  NOT NULL,
  container_id NUMBER(7)   NOT NULL,
  event_type   VARCHAR2(20) NOT NULL,
  old_status   VARCHAR2(16),
  new_status   VARCHAR2(16),
  actor        VARCHAR2(10) DEFAULT 'system' NOT NULL,
  message      VARCHAR2(400),
  occurred_at  TIMESTAMP(3) DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_events        PRIMARY KEY (event_id),
  CONSTRAINT fk_event_container FOREIGN KEY (container_id)
               REFERENCES containers(container_id) ON DELETE CASCADE,
  CONSTRAINT ck_event_actor CHECK (actor IN ('user','system')),
  CONSTRAINT ck_event_type  CHECK (event_type IN
               ('CREATED','STARTED','RESTARTED','STOPPED','EXITED','FAILED',
                'PAUSED','RESUMED','REMOVED','LIMIT_UPDATED','KILLED','OOM'))
);

-- ------------------------------------------------------------------ logs ----
-- stdout/stderr lines captured from container processes.
CREATE TABLE logs (
  log_id      NUMBER(14)   NOT NULL,
  process_id  NUMBER(10)   NOT NULL,
  stream      VARCHAR2(6)  DEFAULT 'STDOUT' NOT NULL,
  line_text   VARCHAR2(4000) NOT NULL,
  logged_at   TIMESTAMP(3) DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_logs         PRIMARY KEY (log_id),
  CONSTRAINT fk_log_process  FOREIGN KEY (process_id)
               REFERENCES processes(process_id) ON DELETE CASCADE,
  CONSTRAINT ck_log_stream   CHECK (stream IN ('STDOUT','STDERR'))
);
-- END-ANCHOR: events

PROMPT == Creating indexes ==
CREATE INDEX ix_containers_status  ON containers(status, created_at);
CREATE INDEX ix_containers_owner   ON containers(owner_id);
CREATE INDEX ix_containers_image   ON containers(image_id);
CREATE INDEX ix_proc_container     ON processes(container_id);
CREATE INDEX ix_proc_parent        ON processes(parent_process_id);
CREATE INDEX ix_proc_ospid         ON processes(os_pid);
CREATE INDEX ix_ns_container       ON namespaces(container_id);
CREATE INDEX ix_metrics_cont_time  ON metrics(container_id, captured_at);
CREATE INDEX ix_events_cont_time   ON events(container_id, occurred_at);
CREATE INDEX ix_events_type        ON events(event_type);
CREATE INDEX ix_logs_proc_time     ON logs(process_id, logged_at);

-- END-ANCHOR: indexes

PROMPT == Creating triggers ==

-- Validate + stamp container lifecycle transitions ---------------------------
CREATE OR REPLACE TRIGGER trg_containers_biu
BEFORE INSERT OR UPDATE ON containers
FOR EACH ROW
BEGIN
  IF INSERTING THEN
    IF :NEW.status NOT IN ('CREATED','RUNNING') THEN
      RAISE_APPLICATION_ERROR(-20010,
        'A container must be created as CREATED or RUNNING, not '||:NEW.status);
    END IF;
  END IF;

  IF UPDATING THEN
    IF :NEW.status = 'CREATED' AND :OLD.status <> 'CREATED' THEN
      RAISE_APPLICATION_ERROR(-20011,
        'A container can never move back to CREATED');
    END IF;

    IF :NEW.status = 'RUNNING' THEN
      IF :OLD.status NOT IN ('CREATED','PAUSED','STOPPED','EXITED','FAILED') THEN
        RAISE_APPLICATION_ERROR(-20012,
          'Cannot start a container from status '||:OLD.status);
      END IF;
      IF :OLD.status IN ('STOPPED','EXITED','FAILED') THEN
        :NEW.started_at := SYSTIMESTAMP;      -- fresh run on restart
        :NEW.restart_count := :OLD.restart_count + 1;
      ELSIF :OLD.status = 'CREATED' AND :NEW.started_at IS NULL THEN
        :NEW.started_at := SYSTIMESTAMP;      -- first start
      END IF;
      :NEW.exit_code  := NULL;
      :NEW.stopped_at := NULL;
    END IF;

    IF :NEW.status IN ('STOPPED','EXITED','FAILED') THEN
      IF :OLD.status NOT IN ('RUNNING','PAUSED') THEN
        RAISE_APPLICATION_ERROR(-20013,
          'Cannot stop a container from status '||:OLD.status);
      END IF;
      :NEW.stopped_at := SYSTIMESTAMP;
      :NEW.pid := NULL;
      IF :NEW.exit_code IS NULL THEN
        :NEW.exit_code := 0;
      END IF;
    END IF;
  END IF;
END;
/

-- Audit every status change into EVENTS -------------------------------------
CREATE OR REPLACE TRIGGER trg_containers_au
AFTER UPDATE OF status ON containers
FOR EACH ROW
DECLARE
  v_type events.event_type%TYPE;
BEGIN
  IF :NEW.status = :OLD.status THEN RETURN; END IF;
  v_type := CASE
    WHEN :NEW.status = 'RUNNING' AND :OLD.status = 'PAUSED'          THEN 'RESUMED'
    WHEN :NEW.status = 'RUNNING'
         AND :OLD.status IN ('STOPPED','EXITED','FAILED')            THEN 'RESTARTED'
    WHEN :NEW.status = 'RUNNING'                                     THEN 'STARTED'
    ELSE :NEW.status
  END;
  INSERT INTO events (container_id, event_type, old_status, new_status,
                      actor, message)
  VALUES (:NEW.container_id, v_type, :OLD.status, :NEW.status, 'system',
          'Status changed from '||:OLD.status||' to '||:NEW.status);
END;
/

-- Audit container creation --------------------------------------------------
CREATE OR REPLACE TRIGGER trg_containers_ai
AFTER INSERT ON containers
FOR EACH ROW
BEGIN
  INSERT INTO events (container_id, event_type, old_status, new_status,
                      actor, message)
  VALUES (:NEW.container_id, 'CREATED', NULL, :NEW.status, 'system',
          'Container registered with initial status '||:NEW.status);
END;
/

-- END-ANCHOR: triggers

-- Sequence-driven primary keys (Oracle 11g-compatible pattern) ---------------
CREATE OR REPLACE TRIGGER trg_users_bir
BEFORE INSERT ON users FOR EACH ROW
WHEN (NEW.user_id IS NULL)
BEGIN SELECT seq_users.NEXTVAL INTO :NEW.user_id FROM dual; END;
/

CREATE OR REPLACE TRIGGER trg_images_bir
BEFORE INSERT ON images FOR EACH ROW
WHEN (NEW.image_id IS NULL)
BEGIN SELECT seq_images.NEXTVAL INTO :NEW.image_id FROM dual; END;
/

CREATE OR REPLACE TRIGGER trg_containers_bir
BEFORE INSERT ON containers FOR EACH ROW
WHEN (NEW.container_id IS NULL)
BEGIN SELECT seq_containers.NEXTVAL INTO :NEW.container_id FROM dual; END;
/

CREATE OR REPLACE TRIGGER trg_processes_bir
BEFORE INSERT ON processes FOR EACH ROW
WHEN (NEW.process_id IS NULL)
BEGIN SELECT seq_processes.NEXTVAL INTO :NEW.process_id FROM dual; END;
/

CREATE OR REPLACE TRIGGER trg_namespaces_bir
BEFORE INSERT ON namespaces FOR EACH ROW
WHEN (NEW.ns_id IS NULL)
BEGIN SELECT seq_namespaces.NEXTVAL INTO :NEW.ns_id FROM dual; END;
/

CREATE OR REPLACE TRIGGER trg_rlimits_bir
BEFORE INSERT ON resource_limits FOR EACH ROW
WHEN (NEW.limit_id IS NULL)
BEGIN SELECT seq_resource_limits.NEXTVAL INTO :NEW.limit_id FROM dual; END;
/

CREATE OR REPLACE TRIGGER trg_metrics_bir
BEFORE INSERT ON metrics FOR EACH ROW
WHEN (NEW.metric_id IS NULL)
BEGIN SELECT seq_metrics.NEXTVAL INTO :NEW.metric_id FROM dual; END;
/

CREATE OR REPLACE TRIGGER trg_events_bir
BEFORE INSERT ON events FOR EACH ROW
WHEN (NEW.event_id IS NULL)
BEGIN SELECT seq_events.NEXTVAL INTO :NEW.event_id FROM dual; END;
/

CREATE OR REPLACE TRIGGER trg_logs_bir
BEFORE INSERT ON logs FOR EACH ROW
WHEN (NEW.log_id IS NULL)
BEGIN SELECT seq_logs.NEXTVAL INTO :NEW.log_id FROM dual; END;
/

-- END-ANCHOR: pk-triggers

PROMPT == Creating views ==

-- One row per container: owner, image, limits, live uptime -------------------
CREATE OR REPLACE VIEW v_container_overview AS
SELECT c.container_id, c.name AS container_name, c.status, c.pid, c.hostname,
       u.username AS owner, i.name AS image_name, i.tag AS image_tag,
       i.name || ':' || i.tag AS image_ref,
       c.created_at, c.started_at, c.stopped_at, c.exit_code, c.restart_count,
       l.memory_limit_bytes, l.cpu_shares, l.pids_max,
       fn_uptime_seconds(c.container_id) AS uptime_seconds
FROM containers c
JOIN users u  ON u.user_id  = c.owner_id
JOIN images i ON i.image_id = c.image_id
LEFT JOIN resource_limits l ON l.container_id = c.container_id;

-- Most recent metric sample per container (analytic top-1) --------------------
CREATE OR REPLACE VIEW v_latest_metrics AS
SELECT container_id, captured_at, cpu_usage_pct, memory_usage_bytes,
       rx_bytes, tx_bytes, pids_count
FROM (SELECT m.*,
             ROW_NUMBER() OVER (PARTITION BY container_id
                                ORDER BY captured_at DESC) AS rn
      FROM metrics m)
WHERE rn = 1;

-- OS process tree per container (Oracle CONNECT BY) ---------------------------
CREATE OR REPLACE VIEW v_process_tree AS
SELECT container_id, LEVEL AS tree_depth,
       process_id, parent_process_id, os_pid, command, state, is_init
FROM processes
START WITH parent_process_id IS NULL
CONNECT BY PRIOR process_id = parent_process_id;

-- Flattened event timeline for the report/demo --------------------------------
CREATE OR REPLACE VIEW v_event_timeline AS
SELECT e.occurred_at, c.name AS container_name, e.event_type,
       e.old_status, e.new_status, e.actor, e.message
FROM events e
JOIN containers c ON c.container_id = e.container_id;
-- END-ANCHOR: views

PROMPT == Creating procedure & function ==

-- Graceful stop: updates container + kills its process rows atomically -------
CREATE OR REPLACE PROCEDURE prc_stop_container (
  p_container_id IN containers.container_id%TYPE,
  p_exit_code    IN NUMBER DEFAULT 0,
  p_actor        IN VARCHAR2 DEFAULT 'user'
) IS
  v_status containers.status%TYPE;
BEGIN
  SELECT status INTO v_status
  FROM containers
  WHERE container_id = p_container_id
  FOR UPDATE;

  IF v_status NOT IN ('RUNNING','PAUSED') THEN
    RAISE_APPLICATION_ERROR(-20001,
      'Container '||p_container_id||' is not running (status='||v_status||')');
  END IF;

  -- container trigger stamps stopped_at and writes the STOPPED event
  UPDATE containers
  SET status = 'STOPPED', exit_code = p_exit_code
  WHERE container_id = p_container_id;

  UPDATE processes
  SET state = 'DEAD', end_time = SYSTIMESTAMP, exit_code = p_exit_code
  WHERE container_id = p_container_id
    AND state IN ('RUNNING','SLEEPING','STOPPED');

  -- no COMMIT here: the caller (CLI transaction) decides
END;
/

-- Uptime of the current/last run in seconds -----------------------------------
CREATE OR REPLACE FUNCTION fn_uptime_seconds (
  p_container_id IN containers.container_id%TYPE
) RETURN NUMBER IS
  v_started containers.started_at%TYPE;
  v_status  containers.status%TYPE;
  v_stopped containers.stopped_at%TYPE;
BEGIN
  SELECT started_at, status, stopped_at
  INTO v_started, v_status, v_stopped
  FROM containers
  WHERE container_id = p_container_id;

  IF v_started IS NULL THEN
    RETURN NULL;
  ELSIF v_status IN ('RUNNING','PAUSED') THEN
    RETURN ROUND((SYSTIMESTAMP - v_started) * 86400);
  ELSIF v_stopped IS NOT NULL THEN
    RETURN ROUND((v_stopped - v_started) * 86400);
  END IF;
  RETURN NULL;
END;
/

-- END-ANCHOR: procfn

PROMPT == Adding table comments ==
COMMENT ON TABLE users          IS 'Runtime operators (CLI accounts) who own containers';
COMMENT ON TABLE images         IS 'Immutable app templates (name:tag) containers are launched from';
COMMENT ON TABLE containers     IS 'Registered container instances and their OS lifecycle state';
COMMENT ON TABLE processes      IS 'OS-level processes inside each container (self-FK = process tree)';
COMMENT ON TABLE namespaces     IS 'Linux kernel namespaces backing each container (PID/NET/MNT/IPC/UTS/USER)';
COMMENT ON TABLE resource_limits IS 'Active cgroup v2 / setrlimit caps; exactly one per container';
COMMENT ON TABLE metrics        IS 'Monitor-loop samples: CPU, memory, network, pids per container';
COMMENT ON TABLE events         IS 'Audit trail of lifecycle transitions (written by triggers)';
COMMENT ON TABLE logs           IS 'Captured stdout/stderr lines per process';
COMMENT ON COLUMN containers.pid IS 'OS pid of the init process while RUNNING; cleared on stop';
COMMENT ON COLUMN processes.parent_process_id IS 'FK to parent process; NULL marks the container init (tree root)';

PROMPT == ContainerLite schema ready ==

