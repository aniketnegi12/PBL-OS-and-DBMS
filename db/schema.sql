-- ============================================================================
-- ContainerOS Oracle RDBMS Schema Definition
-- Owned by: Person C (Schema & Core Operations)
-- ============================================================================

-- Drop existing tables/sequences if present
BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE CONTAINER_LOGS CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE RESOURCE_LIMITS CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE CONTAINERS CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL; END;
/

-- Sequences for Primary Keys
CREATE SEQUENCE seq_container_id START WITH 1001 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_limit_id START WITH 5001 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_log_id START WITH 9001 INCREMENT BY 1 NOCACHE;

-- 1. CONTAINERS Table
CREATE TABLE CONTAINERS (
    container_id  NUMBER(10)      DEFAULT seq_container_id.NEXTVAL NOT NULL,
    name          VARCHAR2(64)    NOT NULL,
    image_command VARCHAR2(256)   NOT NULL,
    status        VARCHAR2(16)    DEFAULT 'PENDING' NOT NULL,
    pid           NUMBER(10)      DEFAULT 0,
    exit_code     NUMBER(5)       DEFAULT NULL,
    created_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_containers PRIMARY KEY (container_id),
    CONSTRAINT uk_container_name UNIQUE (name),
    CONSTRAINT chk_container_status CHECK (
        status IN ('PENDING', 'RUNNING', 'STOPPED', 'EXITED', 'FAILED')
    )
);

-- Index for searching containers by status
CREATE INDEX idx_containers_status ON CONTAINERS(status);

-- 2. RESOURCE_LIMITS Table
CREATE TABLE RESOURCE_LIMITS (
    limit_id      NUMBER(10)      DEFAULT seq_limit_id.NEXTVAL NOT NULL,
    container_id  NUMBER(10)      NOT NULL,
    max_cpu_sec   NUMBER(5)       DEFAULT 0 NOT NULL, -- 0 = Unlimited
    max_mem_mb    NUMBER(10)      DEFAULT 0 NOT NULL, -- 0 = Unlimited
    CONSTRAINT pk_resource_limits PRIMARY KEY (limit_id),
    CONSTRAINT fk_limits_container FOREIGN KEY (container_id)
        REFERENCES CONTAINERS(container_id) ON DELETE CASCADE,
    CONSTRAINT uk_limit_container UNIQUE (container_id)
);

-- 3. CONTAINER_LOGS Table (Audit Trail)
CREATE TABLE CONTAINER_LOGS (
    log_id        NUMBER(10)      DEFAULT seq_log_id.NEXTVAL NOT NULL,
    container_id  NUMBER(10)      NOT NULL,
    old_status    VARCHAR2(16),
    new_status    VARCHAR2(16)    NOT NULL,
    message       VARCHAR2(256),
    log_time      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_container_logs PRIMARY KEY (log_id),
    CONSTRAINT fk_logs_container FOREIGN KEY (container_id)
        REFERENCES CONTAINERS(container_id) ON DELETE CASCADE
);

CREATE INDEX idx_logs_container_id ON CONTAINER_LOGS(container_id);

COMMIT;
