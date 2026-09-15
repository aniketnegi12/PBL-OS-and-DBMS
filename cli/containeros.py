#!/usr/bin/env python3
"""
ContainerOS Python Integration CLI (cli/containeros.py)
Integrates POSIX C runtime engine with Oracle RDBMS persistence layer.
"""

import sys
import os
import json
import sqlite3
import subprocess
import argparse
from datetime import datetime

# Path to compiled C runtime binary
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
C_RUNTIME_BIN = os.path.join(PROJECT_ROOT, "containeros-runtime")
DEFAULT_DB_FILE = os.path.join(PROJECT_ROOT, "containeros_local.db")

# Optional Oracle Database import
ORACLE_AVAILABLE = False
try:
    import oracledb
    ORACLE_AVAILABLE = True
except ImportError:
    try:
        import cx_Oracle as oracledb
        ORACLE_AVAILABLE = True
    except ImportError:
        ORACLE_AVAILABLE = False


class DatabaseBackend:
    """Handles persistence layer with dual support for Oracle RDBMS and SQLite fallback."""

    def __init__(self, oracle_dsn=None, oracle_user=None, oracle_password=None):
        self.use_oracle = False
        self.conn = None

        if oracle_dsn and ORACLE_AVAILABLE:
            try:
                self.conn = oracledb.connect(user=oracle_user, password=oracle_password, dsn=oracle_dsn)
                self.use_oracle = True
                print("[DB] Connected to Oracle RDBMS.")
            except Exception as e:
                print(f"[DB Warning] Could not connect to Oracle DB ({e}). Falling back to local SQLite engine.")

        if not self.use_oracle:
            self.conn = sqlite3.connect(DEFAULT_DB_FILE)
            self._init_sqlite_schema()

    def _init_sqlite_schema(self):
        cursor = self.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS CONTAINERS (
                container_id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                image_command TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING',
                pid INTEGER DEFAULT 0,
                exit_code INTEGER DEFAULT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS RESOURCE_LIMITS (
                limit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                container_id INTEGER UNIQUE NOT NULL,
                max_cpu_sec INTEGER DEFAULT 0,
                max_mem_mb INTEGER DEFAULT 0,
                FOREIGN KEY (container_id) REFERENCES CONTAINERS(container_id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS CONTAINER_LOGS (
                log_id INTEGER PRIMARY KEY AUTOINCREMENT,
                container_id INTEGER NOT NULL,
                old_status TEXT,
                new_status TEXT NOT NULL,
                message TEXT,
                log_time TEXT NOT NULL,
                FOREIGN KEY (container_id) REFERENCES CONTAINERS(container_id) ON DELETE CASCADE
            )
        """)
        self.conn.commit()

    def create_container(self, name, command, max_cpu=0, max_mem=0):
        now = datetime.now().isoformat()
        cursor = self.conn.cursor()

        if self.use_oracle:
            cid_var = cursor.var(oracledb.NUMBER)
            cursor.callproc("create_container", [name, command, max_cpu, max_mem, cid_var])
            container_id = int(cid_var.getvalue())
        else:
            try:
                cursor.execute(
                    "INSERT INTO CONTAINERS (name, image_command, status, created_at, updated_at) VALUES (?, ?, 'PENDING', ?, ?)",
                    (name, command, now, now)
                )
                container_id = cursor.lastrowid
                cursor.execute(
                    "INSERT INTO RESOURCE_LIMITS (container_id, max_cpu_sec, max_mem_mb) VALUES (?, ?, ?)",
                    (container_id, max_cpu, max_mem)
                )
                self.log_status_change(container_id, None, 'PENDING', 'Created new container record')
                self.conn.commit()
            except sqlite3.IntegrityError:
                raise ValueError(f"Container with name '{name}' already exists.")

        return container_id

    def log_status_change(self, container_id, old_status, new_status, message="State updated"):
        if self.use_oracle:
            # Oracle trigger automatically handles state update logs
            return
        now = datetime.now().isoformat()
        cursor = self.conn.cursor()
        cursor.execute(
            "INSERT INTO CONTAINER_LOGS (container_id, old_status, new_status, message, log_time) VALUES (?, ?, ?, ?, ?)",
            (container_id, old_status, new_status, message, now)
        )
        self.conn.commit()

    def get_container(self, container_id):
        cursor = self.conn.cursor()
        if self.use_oracle:
            cursor.execute("""
                SELECT c.container_id, c.name, c.image_command, c.status, c.pid, 
                       r.max_cpu_sec, r.max_mem_mb
                FROM CONTAINERS c
                LEFT JOIN RESOURCE_LIMITS r ON c.container_id = r.container_id
                WHERE c.container_id = :1
            """, [container_id])
        else:
            cursor.execute("""
                SELECT c.container_id, c.name, c.image_command, c.status, c.pid, 
                       r.max_cpu_sec, r.max_mem_mb
                FROM CONTAINERS c
                LEFT JOIN RESOURCE_LIMITS r ON c.container_id = r.container_id
                WHERE c.container_id = ?
            """, (container_id,))

        row = cursor.fetchone()
        if not row:
            return None

        return {
            "id": row[0],
            "name": row[1],
            "command": row[2],
            "status": row[3],
            "pid": row[4],
            "max_cpu": row[5] or 0,
            "max_mem": row[6] or 0
        }

    def update_status(self, container_id, new_status, pid=None, exit_code=None):
        container = self.get_container(container_id)
        if not container:
            return
        old_status = container["status"]
        now = datetime.now().isoformat()

        cursor = self.conn.cursor()
        if self.use_oracle:
            query = "UPDATE CONTAINERS SET status = :1, updated_at = CURRENT_TIMESTAMP"
            params = [new_status]
            if pid is not None:
                query += ", pid = :2"
                params.append(pid)
            if exit_code is not None:
                query += ", exit_code = :3"
                params.append(exit_code)
            query += " WHERE container_id = :" + str(len(params) + 1)
            params.append(container_id)
            cursor.execute(query, params)
            self.conn.commit()
        else:
            query = "UPDATE CONTAINERS SET status = ?, updated_at = ?"
            params = [new_status, now]
            if pid is not None:
                query += ", pid = ?"
                params.append(pid)
            if exit_code is not None:
                query += ", exit_code = ?"
                params.append(exit_code)
            query += " WHERE container_id = ?"
            params.append(container_id)
            cursor.execute(query, params)
            self.log_status_change(container_id, old_status, new_status)
            self.conn.commit()

    def list_containers(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT container_id, name, image_command, status, pid FROM CONTAINERS ORDER BY container_id ASC")
        rows = cursor.fetchall()
        return [
            {"id": r[0], "name": r[1], "command": r[2], "status": r[3], "pid": r[4]}
            for r in rows
        ]

    def get_logs(self, container_id):
        cursor = self.conn.cursor()
        if self.use_oracle:
            cursor.execute(
                "SELECT log_id, old_status, new_status, message, log_time FROM CONTAINER_LOGS WHERE container_id = :1 ORDER BY log_id ASC",
                [container_id]
            )
        else:
            cursor.execute(
                "SELECT log_id, old_status, new_status, message, log_time FROM CONTAINER_LOGS WHERE container_id = ? ORDER BY log_id ASC",
                (container_id,)
            )
        rows = cursor.fetchall()
        return [
            {"log_id": r[0], "old_status": r[1], "new_status": r[2], "message": r[3], "time": r[4]}
            for r in rows
        ]


def run_c_runtime(args):
    """Executes the compiled C runtime binary and returns parsed JSON output."""
    if not os.path.exists(C_RUNTIME_BIN):
        print(f"[Error] Compiled C binary '{C_RUNTIME_BIN}' not found. Please run 'make' first.")
        sys.exit(1)

    cmd = [C_RUNTIME_BIN] + args
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0 and not result.stdout:
        print(f"[Runtime Error] {result.stderr.strip()}")
        sys.exit(1)

    try:
        return json.loads(result.stdout.strip())
    except json.JSONDecodeError:
        print(f"[Runtime Raw Output] {result.stdout.strip()}")
        return {"raw": result.stdout.strip()}


# CLI Command Handlers
def cmd_create(args, db):
    try:
        cid = db.create_container(args.name, args.cmd, args.cpu, args.mem)
        print(f"[SUCCESS] Created container '{args.name}' with ID: {cid}")
        print(f"  Command: {args.cmd}")
        print(f"  Limits: CPU={args.cpu}s, MEM={args.mem}MB")
    except Exception as e:
        print(f"[ERROR] Failed to create container: {e}")

def cmd_start(args, db):
    container = db.get_container(args.id)
    if not container:
        print(f"[ERROR] Container ID {args.id} not found.")
        return

    print(f"[*] Starting container ID {args.id} ('{container['name']}')...")

    # Build C runtime start args
    c_args = ["start"]
    if container["max_cpu"] > 0:
        c_args.extend(["--cpu", str(container["max_cpu"])])
    if container["max_mem"] > 0:
        c_args.extend(["--mem", str(container["max_mem"])])
    c_args.extend(["--"] + container["command"].split())

    res = run_c_runtime(c_args)
    if res.get("status") == "RUNNING" and res.get("pid"):
        pid = res["pid"]
        db.update_status(args.id, "RUNNING", pid=pid)
        print(f"[SUCCESS] Container '{container['name']}' started with PID {pid}.")
    else:
        db.update_status(args.id, "FAILED")
        print(f"[FAILED] Could not launch container: {res.get('error')}")

def cmd_status(args, db):
    container = db.get_container(args.id)
    if not container:
        print(f"[ERROR] Container ID {args.id} not found.")
        return

    pid = container["pid"]
    if pid <= 0 or container["status"] not in ["RUNNING"]:
        print(f"Container {args.id} ({container['name']}): Status = {container['status']} (No active PID)")
        return

    # Check live status via C runtime monitor
    c_args = ["status", "--pid", str(pid)]
    if args.block:
        c_args.append("--block")

    res = run_c_runtime(c_args)
    curr_state = res.get("status", container["status"])
    exit_code = res.get("exit_code")

    if curr_state != container["status"]:
        db.update_status(args.id, curr_state, exit_code=exit_code)

    print(f"Container {args.id} ({container['name']}):")
    print(f"  PID:       {pid}")
    print(f"  Status:    {curr_state}")
    print(f"  Exit Code: {exit_code}")

def cmd_stop(args, db):
    container = db.get_container(args.id)
    if not container:
        print(f"[ERROR] Container ID {args.id} not found.")
        return

    pid = container["pid"]
    if pid <= 0:
        print(f"[Notice] Container {args.id} is not currently running.")
        db.update_status(args.id, "STOPPED")
        return

    print(f"[*] Stopping container ID {args.id} (PID {pid})...")
    c_args = ["stop", "--pid", str(pid), "--grace", str(args.grace)]
    if args.kill:
        c_args.append("--kill")

    res = run_c_runtime(c_args)
    if res.get("status") == "STOPPED":
        db.update_status(args.id, "STOPPED")
        print(f"[SUCCESS] Container ID {args.id} stopped successfully.")
    else:
        print(f"[ERROR] Failed to stop container PID {pid}: {res.get('error')}")

def cmd_list(args, db):
    containers = db.list_containers()
    if not containers:
        print("No containers found.")
        return

    print(f"{'ID':<6} {'NAME':<20} {'STATUS':<12} {'PID':<8} {'COMMAND'}")
    print("-" * 70)
    for c in containers:
        print(f"{c['id']:<6} {c['name']:<20} {c['status']:<12} {c['pid']:<8} {c['command']}")

def cmd_logs(args, db):
    logs = db.get_logs(args.id)
    if not logs:
        print(f"No logs recorded for container ID {args.id}.")
        return

    print(f"--- Audit Trail Logs for Container ID {args.id} ---")
    for l in logs:
        old_st = l['old_status'] or 'NONE'
        print(f"[{l['time']}] Log #{l['log_id']}: {old_st} -> {l['new_status']} | {l['message']}")


def main():
    parser = argparse.ArgumentParser(prog="containeros", description="ContainerOS CLI Interface")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # create
    p_create = subparsers.add_parser("create", help="Register a new container")
    p_create.add_argument("--name", required=True, help="Unique container name")
    p_create.add_argument("--cmd", required=True, help="Command executable and args")
    p_create.add_argument("--cpu", type=int, default=0, help="CPU time limit in seconds")
    p_create.add_argument("--mem", type=int, default=0, help="Memory limit in MB")

    # start
    p_start = subparsers.add_parser("start", help="Start a container")
    p_start.add_argument("--id", type=int, required=True, help="Container ID")

    # status
    p_status = subparsers.add_parser("status", help="Inspect container status")
    p_status.add_argument("--id", type=int, required=True, help="Container ID")
    p_status.add_argument("--block", action="store_true", help="Block until process exits")

    # stop
    p_stop = subparsers.add_parser("stop", help="Stop a running container")
    p_stop.add_argument("--id", type=int, required=True, help="Container ID")
    p_stop.add_argument("--grace", type=int, default=2, help="Grace period before SIGKILL")
    p_stop.add_argument("--kill", action="store_true", help="Force immediate SIGKILL")

    # list
    p_list = subparsers.add_parser("list", help="List all containers")

    # logs
    p_logs = subparsers.add_parser("logs", help="Fetch audit logs for a container")
    p_logs.add_argument("--id", type=int, required=True, help="Container ID")

    args = parser.parse_args()

    # Database setup
    db_dsn = os.environ.get("ORACLE_DSN")
    db_user = os.environ.get("ORACLE_USER", "system")
    db_pass = os.environ.get("ORACLE_PASSWORD", "oracle")

    db = DatabaseBackend(oracle_dsn=db_dsn, oracle_user=db_user, oracle_password=db_pass)

    if args.command == "create":
        cmd_create(args, db)
    elif args.command == "start":
        cmd_start(args, db)
    elif args.command == "status":
        cmd_status(args, db)
    elif args.command == "stop":
        cmd_stop(args, db)
    elif args.command == "list":
        cmd_list(args, db)
    elif args.command == "logs":
        cmd_logs(args, db)

if __name__ == "__main__":
    main()
