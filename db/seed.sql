-- ============================================================================
-- ContainerOS Seed Data Script
-- Owned by: Person C (Schema & Core Operations)
-- ============================================================================

DELETE FROM CONTAINER_LOGS;
DELETE FROM RESOURCE_LIMITS;
DELETE FROM CONTAINERS;

-- Sample Container 1: Web Server
INSERT INTO CONTAINERS (container_id, name, image_command, status, pid)
VALUES (1001, 'web-nginx', 'python3 -m http.server 8080', 'PENDING', 0);

INSERT INTO RESOURCE_LIMITS (limit_id, container_id, max_cpu_sec, max_mem_mb)
VALUES (5001, 1001, 60, 512);

-- Sample Container 2: Background CPU Worker
INSERT INTO CONTAINERS (container_id, name, image_command, status, pid)
VALUES (1002, 'cpu-worker', 'python3 -c "import time; time.sleep(30)"', 'PENDING', 0);

INSERT INTO RESOURCE_LIMITS (limit_id, container_id, max_cpu_sec, max_mem_mb)
VALUES (5002, 1002, 10, 128);

-- Sample Container 3: Quick Batch Job
INSERT INTO CONTAINERS (container_id, name, image_command, status, pid)
VALUES (1003, 'batch-cleaner', 'echo Batch Job Completed', 'EXITED', 0);

INSERT INTO RESOURCE_LIMITS (limit_id, container_id, max_cpu_sec, max_mem_mb)
VALUES (5003, 1003, 5, 64);

-- Audit log seed
INSERT INTO CONTAINER_LOGS (log_id, container_id, old_status, new_status, message)
VALUES (9001, 1003, 'PENDING', 'RUNNING', 'Process started successfully');

INSERT INTO CONTAINER_LOGS (log_id, container_id, old_status, new_status, message)
VALUES (9002, 1003, 'RUNNING', 'EXITED', 'Process completed with exit code 0');

COMMIT;
