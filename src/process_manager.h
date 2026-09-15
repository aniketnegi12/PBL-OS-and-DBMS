#ifndef PROCESS_MANAGER_H
#define PROCESS_MANAGER_H

#include <sys/types.h>

/* Container / Process States */
#define STATE_PENDING "PENDING"
#define STATE_RUNNING "RUNNING"
#define STATE_EXITED  "EXITED"
#define STATE_FAILED  "FAILED"
#define STATE_STOPPED "STOPPED"

typedef struct {
    pid_t pid;
    int exit_code;
    int term_sig;
    char state[16];
    char command[512];
} process_info_t;

/**
 * Spawns a child process using fork() and execvp().
 *
 * @param command Path or name of the command to execute.
 * @param argv Array of arguments (must be NULL-terminated).
 * @param out_pid Pointer to store the spawned child PID.
 * @return 0 on success, -1 on fork/exec failure.
 */
int spawn_process(const char *command, char *const argv[], pid_t *out_pid);

/**
 * Monitors a process using waitpid() and maps exit status to container state.
 *
 * @param pid Process ID to monitor.
 * @param blocking 1 to block until exit, 0 for non-blocking check.
 * @param out_exit_code Pointer to store exit code.
 * @param out_term_sig Pointer to store signal number if terminated by signal.
 * @param out_state Buffer (at least 16 bytes) to receive state string ("RUNNING", "EXITED", "FAILED").
 * @return PID on state change/exit, 0 if still running (non-blocking), -1 on error.
 */
int monitor_process(pid_t pid, int blocking, int *out_exit_code, int *out_term_sig, char *out_state);

#endif /* PROCESS_MANAGER_H */
