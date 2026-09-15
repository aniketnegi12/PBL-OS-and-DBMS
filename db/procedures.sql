-- ============================================================================
-- ContainerOS PL/SQL Stored Procedures
-- Owned by: Person D (Transactions, PL/SQL & Concurrency)
-- ============================================================================

CREATE OR REPLACE PROCEDURE create_container (
    p_name          IN  VARCHAR2,
    p_command       IN  VARCHAR2,
    p_max_cpu_sec   IN  NUMBER DEFAULT 0,
    p_max_mem_mb    IN  NUMBER DEFAULT 0,
    p_container_id  OUT NUMBER
) AS
    v_cnt NUMBER;
BEGIN
    -- Input Validation
    IF p_name IS NULL OR TRIM(p_name) IS NULL THEN
        RAISE_APPLICATION_ERROR(-20001, 'Container name cannot be null or empty.');
    END IF;

    IF p_command IS NULL OR TRIM(p_command) IS NULL THEN
        RAISE_APPLICATION_ERROR(-20002, 'Command string cannot be null or empty.');
    END IF;

    -- Check for duplicate container name
    SELECT COUNT(*) INTO v_cnt FROM CONTAINERS WHERE name = p_name;
    IF v_cnt > 0 THEN
        RAISE_APPLICATION_ERROR(-20003, 'Container with name "' || p_name || '" already exists.');
    END IF;

    -- Insert into CONTAINERS table
    INSERT INTO CONTAINERS (name, image_command, status)
    VALUES (p_name, p_command, 'PENDING')
    RETURNING container_id INTO p_container_id;

    -- Insert into RESOURCE_LIMITS table
    INSERT INTO RESOURCE_LIMITS (container_id, max_cpu_sec, max_mem_mb)
    VALUES (p_container_id, NVL(p_max_cpu_sec, 0), NVL(p_max_mem_mb, 0));

    -- Transaction Commit
    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Successfully created container ID: ' || p_container_id);

EXCEPTION
    WHEN OTHERS THEN
        -- Rollback on any failure
        ROLLBACK;
        DBMS_OUTPUT.PUT_LINE('Error in create_container: ' || SQLERRM || '. Transaction rolled back.');
        RAISE;
END create_container;
/
