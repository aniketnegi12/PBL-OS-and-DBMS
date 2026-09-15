CC = gcc
CFLAGS = -Wall -Wextra -std=c99 -I./src
TARGET = containeros-runtime

SRCS = src/process_manager.c src/control_manager.c src/main_runtime.c
OBJS = $(SRCS:.c=.o)

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $(OBJS)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f src/*.o $(TARGET)

.PHONY: all clean
