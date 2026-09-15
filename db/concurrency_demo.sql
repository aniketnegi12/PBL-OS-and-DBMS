-- ============================================================================
-- ContainerOS Concurrency & Locking Viva Demonstration
-- Owned by: Person D (Transactions, PL/SQL & Concurrency)
-- ============================================================================
-- Instructions: Run Session 1 script in Terminal/Session A, and Session 2 script in Session B.

--------------------------------------------------------------------------------
-- SESSION 1 (Terminates process & updates DB under lock)
--------------------------------------------------------------------------------
-- Step 1. Acquire exclusive row lock on container ID 1001
SELECT container_id, name, status, pid 
FROM CONTAINERS 
WHERE container_id = 1001 
FOR UPDATE;

-- Step 2. Simulate OS process stopping delay (e.g., waiting 10 seconds)
-- (During this time, Session 2 attempts to lock or update the same container)
DBMS_LOCK.SLEEP(10); 

-- Step 3. Update status to STOPPED
UPDATE CONTAINERS 
SET status = 'STOPPED', updated_at = CURRENT_TIMESTAMP 
WHERE container_id = 1001;

-- Step 4. Release lock by committing transaction
COMMIT;


--------------------------------------------------------------------------------
-- SESSION 2 (Competing session trying to modify the same container)
--------------------------------------------------------------------------------
-- Step 1. Attempt to lock container 1001 (WILL BLOCK UNTIL SESSION 1 COMMITS)
SELECT container_id, name, status, pid 
FROM CONTAINERS 
WHERE container_id = 1001 
FOR UPDATE;

-- Step 2. Inspect updated status (Session 2 reads updated state 'STOPPED')
UPDATE CONTAINERS 
SET status = 'RUNNING', updated_at = CURRENT_TIMESTAMP 
WHERE container_id = 1001;

COMMIT;
