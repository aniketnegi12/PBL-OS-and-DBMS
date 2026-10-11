-- ============================================================================
--  ContainerLite - seed/demo data (run AFTER schema_full.sql)
--  Uses sequences via NEXTVAL so no manual ids and no collisions.
--  Status changes go through UPDATE so the audit triggers fire live.
-- ============================================================================

PROMPT == Seeding users ==
INSERT INTO users (username, full_name, email, role)
VALUES ('aniket',   'Aniket Negi', 'aniket@example.edu', 'admin');
INSERT INTO users (username, full_name, role) VALUES ('student1', 'Teammate One',   'student');
INSERT INTO users (username, full_name, role) VALUES ('student2', 'Teammate Two',   'student');

PROMPT == Seeding images ==
INSERT INTO images (image_id, name, tag, entrypoint, size_bytes, description)
VALUES (seq_images.NEXTVAL, 'busybox', '1.36', '/bin/sh', 4620000,
        'Minimal userland utilities - tiny test container');
INSERT INTO images (image_id, name, tag, entrypoint, size_bytes, description)
VALUES (seq_images.NEXTVAL, 'alpine', '3.19', '/bin/sh', 7800000,
        'Security-oriented lightweight Linux distro');
INSERT INTO images (image_id, name, tag, entrypoint, size_bytes, description)
VALUES (seq_images.NEXTVAL, 'python', '3.12-slim', 'python3', 52000000,
        'Python runtime for lab workloads');
INSERT INTO images (image_id, name, tag, entrypoint, size_bytes, description)
VALUES (seq_images.NEXTVAL, 'nginx', '1.25',
        'nginx -g ''daemon off;''', 187000000,
        'Web server used as the demo long-running container');

PROMPT == Creating containers (initial status CREATED; started via UPDATE) ==
INSERT INTO containers (container_id, name, image_id, owner_id, hostname, status)
SELECT seq_containers.NEXTVAL, 'web-proxy', i.image_id, u.user_id, 'web-proxy', 'CREATED'
FROM images i, users u
WHERE i.name = 'nginx' AND i.tag = '1.25' AND u.username = 'aniket';

INSERT INTO containers (container_id, name, image_id, owner_id, hostname, status)
SELECT seq_containers.NEXTVAL, 'py-lab', i.image_id, u.user_id, 'py-lab', 'CREATED'
FROM images i, users u
WHERE i.name = 'python' AND i.tag = '3.12-slim' AND u.username = 'student1';

INSERT INTO containers (container_id, name, image_id, owner_id, hostname, status)
SELECT seq_containers.NEXTVAL, 'sandbox', i.image_id, u.user_id, 'sandbox', 'CREATED'
FROM images i, users u
WHERE i.name = 'alpine' AND i.tag = '3.19' AND u.username = 'aniket';

INSERT INTO containers (container_id, name, image_id, owner_id, hostname, status)
SELECT seq_containers.NEXTVAL, 'logger', i.image_id, u.user_id, 'logger', 'CREATED'
FROM images i, users u
WHERE i.name = 'busybox' AND i.tag = '1.36' AND u.username = 'student2';
-- END-ANCHOR: seed1

PROMPT == Live lifecycle via UPDATEs (audit triggers fire here) ==
UPDATE containers SET status = 'RUNNING', pid = 4182 WHERE name = 'web-proxy';
UPDATE containers SET status = 'RUNNING', pid = 4210 WHERE name = 'py-lab';
UPDATE containers SET status = 'RUNNING', pid = 4301 WHERE name = 'logger';

-- py-lab finishes its batch job: RUNNING -> EXITED (trigger stamps + logs it)
UPDATE containers SET status = 'EXITED', exit_code = 0 WHERE name = 'py-lab';

PROMPT == Resource limits (cgroup / setrlimit values) ==
INSERT INTO resource_limits (limit_id, container_id, cgroup_path,
        memory_limit_bytes, memory_swap_bytes, cpu_shares, cpu_quota_us,
        cpu_period_us, pids_max, nofile_limit)
SELECT seq_resource_limits.NEXTVAL, c.container_id,
       '/sys/fs/cgroup/clite/'||c.name, 268435456, 536870912, 1024, 50000,
       100000, 100, 1024
FROM containers c WHERE c.name = 'web-proxy';

INSERT INTO resource_limits (limit_id, container_id, cgroup_path,
        memory_limit_bytes, cpu_shares, pids_max)
SELECT seq_resource_limits.NEXTVAL, c.container_id,
       '/sys/fs/cgroup/clite/'||c.name, 134217728, 512, 50
FROM containers c WHERE c.name = 'logger';

INSERT INTO resource_limits (limit_id, container_id, cgroup_path,
        memory_limit_bytes, cpu_shares)
SELECT seq_resource_limits.NEXTVAL, c.container_id,
       '/sys/fs/cgroup/clite/'||c.name, 134217728, 512
FROM containers c WHERE c.name = 'sandbox';

PROMPT == Kernel namespaces per container ==
INSERT INTO namespaces (ns_id, container_id, ns_type, ns_inode)
SELECT seq_namespaces.NEXTVAL, c.container_id, x.ns_type, x.inode
FROM containers c,
     (SELECT 'PID' AS ns_type, 4026531836 AS inode FROM dual UNION ALL
      SELECT 'NET', 4026531840 FROM dual UNION ALL
      SELECT 'MNT', 4026531841 FROM dual UNION ALL
      SELECT 'IPC', 4026531839 FROM dual UNION ALL
      SELECT 'UTS', 4026531838 FROM dual) x
WHERE c.name = 'web-proxy';

INSERT INTO namespaces (ns_id, container_id, ns_type, ns_inode)
SELECT seq_namespaces.NEXTVAL, c.container_id, x.ns_type, x.inode
FROM containers c,
     (SELECT 'PID' AS ns_type, 4026532501 AS inode FROM dual UNION ALL
      SELECT 'MNT', 4026532502 FROM dual UNION ALL
      SELECT 'UTS', 4026532503 FROM dual) x
WHERE c.name IN ('py-lab','logger','sandbox');
-- END-ANCHOR: seed2

PROMPT == Processes (init + children = the OS process tree) ==
INSERT INTO processes (process_id, container_id, parent_process_id, os_pid,
                       command, state, is_init, start_time)
SELECT seq_processes.NEXTVAL, c.container_id, NULL, 4182,
       'nginx: master process', 'RUNNING', 'Y', SYSTIMESTAMP - INTERVAL '45' MINUTE
FROM containers c WHERE c.name = 'web-proxy';

INSERT INTO processes (process_id, container_id, parent_process_id, os_pid,
                       command, state, is_init, start_time)
SELECT seq_processes.NEXTVAL, c.container_id, p.process_id, 4183,
       'nginx: worker process', 'RUNNING', 'N', SYSTIMESTAMP - INTERVAL '45' MINUTE
FROM containers c, processes p
WHERE c.name = 'web-proxy' AND p.container_id = c.container_id AND p.is_init = 'Y';

INSERT INTO processes (process_id, container_id, parent_process_id, os_pid,
                       command, state, is_init, start_time, end_time, exit_code)
SELECT seq_processes.NEXTVAL, c.container_id, NULL, 4210,
       'python3 -m http.server 8000', 'DEAD', 'Y',
       SYSTIMESTAMP - INTERVAL '44' MINUTE, SYSTIMESTAMP - INTERVAL '40' MINUTE, 0
FROM containers c WHERE c.name = 'py-lab';

INSERT INTO processes (process_id, container_id, parent_process_id, os_pid,
                       command, state, is_init, start_time)
SELECT seq_processes.NEXTVAL, c.container_id, NULL, 4301,
       '/bin/sh -c logger loop', 'RUNNING', 'Y', SYSTIMESTAMP - INTERVAL '30' MINUTE
FROM containers c WHERE c.name = 'logger';

INSERT INTO processes (process_id, container_id, parent_process_id, os_pid,
                       command, state, is_init, start_time)
SELECT seq_processes.NEXTVAL, c.container_id, p.process_id, 4302,
       'sleep 60', 'SLEEPING', 'N', SYSTIMESTAMP - INTERVAL '29' MINUTE
FROM containers c, processes p
WHERE c.name = 'logger' AND p.container_id = c.container_id AND p.is_init = 'Y';
-- END-ANCHOR: seed3

PROMPT == Monitor-loop metric samples ==
INSERT INTO metrics (metric_id, container_id, captured_at, cpu_usage_pct,
                     memory_usage_bytes, rx_bytes, tx_bytes, pids_count)
SELECT seq_metrics.NEXTVAL, c.container_id, SYSTIMESTAMP - NUMTODSINTERVAL(60 - 10*x.rn, 'MINUTE'),
       0.4 + x.rn * 0.3, 12582912 + x.rn * 524288,
       1048576 * x.rn, 524288 * x.rn, 2
FROM containers c, (SELECT LEVEL AS rn FROM dual CONNECT BY LEVEL <= 6) x
WHERE c.name = 'web-proxy';

INSERT INTO metrics (metric_id, container_id, captured_at, cpu_usage_pct,
                     memory_usage_bytes, rx_bytes, tx_bytes, pids_count)
SELECT seq_metrics.NEXTVAL, c.container_id, SYSTIMESTAMP - NUMTODSINTERVAL(30 - 5*x.rn, 'MINUTE'),
       0.1, 2097152, 4096, 4096, 2
FROM containers c, (SELECT LEVEL AS rn FROM dual CONNECT BY LEVEL <= 4) x
WHERE c.name = 'logger';

INSERT INTO metrics (metric_id, container_id, captured_at, cpu_usage_pct,
                     memory_usage_bytes, pids_count)
SELECT seq_metrics.NEXTVAL, c.container_id, SYSTIMESTAMP - NUMTODSINTERVAL(45 - 2*x.rn, 'MINUTE'),
       61.5, 49807360, 1
FROM containers c, (SELECT LEVEL AS rn FROM dual CONNECT BY LEVEL <= 2) x
WHERE c.name = 'py-lab';

PROMPT == Captured process output ==
INSERT INTO logs (log_id, process_id, stream, line_text, logged_at)
SELECT seq_logs.NEXTVAL, p.process_id, 'STDOUT',
       'web-proxy ready - listening on :80', SYSTIMESTAMP - INTERVAL '44' MINUTE
FROM processes p
JOIN containers c ON c.container_id = p.container_id
WHERE c.name = 'web-proxy' AND p.is_init = 'Y';

INSERT INTO logs (log_id, process_id, stream, line_text, logged_at)
SELECT seq_logs.NEXTVAL, p.process_id, 'STDOUT',
       'GET /health 200 - 0.1ms', SYSTIMESTAMP - INTERVAL '12' MINUTE
FROM processes p
JOIN containers c ON c.container_id = p.container_id
WHERE c.name = 'web-proxy' AND p.is_init = 'N';

INSERT INTO logs (log_id, process_id, stream, line_text, logged_at)
SELECT seq_logs.NEXTVAL, p.process_id, 'STDERR',
       'worker connection limit reached (1024) - recycling', SYSTIMESTAMP - INTERVAL '9' MINUTE
FROM processes p
JOIN containers c ON c.container_id = p.container_id
WHERE c.name = 'web-proxy' AND p.is_init = 'N';

INSERT INTO logs (log_id, process_id, stream, line_text, logged_at)
SELECT seq_logs.NEXTVAL, p.process_id, 'STDOUT',
       'batch job finished with status 0', SYSTIMESTAMP - INTERVAL '40' MINUTE
FROM processes p
JOIN containers c ON c.container_id = p.container_id
WHERE c.name = 'py-lab' AND p.is_init = 'Y';

PROMPT == One operator action recorded directly (LIMIT_UPDATED) ==
INSERT INTO events (event_id, container_id, event_type, actor, message)
SELECT seq_events.NEXTVAL, c.container_id, 'LIMIT_UPDATED', 'user',
       'Memory limit raised to 512M after load test'
FROM containers c WHERE c.name = 'web-proxy';

COMMIT;
PROMPT == Seed complete ==

