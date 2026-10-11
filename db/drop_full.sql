-- ============================================================================
--  ContainerLite - teardown for schema_full.sql (reverse dependency order)
--  WARNING: drops the full 9-table model and its data. Does NOT touch the
--  original schema.sql (3-table) objects.
-- ============================================================================

PROMPT == Dropping views, PL/SQL, triggers, tables, sequences ==

DROP VIEW v_container_overview;
DROP VIEW v_latest_metrics;
DROP VIEW v_process_tree;
DROP VIEW v_event_timeline;

DROP PROCEDURE prc_stop_container;
DROP FUNCTION  fn_uptime_seconds;

DROP TRIGGER trg_containers_biu;
DROP TRIGGER trg_containers_au;
DROP TRIGGER trg_containers_ai;
DROP TRIGGER trg_users_bir;
DROP TRIGGER trg_images_bir;
DROP TRIGGER trg_containers_bir;
DROP TRIGGER trg_processes_bir;
DROP TRIGGER trg_namespaces_bir;
DROP TRIGGER trg_rlimits_bir;
DROP TRIGGER trg_metrics_bir;
DROP TRIGGER trg_events_bir;
DROP TRIGGER trg_logs_bir;

DROP TABLE logs           CASCADE CONSTRAINTS;
DROP TABLE events         CASCADE CONSTRAINTS;
DROP TABLE metrics        CASCADE CONSTRAINTS;
DROP TABLE resource_limits CASCADE CONSTRAINTS;
DROP TABLE namespaces     CASCADE CONSTRAINTS;
DROP TABLE processes      CASCADE CONSTRAINTS;
DROP TABLE containers     CASCADE CONSTRAINTS;
DROP TABLE images         CASCADE CONSTRAINTS;
DROP TABLE users          CASCADE CONSTRAINTS;

DROP SEQUENCE seq_users;
DROP SEQUENCE seq_images;
DROP SEQUENCE seq_containers;
DROP SEQUENCE seq_processes;
DROP SEQUENCE seq_namespaces;
DROP SEQUENCE seq_resource_limits;
DROP SEQUENCE seq_metrics;
DROP SEQUENCE seq_events;
DROP SEQUENCE seq_logs;

PROMPT == ContainerLite schema removed ==
