#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/wait.h>
#include "process_manager.h"
#include "control_manager.h"

static void print_usage(void) {
    fprintf(stderr, "Usage:\n");
    fprintf(stderr, "  containeros-runtime start [--cpu <sec>] [--mem <mb>] -- <command> [args...]\n");
    fprintf(stderr, "  containeros-runtime status --pid <pid> [--block]\n");
    fprintf(stderr, "  containeros-runtime stop --pid <pid> [--grace <sec>] [--kill]\n");
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        print_usage();
        return 1;
    }

    const char *action = argv[1];

    if (strcmp(action, "start") == 0) {
        int cpu_sec = 0;
        long mem_mb = 0;
        int cmd_idx = -1;

        for (int i = 2; i < argc; i++) {
            if (strcmp(argv[i], "--cpu") == 0 && i + 1 < argc) {
                cpu_sec = atoi(argv[++i]);
            } else if (strcmp(argv[i], "--mem") == 0 && i + 1 < argc) {
                mem_mb = atol(argv[++i]);
            } else if (strcmp(argv[i], "--") == 0 && i + 1 < argc) {
                cmd_idx = i + 1;
                break;
            }
        }

        if (cmd_idx == -1) {
            fprintf(stderr, "{\"error\": \"Missing '-- <command>' delimiter\"}\n");
            return 1;
        }

        const char *cmd = argv[cmd_idx];
        char *const *cmd_argv = &argv[cmd_idx];

        pid_t pid = fork();
        if (pid < 0) {
            printf("{\"status\": \"FAILED\", \"pid\": 0, \"error\": \"fork failed\"}\n");
            fflush(stdout);
            return 1;
        }

        if (pid == 0) {
            /* Create new session to detach from parent terminal process group */
            setsid();

            /* Apply resource constraints prior to execvp */
            if (apply_resource_limits(cpu_sec, mem_mb) != 0) {
                fprintf(stderr, "Failed to apply resource limits\n");
                exit(1);
            }
            execvp(cmd, cmd_argv);
            perror("execvp failed");
            exit(127);
        }

        /* Parent process */
        printf("{\"status\": \"RUNNING\", \"pid\": %d, \"error\": null}\n", (int)pid);
        fflush(stdout);
        return 0;

    } else if (strcmp(action, "status") == 0) {
        pid_t target_pid = 0;
        int blocking = 0;

        for (int i = 2; i < argc; i++) {
            if (strcmp(argv[i], "--pid") == 0 && i + 1 < argc) {
                target_pid = (pid_t)atoi(argv[++i]);
            } else if (strcmp(argv[i], "--block") == 0) {
                blocking = 1;
            }
        }

        if (target_pid <= 0) {
            printf("{\"error\": \"Invalid or missing --pid\"}\n");
            fflush(stdout);
            return 1;
        }

        int exit_code = 0;
        int term_sig = 0;
        char state_buf[16] = {0};

        monitor_process(target_pid, blocking, &exit_code, &term_sig, state_buf);
        printf("{\"pid\": %d, \"status\": \"%s\", \"exit_code\": %d, \"term_sig\": %d}\n",
               (int)target_pid, state_buf, exit_code, term_sig);
        fflush(stdout);
        return 0;

    } else if (strcmp(action, "stop") == 0) {
        pid_t target_pid = 0;
        int grace_sec = 2;
        int force_kill = 0;

        for (int i = 2; i < argc; i++) {
            if (strcmp(argv[i], "--pid") == 0 && i + 1 < argc) {
                target_pid = (pid_t)atoi(argv[++i]);
            } else if (strcmp(argv[i], "--grace") == 0 && i + 1 < argc) {
                grace_sec = atoi(argv[++i]);
            } else if (strcmp(argv[i], "--kill") == 0) {
                force_kill = 1;
            }
        }

        if (target_pid <= 0) {
            printf("{\"error\": \"Invalid or missing --pid\"}\n");
            fflush(stdout);
            return 1;
        }

        int res = 0;
        if (force_kill) {
            res = force_kill_process(target_pid);
        } else {
            res = stop_process(target_pid, grace_sec);
        }

        if (res == 0) {
            printf("{\"pid\": %d, \"status\": \"STOPPED\", \"error\": null}\n", (int)target_pid);
        } else {
            printf("{\"pid\": %d, \"status\": \"FAILED\", \"error\": \"stop signal failed\"}\n", (int)target_pid);
        }
        fflush(stdout);
        return 0;

    } else {
        print_usage();
        return 1;
    }
}
