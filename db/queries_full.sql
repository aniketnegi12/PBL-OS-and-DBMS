-- ============================================================================
--  ContainerLite - demo/report queries (run after schema_full.sql + seed_full.sql)
-- ============================================================================

PROMPT 1) All containers: owner, image, status, limits, uptime
SELECT container_name, owner, image_ref, status, exit_code, restart_count,
       memory_limit_bytes/1048576 AS mem_limit_mb, pids_max, uptime_seconds
FROM   v_container_overview
ORDER  BY container_id;

PROMPT 2) Running containers with live uptime
SELECT container_name, owner, pid, hostname,
       ROUND(uptime_seconds/60) AS uptime_minutes
FROM   v_container_overview
WHERE  status = 'RUNNING';

PROMPT 3) OS process tree per container (CONNECT BY walk)
SELECT c.container_name, LPAD(' ', 2*(t.tree_depth-1)) || t.command AS process_tree,
       t.os_pid, t.state, t.is_init
FROM   v_process_tree t
JOIN   v_container_overview c ON c.container_id = t.container_id
ORDER  BY c.container_id, t.tree_depth;

PROMPT 4) Latest metric sample per container
SELECT c.container_name, m.captured_at, m.cpu_usage_pct,
       ROUND(m.memory_usage_bytes/1048576,1) AS mem_mb,
       m.pids_count, m.rx_bytes, m.tx_bytes
FROM   v_latest_metrics m
JOIN   v_container_overview c ON c.container_id = m.container_id
ORDER  BY c.container_name;

PROMPT 5) Average and peak CPU over the last hour
SELECT c.container_name,
       ROUND(AVG(m.cpu_usage_pct),2) AS avg_cpu_pct,
       MAX(m.cpu_usage_pct)          AS peak_cpu_pct,
       COUNT(*)                      AS samples
FROM   metrics m
JOIN   containers c ON c.container_id = m.container_id
WHERE  m.captured_at > SYSTIMESTAMP - INTERVAL '1' HOUR
GROUP  BY c.container_name
ORDER  BY avg_cpu_pct DESC;

PROMPT 6) Memory headroom: latest usage vs limit
SELECT c.container_name,
       ROUND(l.memory_limit_bytes/1048576) AS limit_mb,
       ROUND(m.memory_usage_bytes/1048576) AS used_mb,
       ROUND(100*m.memory_usage_bytes/l.memory_limit_bytes,1) AS pct_used
FROM   v_latest_metrics m
JOIN   resource_limits l ON l.container_id = m.container_id
JOIN   containers c ON c.container_id = m.container_id
ORDER  BY pct_used DESC;

PROMPT 7) Full audit timeline (auto-written by triggers)
SELECT * FROM v_event_timeline ORDER BY occurred_at DESC;

PROMPT 8) Lifecycle summary: one row per container, events as columns
SELECT c.container_name,
       COUNT(CASE WHEN e.event_type = 'CREATED'   THEN 1 END) AS created,
       COUNT(CASE WHEN e.event_type IN ('STARTED','RESTARTED') THEN 1 END) AS starts,
       COUNT(CASE WHEN e.event_type IN ('STOPPED','EXITED')    THEN 1 END) AS stops,
       COUNT(CASE WHEN e.event_type = 'LIMIT_UPDATED' THEN 1 END) AS limit_changes
FROM   events e
JOIN   containers c ON c.container_id = e.container_id
GROUP  BY c.container_name
ORDER  BY c.container_name;

PROMPT 9) Namespace inventory per container
SELECT c.container_name,
       LISTAGG(n.ns_type, ', ') WITHIN GROUP (ORDER BY n.ns_type) AS namespaces,
       COUNT(*) AS ns_count
FROM   namespaces n
JOIN   containers c ON c.container_id = n.container_id
GROUP  BY c.container_name
ORDER  BY ns_count DESC;

PROMPT 10) Logs of a container's init process
SELECT l.logged_at, l.stream, l.line_text
FROM   logs l
JOIN   processes p ON p.process_id = l.process_id
JOIN   containers c ON c.container_id = p.container_id
WHERE  c.container_name = 'web-proxy' AND p.is_init = 'Y'
ORDER  BY l.logged_at;

PROMPT 11) Function demo: uptime in seconds
SELECT container_name, status, fn_uptime_seconds(container_id) AS uptime_s
FROM   v_container_overview
WHERE  status IN ('RUNNING','PAUSED');

PROMPT 12) Procedure demo: stop web-proxy cleanly (comment out if unwanted)
-- BEGIN prc_stop_container(
--          (SELECT container_id FROM containers WHERE name = 'web-proxy'),
--          0, 'user'); END; /
-- SELECT * FROM v_event_timeline ORDER BY occurred_at DESC;
