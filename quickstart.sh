#!/usr/bin/env bash
# Readiness Hub v2 quickstart: docker compose up with a working .env.
# Usage: ./quickstart.sh [--demo]
#   --demo   seed the synthetic demo dataset after startup (safe, fake members)
set -euo pipefail
cd "$(dirname "$0")"

DEMO=0
for arg in "$@"; do
  case "$arg" in
    --demo) DEMO=1 ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
  esac
done

command -v docker >/dev/null || { echo "docker is required: https://docs.docker.com/get-docker/"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose v2 is required"; exit 1; }

if [ ! -f .env ]; then
  echo "Creating .env from env.example with generated secrets..."
  cp env.example .env
  gen() { openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
  DB_PW="$(gen 24)"; SESSION="$(gen 32)"
  # portable in-place edit (BSD and GNU sed)
  sed -i.bak -e "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PW}|" \
             -e "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION}|" .env
  rm -f .env.bak
  echo "Wrote .env (AUTH_MODE=dev). Edit it to enable Google sign-in."
fi

echo "Building and starting containers..."
docker compose up -d --build

echo -n "Waiting for the app to become healthy"
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:${APP_PORT:-8080}/healthz" >/dev/null 2>&1; then
    echo " ok"
    break
  fi
  echo -n "."
  sleep 2
done

if [ "$DEMO" = "1" ]; then
  echo "Seeding the synthetic demo dataset..."
  docker compose exec -T app node dist/cli.js seed-demo
fi

PORT="$(grep -E '^APP_PORT=' .env | cut -d= -f2)"
echo
echo "Readiness Hub v2 is running: http://localhost:${PORT:-8080}"
echo "Next steps:"
echo "  - Sign in (dev mode: pick a role on the login page)"
echo "  - Load data: Admin > Ingest (upload a CAPWATCH ZIP), or ./quickstart.sh --demo"
echo "  - Logs: docker compose logs -f app"
