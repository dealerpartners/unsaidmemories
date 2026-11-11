#!/usr/bin/env bash
# Runs ON the Lightsail instance (invoked by the GitHub Actions deploy
# workflow over SSH, or by hand). Pulls main, installs, builds, stages
# the standalone bundle, restarts the service, and health-checks it.
set -euo pipefail
export PATH="$HOME/.bun/bin:$PATH"

cd /home/ubuntu/unsaid
git fetch origin main
git reset --hard origin/main

bun install
# The previous deploy's staged standalone bundle lives inside .next/;
# the build's cleanup chokes on it (ENOTEMPTY). Remove it first — with
# the service stopped, because the running server writes its cache into
# the bundle and the delete fails partway, corrupting it.
sudo systemctl stop unsaid || true
rm -rf .next/standalone
bun run build

# Next standalone output needs public/ and .next/static beside server.js.
cp -r public .next/standalone/
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/

sudo systemctl restart unsaid

for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3000/ >/dev/null; then
    echo "deploy healthy"
    exit 0
  fi
  sleep 2
done
echo "health check failed after restart" >&2
exit 1
