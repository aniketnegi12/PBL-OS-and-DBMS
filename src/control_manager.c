#include "control_manager.h"
#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <unistd.h>
#include <sys/resource.h>
#include <sys/time.h>
#include <errno.h>

int apply_resource_limits(int cpu_sec, long mem_mb) {
    if (cpu_sec > 0) {
        struct rlimit rl_cpu;
        rl_cpu.rlim_cur = (rlim_t)cpu_sec;
        rl_cpu.rlim_max = (rlim_t)(cpu_sec + 2); /* Give hard limit slight grace margin */
        if (setrlimit(RLIMIT_CPU, &rl_cpu) != 0) {
            perror("setrlimit RLIMIT_CPU failed");
            return -1;
        }
    }

    if (mem_mb > 0) {
        struct rlimit rl_mem;
        rlim_t bytes = (rlim_t)mem_mb * 1024 * 1024;
        rl_mem.rlim_cur = bytes;
        rl_mem.rlim_max = bytes;
        #ifdef RLIMIT_AS
        if (setrlimit(RLIMIT_AS, &rl_mem) != 0) {
            perror("setrlimit RLIMIT_AS failed");
            return -1;
        }
        #elif defined(RLIMIT_DATA)
        if (setrlimit(RLIMIT_DATA, &rl_mem) != 0) {
            perror("setrlimit RLIMIT_DATA failed");
            return -1;
        }
        #endif
    }

    return 0;
}

int stop_process(pid_t pid, int grace_sec) {
    if (pid <= 0) return -1;

    /* Check if process exists */
    if (kill(pid, 0) != 0) {
        if (errno == ESRCH) return 0; /* Process already terminated */
        return -1;
    }

    /* Step 1: Send SIGTERM for graceful shutdown */
    if (kill(pid, SIGTERM) != 0) {
        perror("kill SIGTERM failed");
        return -1;
    }

    /* Step 2: Poll during grace period */
    int polls = grace_sec * 10; /* 100ms interval */
    for (int i = 0; i < polls; i++) {
        usleep(100000); /* 100 milliseconds */
        if (kill(pid, 0) != 0 && errno == ESRCH) {
            return 0; /* Graceful exit achieved */
        }
    }

    /* Step 3: Escalate to SIGKILL if still running */
    if (kill(pid, 0) == 0) {
        if (kill(pid, SIGKILL) != 0) {
            perror("kill SIGKILL failed");
            return -1;
        }
    }

    return 0;
}

int force_kill_process(pid_t pid) {
    if (pid <= 0) return -1;
    if (kill(pid, SIGKILL) != 0) {
        if (errno == ESRCH) return 0;
        perror("force_kill_process failed");
        return -1;
    }
    return 0;
}
