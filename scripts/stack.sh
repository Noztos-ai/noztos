#!/usr/bin/env bash
# scripts/stack.sh — Runs the Next.js web + companion daemon as a single
# process group, with bullet-proof shutdown.
#
# Why this exists:
#   `concurrently -k` (what we used before) forwards SIGTERM to its
#   direct children but doesn't propagate to grandchildren. So PTYs
#   spawned by the daemon, ngrok subprocesses, and node-pty's native
#   spawn-helper become orphans on Ctrl+C — eternal zombies. The
#   terminal hangs because concurrently keeps waiting for the children
#   to exit; some of them never do.
#
# This script:
#   • Runs both processes in our own process group.
#   • Traps INT/TERM and calls `kill -TERM 0` (kills the *whole* group,
#     including grandchildren — anything spawned by Next or the daemon).
#   • Waits 2 s for graceful exits, then `kill -KILL 0` for anything
#     still alive. After that the script exits and the terminal is freed.
#
# Result: a single Ctrl+C kills Next, the daemon, every PTY, ngrok, and
# the node-pty spawn-helper. Nothing survives.

# NOTE: do NOT use `set -m`. Job control puts each background process
# into its OWN process group, which is exactly what we DON'T want —
# `kill 0` only reaches the current pgrp, so isolating children
# defeats the cleanup. Without it (the script default), children
# inherit our group and `kill -TERM 0` cascades to them all.

MODE="${1:-dev}"  # 'dev' or 'go'

# Reentry guard — cleanup runs once. The EXIT trap re-fires on every
# exit path (including `exit` inside cleanup itself); without this
# guard the script would loop or double-kill.
CLEANED=0

# Recursive process-tree killer. `kill 0` (group) misses children
# that set their own pgid — most notably Next.js's `next-server`
# worker, which lives in a different process group than `next start`
# so it can be restarted independently. We walk the tree from the
# PIDs we explicitly spawned, catching descendants before they
# re-parent to init after their immediate parent dies.
kill_tree() {
  local pid=$1
  local signal=$2
  local children
  children=$(pgrep -P "$pid" 2>/dev/null)
  for child in $children; do
    kill_tree "$child" "$signal"
  done
  kill -"$signal" "$pid" 2>/dev/null
}

cleanup() {
  if [ "$CLEANED" = "1" ]; then return; fi
  CLEANED=1
  # Disarm the trap so `exit` below doesn't re-enter via EXIT.
  trap - INT TERM EXIT
  echo ""
  echo "  ⏹  Shutting down stack..."
  # Belt + suspenders + parachute. Three independent kill paths
  # because each catches a different leak class:
  #
  #   1. kill_tree by PID  — catches direct + grand-children
  #      while parent still alive (before they re-parent to init).
  #   2. kill 0 by group   — catches anything still in our pgrp.
  #   3. pkill by name     — catches detached workers that fled
  #      to their own pgrp (next-server is the prime offender; we
  #      also sweep the daemon binary + ngrok by name as backstops).
  #
  # SIGTERM phase first so daemon.stop() runs (kills PTYs + ngrok +
  # flushes sync worker cleanly).
  kill_tree "$WEB_PID"    TERM 2>/dev/null
  kill_tree "$DAEMON_PID" TERM 2>/dev/null
  kill -TERM 0 2>/dev/null || true
  pkill -TERM -f "next-server"       2>/dev/null || true
  pkill -TERM -f "bornastar.js start" 2>/dev/null || true
  pkill -TERM ngrok                   2>/dev/null || true

  # 2-second grace window for clean shutdown.
  sleep 2

  # Nuclear phase. SIGKILL doesn't ask permission.
  kill_tree "$WEB_PID"    KILL 2>/dev/null
  kill_tree "$DAEMON_PID" KILL 2>/dev/null
  kill -KILL 0 2>/dev/null || true
  pkill -KILL -f "next-server"       2>/dev/null || true
  pkill -KILL -f "bornastar.js start" 2>/dev/null || true
  pkill -KILL ngrok                   2>/dev/null || true

  exit 0
}

# INT/TERM are the signals the terminal / parent can deliver.
trap cleanup INT TERM EXIT

# Spawn the web side. Both processes inherit the parent group so
# `kill -TERM 0` reaches them.
if [ "$MODE" = "go" ]; then
  NOZTOS_LOCAL_DEV=1 next start &
else
  NOZTOS_LOCAL_DEV=1 next dev &
fi
WEB_PID=$!

# Spawn the companion daemon.
NOZTOS_LOCAL_DEV=1 node companion/dist/bin/bornastar.js start &
DAEMON_PID=$!

# Watcher loop — `wait -n` would be cleaner but needs bash 4+ which
# macOS doesn't ship by default. Poll instead: as soon as one child
# dies (crash, manual kill), exit so the trap fires and brings down
# the other.
while kill -0 "$WEB_PID" 2>/dev/null && kill -0 "$DAEMON_PID" 2>/dev/null; do
  sleep 1
done
