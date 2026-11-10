#!/bin/bash
# .zscripts/dev.sh — launched by /start.sh at boot (subprocess of tini/PID 1).
# This runs in the ROOT context, so it SURVIVES bash tool calls ending.
# IMPORTANT: respawning loop so next-server restarts if it OOMs.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# One-time: install deps (skip db:push — Prisma was stripped)
if [ ! -d "node_modules/next" ]; then
  echo "[DEV] Installing dependencies..."
  bun install 2>&1 | tail -5
fi

# Respawning loop — keep the dev server alive forever
while true; do
  echo "[DEV] $(date) Starting Next.js dev server..."
  bun run dev 2>&1
  EXIT_CODE=$?
  echo "[DEV] $(date) Server exited (code $EXIT_CODE). Restarting in 3s..."
  sleep 3
done
