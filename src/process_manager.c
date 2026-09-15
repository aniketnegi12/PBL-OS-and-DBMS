#include "process_manager.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/wait.h>
#include <signal.h>
#include <errno.h>

int spawn_process(const char *command, char *const argv[], pid_t *out_pid) {
    if (!command || !out_pid) return -1;

    pid_t pid = fork();
    if (pid < 0) {
        perror("fork failed");
        return -1;
    }

    if (pid == 0) {
        /* Child process execution context */
        if (argv && argv[0]) {
            execvp(command, argv);
        } else {
            /* If no argv provided, parse command string */
            char *cmd_copy = strdup(command);
            char *tokens[64];
            int token_count = 0;
            char *token = strtok(cmd_copy, " ");
            while (token && token_count < 63) {
                tokens[token_count++] = token;
                token = strtok(NULL, " ");
            }
            tokens[token_count] = NULL;
            execvp(tokens[0], tokens);
            free(cmd_copy);
        }
        /* If execvp returns, execution failed */
        perror("execvp failed");
        exit(127);
    }

    /* Parent process */
    *out_pid = pid;
    return 0;
}

int monitor_process(pid_t pid, int blocking, int *out_exit_code, int *out_term_sig, char *out_state) {
    if (pid <= 0 || !out_state) return -1;

    if (out_exit_code) *out_exit_code = 0;
    if (out_term_sig) *out_term_sig = 0;

    int status = 0;
    int options = blocking ? 0 : WNOHANG;
    pid_t res = waitpid(pid, &status, options);

    if (res == 0) {
        /* Direct child process is still running */
        strncpy(out_state, STATE_RUNNING, 16);
        return 0;
    } else if (res == pid) {
        /* Direct child process state changed or exited */
        if (WIFEXITED(status)) {
            int code = WEXITSTATUS(status);
            if (out_exit_code) *out_exit_code = code;
            if (code == 0) {
                strncpy(out_state, STATE_EXITED, 16);
            } else {
                strncpy(out_state, STATE_FAILED, 16);
            }
        } else if (WIFSIGNALED(status)) {
            int sig = WTERMSIG(status);
            if (out_term_sig) *out_term_sig = sig;
            strncpy(out_state, STATE_FAILED, 16);
        } else {
            strncpy(out_state, STATE_FAILED, 16);
        }
        return res;
    } else {
        /* Not the direct parent process (errno == ECHILD) or general PID check */
        if (errno == ECHILD) {
            /* Use POSIX kill(pid, 0) probe to test process existence */
            if (kill(pid, 0) == 0 || errno == EPERM) {
                strncpy(out_state, STATE_RUNNING, 16);
                return 0;
            } else if (errno == ESRCH) {
                strncpy(out_state, STATE_EXITED, 16);
                return pid;
            }
        }
        strncpy(out_state, STATE_FAILED, 16);
        return -1;
    }
}
