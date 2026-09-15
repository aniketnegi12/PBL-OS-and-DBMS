#ifndef CONTROL_MANAGER_H
#define CONTROL_MANAGER_H

#include <sys/types.h>

typedef struct {
    int max_cpu_sec;  /* Max CPU time in seconds (0 = unlimited) */
    long max_mem_mb;  /* Max virtual memory in megabytes (0 = unlimited) */
} resource_limits_t;

/**
 * Applies POSIX resource limits (RLIMIT_CPU, RLIMIT_AS) to the calling process.
 * MUST be invoked in the child process context prior to calling execvp().
 *
 * @param cpu_sec CPU time cap in seconds (0 for no limit).
 * @param mem_mb Virtual memory cap in Megabytes (0 for no limit).
 * @return 0 on success, -1 on setrlimit error.
 */
int apply_resource_limits(int cpu_sec, long mem_mb);

/**
 * Gracefully stops a process by sending SIGTERM, followed by SIGKILL if needed.
 *
 * @param pid Target Process ID.
 * @param grace_sec Number of seconds to wait before escalating to SIGKILL.
 * @return 0 on successful termination signal, -1 on error.
 */
int stop_process(pid_t pid, int grace_sec);

/**
 * Immediately forces process termination via SIGKILL.
 *
 * @param pid Target Process ID.
 * @return 0 on success, -1 on error.
 */
int force_kill_process(pid_t pid);

#endif /* CONTROL_MANAGER_H */
