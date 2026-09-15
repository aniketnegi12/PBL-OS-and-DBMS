-- ============================================================================
-- ContainerOS PL/SQL Audit Triggers
-- Owned by: Person D (Transactions, PL/SQL & Concurrency)
-- ============================================================================

CREATE OR REPLACE TRIGGER trg_container_status_log
AFTER UPDATE OF status ON CONTAINERS
FOR EACH ROW
WHEN (OLD.status IS NULL OR OLD.status <> NEW.status)
BEGIN
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
        'Automated Trigger Log: Status updated from ' || :OLD.status || ' to ' || :NEW.status,
        CURRENT_TIMESTAMP
    );
END;
/
