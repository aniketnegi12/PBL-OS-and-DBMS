#!/usr/bin/env python3
import os
import sys
import time
import json
import unittest
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
C_BIN = os.path.join(PROJECT_ROOT, "containeros-runtime")
CLI_BIN = os.path.join(PROJECT_ROOT, "cli", "containeros.py")
DB_FILE = os.path.join(PROJECT_ROOT, "containeros_local.db")

class TestContainerOSRuntime(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Build C binary
        subprocess.run(["make", "-C", PROJECT_ROOT], check=True)

    def setUp(self):
        # Clean local test DB before each test
        if os.path.exists(DB_FILE):
            try:
                os.remove(DB_FILE)
            except OSError:
                pass

    def test_c_binary_start_and_status(self):
        # Start a process via C runtime binary (sleep 10)
        cmd = [C_BIN, "start", "--", "sleep", "10"]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        self.assertIn("RUNNING", res.stdout)
        data = json.loads(res.stdout)
        pid = data["pid"]
        self.assertGreater(pid, 0)

        # Check status while running
        status_cmd = [C_BIN, "status", "--pid", str(pid)]
        res_st = subprocess.run(status_cmd, capture_output=True, text=True, check=True)
        self.assertIn("RUNNING", res_st.stdout)

        # Cleanly stop the process via signal
        stop_cmd = [C_BIN, "stop", "--pid", str(pid), "--grace", "1"]
        res_sp = subprocess.run(stop_cmd, capture_output=True, text=True, check=True)
        self.assertIn("STOPPED", res_sp.stdout)

        # Check status after exit/stop
        res_ex = subprocess.run(status_cmd, capture_output=True, text=True, check=True)
        self.assertIn("EXITED", res_ex.stdout)

    def test_cpu_limit_enforcement(self):
        # Spawns an infinite CPU loop with a 1 second CPU time cap
        cmd = [C_BIN, "start", "--cpu", "1", "--", "python3", "-c", "while True: pass"]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(res.stdout)
        pid = data["pid"]

        # Wait 2 seconds for CPU limit to trigger SIGXCPU / SIGKILL
        time.sleep(2.0)

        status_cmd = [C_BIN, "status", "--pid", str(pid)]
        res_st = subprocess.run(status_cmd, capture_output=True, text=True, check=True)
        data_st = json.loads(res_st.stdout)
        self.assertIn(data_st["status"], ["EXITED", "FAILED"])

    def test_cli_full_lifecycle(self):
        # 1. Create container via CLI
        create_cmd = [sys.executable, CLI_BIN, "create", "--name", "test-worker", "--cmd", "sleep 10", "--cpu", "5"]
        res_cr = subprocess.run(create_cmd, capture_output=True, text=True, check=True)
        self.assertIn("SUCCESS", res_cr.stdout)

        # 2. List containers
        list_cmd = [sys.executable, CLI_BIN, "list"]
        res_ls = subprocess.run(list_cmd, capture_output=True, text=True, check=True)
        self.assertIn("test-worker", res_ls.stdout)

        # 3. Start container 1
        start_cmd = [sys.executable, CLI_BIN, "start", "--id", "1"]
        res_st = subprocess.run(start_cmd, capture_output=True, text=True, check=True)
        self.assertIn("SUCCESS", res_st.stdout)

        # 4. Stop container 1
        stop_cmd = [sys.executable, CLI_BIN, "stop", "--id", "1", "--grace", "1"]
        res_sp = subprocess.run(stop_cmd, capture_output=True, text=True, check=True)
        self.assertIn("SUCCESS", res_sp.stdout)

        # 5. Fetch logs
        logs_cmd = [sys.executable, CLI_BIN, "logs", "--id", "1"]
        res_lg = subprocess.run(logs_cmd, capture_output=True, text=True, check=True)
        self.assertIn("Audit Trail Logs", res_lg.stdout)

if __name__ == "__main__":
    unittest.main()
