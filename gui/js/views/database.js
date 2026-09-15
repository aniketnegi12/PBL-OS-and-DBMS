/**
 * views/database.js — Database View: Schema, PL/SQL, Triggers, Concurrency
 * Uses Tab Strategy Pattern for multi-panel rendering.
 */
import { Store } from '../store.js';

const SCHEMA_SQL = `\
-- ================================================================
-- ContainerOS Oracle Database Schema
-- Person C: Schema & Core Operations
-- ================================================================

-- Auto-incrementing sequences (Oracle-style)
CREATE SEQUENCE seq_container_id START WITH 1001 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_limit_id     START WITH 5001 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_log_id       START WITH 9001 INCREMENT BY 1 NOCACHE;

-- ── 1. CONTAINERS Table ──────────────────────────────────────
CREATE TABLE CONTAINERS (
    container_id  NUMBER(10)    DEFAULT seq_container_id.NEXTVAL NOT NULL,
    name          VARCHAR2(64)  NOT NULL,
    image_command VARCHAR2(256) NOT NULL,
    status        VARCHAR2(16)  DEFAULT 'PENDING'           NOT NULL,
    pid           NUMBER(10)    DEFAULT 0,
    exit_code     NUMBER(5)     DEFAULT NULL,
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP   NOT NULL,
    updated_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP   NOT NULL,
    CONSTRAINT pk_containers      PRIMARY KEY (container_id),
    CONSTRAINT uk_container_name  UNIQUE (name),
    CONSTRAINT chk_container_status CHECK (
        status IN ('PENDING','RUNNING','STOPPED','EXITED','FAILED')
    )
);

CREATE INDEX idx_containers_status ON CONTAINERS(status);

-- ── 2. RESOURCE_LIMITS Table ─────────────────────────────────
CREATE TABLE RESOURCE_LIMITS (
    limit_id      NUMBER(10)   DEFAULT seq_limit_id.NEXTVAL NOT NULL,
    container_id  NUMBER(10)   NOT NULL,
    max_cpu_sec   NUMBER(5)    DEFAULT 0  NOT NULL,  -- 0 = Unlimited
    max_mem_mb    NUMBER(10)   DEFAULT 0  NOT NULL,  -- 0 = Unlimited
    CONSTRAINT pk_resource_limits    PRIMARY KEY (limit_id),
    CONSTRAINT fk_limits_container   FOREIGN KEY (container_id)
        REFERENCES CONTAINERS(container_id) ON DELETE CASCADE,
    CONSTRAINT uk_limit_container    UNIQUE (container_id)
);

-- ── 3. CONTAINER_LOGS Table (Audit Trail) ────────────────────
CREATE TABLE CONTAINER_LOGS (
    log_id        NUMBER(10)   DEFAULT seq_log_id.NEXTVAL   NOT NULL,
    container_id  NUMBER(10)   NOT NULL,
    old_status    VARCHAR2(16),
    new_status    VARCHAR2(16) NOT NULL,
    message       VARCHAR2(256),
    log_time      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP    NOT NULL,
    CONSTRAINT pk_container_logs   PRIMARY KEY (log_id),
    CONSTRAINT fk_logs_container   FOREIGN KEY (container_id)
        REFERENCES CONTAINERS(container_id) ON DELETE CASCADE
);

CREATE INDEX idx_logs_container_id ON CONTAINER_LOGS(container_id);

COMMIT;`;

const PROCEDURES_SQL = `\
-- ================================================================
-- ContainerOS PL/SQL Stored Procedures
-- Person D: Transactions, PL/SQL & Concurrency
-- ================================================================

CREATE OR REPLACE PROCEDURE create_container (
    p_name          IN  VARCHAR2,
    p_command       IN  VARCHAR2,
    p_max_cpu_sec   IN  NUMBER   DEFAULT 0,
    p_max_mem_mb    IN  NUMBER   DEFAULT 0,
    p_container_id  OUT NUMBER
) AS
    v_cnt NUMBER;
BEGIN
    -- ── Input Validation ─────────────────────────────────────
    IF p_name IS NULL OR TRIM(p_name) IS NULL THEN
        RAISE_APPLICATION_ERROR(-20001,
            'Container name cannot be null or empty.');
    END IF;

    IF p_command IS NULL OR TRIM(p_command) IS NULL THEN
        RAISE_APPLICATION_ERROR(-20002,
            'Command string cannot be null or empty.');
    END IF;

    -- ── Duplicate Name Check ──────────────────────────────────
    SELECT COUNT(*) INTO v_cnt
    FROM CONTAINERS WHERE name = p_name;

    IF v_cnt > 0 THEN
        RAISE_APPLICATION_ERROR(-20003,
            'Container "' || p_name || '" already exists.');
    END IF;

    -- ── Atomic Insert ─────────────────────────────────────────
    INSERT INTO CONTAINERS (name, image_command, status)
    VALUES (p_name, p_command, 'PENDING')
    RETURNING container_id INTO p_container_id;

    INSERT INTO RESOURCE_LIMITS (container_id, max_cpu_sec, max_mem_mb)
    VALUES (p_container_id, NVL(p_max_cpu_sec,0), NVL(p_max_mem_mb,0));

    -- ── Commit ────────────────────────────────────────────────
    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Created container ID: ' || p_container_id);

EXCEPTION
    WHEN OTHERS THEN
        -- ROLLBACK if anything fails (atomicity guarantee)
        ROLLBACK;
        DBMS_OUTPUT.PUT_LINE('ROLLBACK: ' || SQLERRM);
        RAISE;
END create_container;
/`;

const TRIGGERS_SQL = `\
-- ================================================================
-- ContainerOS PL/SQL Audit Trigger
-- Person D: Auto-log on container status change
-- ================================================================

CREATE OR REPLACE TRIGGER trg_container_status_log
AFTER UPDATE OF status ON CONTAINERS
FOR EACH ROW
WHEN (OLD.status IS NULL OR OLD.status <> NEW.status)
BEGIN
    -- Automatically fires whenever container status changes.
    -- Works for ALL clients: CLI, direct SQL, or third-party apps.
    INSERT INTO CONTAINER_LOGS (
        container_id,
        old_status,
        new_status,
        message,
        log_time
    ) VALUES (
        :NEW.container_id,
        :OLD.status,
        :NEW.status,
        'TRG: Status updated ' || :OLD.status || ' → ' || :NEW.status,
        CURRENT_TIMESTAMP
    );
END;
/

-- ── Demo: Trigger firing automatically ──────────────────────
-- Updating a container status will fire the trigger without
-- any explicit INSERT into CONTAINER_LOGS:
UPDATE CONTAINERS
SET    status = 'RUNNING', updated_at = CURRENT_TIMESTAMP
WHERE  container_id = 1001;
-- ↑ This automatically creates a CONTAINER_LOGS record via trigger`;

const CONCURRENCY_SQL_S1 = `-- ╔══════════════════════╗
-- ║   SESSION 1 (Holder) ║
-- ╚══════════════════════╝

-- Step 1: Lock the row exclusively
SELECT container_id, name, status, pid
FROM   CONTAINERS
WHERE  container_id = 1001
FOR UPDATE;
-- ↑ Session 1 holds the lock

-- Step 2: Simulate OS process stop delay
DBMS_LOCK.SLEEP(10);

-- Step 3: Update container to STOPPED
UPDATE CONTAINERS
SET    status = 'STOPPED',
       updated_at = CURRENT_TIMESTAMP
WHERE  container_id = 1001;

-- Step 4: Release lock
COMMIT; -- ← Session 2 unblocks here`;

const CONCURRENCY_SQL_S2 = `-- ╔═══════════════════════╗
-- ║  SESSION 2 (Blocked)  ║
-- ╚═══════════════════════╝

-- Step 1: Attempt to lock SAME row
-- ⚠ This BLOCKS until Session 1 commits!
SELECT container_id, name, status, pid
FROM   CONTAINERS
WHERE  container_id = 1001
FOR UPDATE;  -- ← BLOCKED here waiting...

-- ↓ After Session 1 commits, continues:

-- Step 2: Read updated state from Session 1
-- status is now 'STOPPED' (Session 1's write)

UPDATE CONTAINERS
SET    status = 'RUNNING',
       updated_at = CURRENT_TIMESTAMP
WHERE  container_id = 1001;

COMMIT;`;

/** @type {Record<string, Function>} Strategy Pattern: tab renderers */
const TAB_RENDERERS = {
  schema:      () => renderCodePanel('SQL', SCHEMA_SQL, 'sql'),
  procedures:  () => renderCodePanel('PL/SQL', PROCEDURES_SQL, 'sql'),
  triggers:    () => renderCodePanel('PL/SQL — Trigger', TRIGGERS_SQL, 'sql'),
  concurrency: () => renderConcurrencyDemo(),
};

export function initDatabase() {
  _bindTabs();
  TAB_RENDERERS.schema();
}

export function renderDatabase(state) {
  const tab = state?.dbActiveTab || Store.getInstance().getState().dbActiveTab;
  TAB_RENDERERS[tab]?.();
}

function _bindTabs() {
  document.querySelectorAll('.db-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.db-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const key = tab.dataset.dbtab;
      Store.getInstance().commit({ dbActiveTab: key }, 'database');
      TAB_RENDERERS[key]?.();
    });
  });
}

function renderCodePanel(lang, code, highlight) {
  const panel = document.getElementById('db-content-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="code-block">
      <div class="code-block__header">
        <span class="code-block__lang" aria-label="Language: ${lang}">${lang}</span>
        <button class="code-block__copy" id="copy-btn" aria-label="Copy code to clipboard">Copy</button>
      </div>
      <pre aria-label="${lang} code"><code>${hlSQL(code)}</code></pre>
    </div>
  `;
  document.getElementById('copy-btn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      document.getElementById('copy-btn').textContent = 'Copied!';
      setTimeout(() => { const b = document.getElementById('copy-btn'); if(b) b.textContent = 'Copy'; }, 2000);
    } catch {
      // fallback
    }
  });
}

function renderConcurrencyDemo() {
  const panel = document.getElementById('db-content-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div style="margin-bottom:var(--sp-6)">
      <h3 style="font-size:var(--text-xl);font-weight:700;letter-spacing:-0.02em;margin-bottom:var(--sp-2)">SELECT … FOR UPDATE: Live Concurrency Demo</h3>
      <p style="color:var(--color-text-sub);font-size:var(--text-base);max-width:680px;line-height:1.65">
        Two database sessions compete for the same container row. Session 1 acquires an exclusive lock via
        <code style="font-family:var(--font-mono);color:var(--color-accent);font-size:0.875em">SELECT … FOR UPDATE</code>.
        Session 2 is blocked until Session 1 commits, demonstrating Oracle's row-level locking preventing dirty reads & lost updates.
      </p>
    </div>
    <div class="demo-controls">
      <button class="btn btn--primary btn--sm" id="demo-run-btn">▶ Run Demo</button>
      <button class="btn btn--ghost btn--sm" id="demo-reset-btn">↺ Reset</button>
      <span id="demo-status-label" style="font-size:var(--text-xs);color:var(--color-text-muted);align-self:center;margin-left:var(--sp-2)">Ready to run</span>
    </div>
    <div class="concurrency-demo">
      <div class="session-panel">
        <div class="session-panel__header">
          <span class="session-panel__title" style="color:var(--color-accent)">Session 1 — Lock Holder</span>
          <span class="session-panel__indicator" id="s1-indicator"></span>
        </div>
        <pre class="code-block" style="border:none;border-radius:0"><code style="font-family:var(--font-mono);font-size:var(--text-xs);padding:var(--sp-4);display:block;color:hsl(0 0% 55%)">${hlSQL(CONCURRENCY_SQL_S1)}</code></pre>
        <div class="session-output" id="s1-output"></div>
      </div>
      <div class="session-panel">
        <div class="session-panel__header">
          <span class="session-panel__title" style="color:var(--color-yellow)">Session 2 — Waiting</span>
          <span class="session-panel__indicator" id="s2-indicator"></span>
        </div>
        <pre class="code-block" style="border:none;border-radius:0"><code style="font-family:var(--font-mono);font-size:var(--text-xs);padding:var(--sp-4);display:block;color:hsl(0 0% 55%)">${hlSQL(CONCURRENCY_SQL_S2)}</code></pre>
        <div class="session-output" id="s2-output"></div>
      </div>
    </div>
  `;

  document.getElementById('demo-run-btn')?.addEventListener('click', _runConcurrencyDemo);
  document.getElementById('demo-reset-btn')?.addEventListener('click', () => {
    ['s1-output','s2-output'].forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = ''; });
    ['s1-indicator','s2-indicator'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.className = 'session-panel__indicator'; }
    });
    const lbl = document.getElementById('demo-status-label');
    if (lbl) lbl.textContent = 'Ready to run';
  });
}

async function _runConcurrencyDemo() {
  const s1 = document.getElementById('s1-output');
  const s2 = document.getElementById('s2-output');
  const s1i = document.getElementById('s1-indicator');
  const s2i = document.getElementById('s2-indicator');
  const lbl = document.getElementById('demo-status-label');
  if (!s1 || !s2) return;

  s1.innerHTML = ''; s2.innerHTML = '';

  const log = (el, msg, cls) => {
    const line = document.createElement('div');
    line.className = `session-line--${cls}`;
    line.style.cssText = 'font-family:var(--font-mono);font-size:var(--text-xs);line-height:2;padding:0 var(--sp-4)';
    line.textContent = msg;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  };

  const delay = ms => new Promise(r => setTimeout(r, ms));

  const run = document.getElementById('demo-run-btn');
  if (run) run.disabled = true;

  // Session 1 starts
  s1i.className = 'session-panel__indicator session-panel__indicator--active';
  lbl.textContent = 'Session 1 acquiring lock…';
  log(s1, '> BEGIN TRANSACTION', 'active');
  await delay(600);
  log(s1, '> SELECT … FROM CONTAINERS WHERE container_id = 1001 FOR UPDATE;', 'lock');
  await delay(800);
  log(s1, '✔ ROW LOCK ACQUIRED — container_id = 1001', 'active');
  await delay(300);

  // Session 2 starts, blocks
  s2i.className = 'session-panel__indicator session-panel__indicator--blocked';
  lbl.textContent = 'Session 2 blocking on lock…';
  log(s2, '> BEGIN TRANSACTION', 'active');
  await delay(400);
  log(s2, '> SELECT … FROM CONTAINERS WHERE container_id = 1001 FOR UPDATE;', 'lock');
  await delay(600);
  log(s2, '⏸ BLOCKED — waiting for Session 1 to release lock…', 'blocked');

  // Session 1 does work
  await delay(1200);
  lbl.textContent = 'Session 1 updating status…';
  log(s1, '> DBMS_LOCK.SLEEP(2); -- simulating process stop', 'active');
  await delay(800);
  log(s1, "> UPDATE CONTAINERS SET status='STOPPED' WHERE container_id=1001;", 'active');
  await delay(600);
  log(s1, '> COMMIT; -- ← triggers Session 2 unblock', 'commit');
  s1i.className = 'session-panel__indicator session-panel__indicator--active';
  await delay(200);
  s1i.className = 'session-panel__indicator';

  // Session 2 unblocks
  await delay(300);
  s2i.className = 'session-panel__indicator session-panel__indicator--active';
  lbl.textContent = 'Session 2 proceeding after Session 1 commit';
  log(s2, '✔ LOCK RELEASED by Session 1', 'commit');
  await delay(400);
  log(s2, '> -- reads status = STOPPED (Session 1\'s write)', 'active');
  await delay(600);
  log(s2, "> UPDATE CONTAINERS SET status='RUNNING' WHERE container_id=1001;", 'active');
  await delay(500);
  log(s2, '> COMMIT;', 'commit');
  s2i.className = 'session-panel__indicator';
  lbl.textContent = 'Demo complete — no lost updates, no dirty reads.';

  if (run) run.disabled = false;
}

/** Basic SQL syntax highlighting */
function hlSQL(code) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return esc(code)
    .replace(/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|SEQUENCE|FROM|WHERE|AND|OR|NOT|NULL|ON|INTO|VALUES|SET|DEFAULT|COMMIT|ROLLBACK|BEGIN|END|EXCEPTION|WHEN|OTHERS|RAISE|FOR|EACH|ROW|AFTER|TRIGGER|REPLACE|PROCEDURE|UNIQUE|PRIMARY KEY|FOREIGN KEY|REFERENCES|CONSTRAINT|ORDER BY|GROUP BY|HAVING|JOIN|LEFT|RIGHT|INNER|IN|IS|AS|RETURNING|NOCACHE)\b/g,
      '<span class="sql-keyword">$1</span>')
    .replace(/\b(NUMBER|VARCHAR2|TIMESTAMP|OUT|IN)\b/g,
      '<span class="sql-type">$1</span>')
    .replace(/'([^']*)'/g,
      `<span class="sql-string">'$1'</span>`)
    .replace(/--(.*)/g,
      '<span class="sql-comment">--$1</span>')
    .replace(/\b(NVL|TRIM|COUNT|TO_DATE|TO_CHAR|CURRENT_TIMESTAMP|DBMS_OUTPUT\.PUT_LINE|DBMS_LOCK\.SLEEP|RAISE_APPLICATION_ERROR)\b/g,
      '<span class="sql-fn">$1</span>')
    .replace(/\b(\d+)\b/g, '<span class="sql-num">$1</span>');
}
