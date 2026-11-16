#!/usr/bin/env bash
# One-command CloudCost IQ: build containers and open the UI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"
CMD="${1:-up}"

need_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required. Install Docker Desktop / Engine, then retry." >&2
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "Docker Compose v2 is required (docker compose)." >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not running. Start it, then retry:" >&2
    echo "  sudo service docker start" >&2
    echo "  # or open Docker Desktop" >&2
    exit 1
  fi
}

ensure_env() {
  if [[ ! -f backend/.env ]]; then
    echo "Creating backend/.env from .env.example…"
    cp backend/.env.example backend/.env
  fi
}

wait_for_ui() {
  local tries=60
  echo -n "Waiting for UI"
  for ((i = 1; i <= tries; i++)); do
    if curl -fsS "$URL" >/dev/null 2>&1; then
      echo " ready."
      return 0
    fi
    echo -n "."
    sleep 1
  done
  echo
  echo "Containers are up, but the UI did not respond yet. Check: ./run.sh logs" >&2
  return 1
}

open_browser() {
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  fi
}

case "$CMD" in
  up|start|run|"")
    need_docker
    ensure_env
    echo "Building and starting CloudCost IQ…"
    docker compose up --build -d
    wait_for_ui || true
    echo
    echo "CloudCost IQ is running → $URL"
    echo "  logs:  ./run.sh logs"
    echo "  stop:  ./run.sh stop"
    open_browser
    ;;
  stop|down)
    need_docker
    docker compose down
    echo "Stopped."
    ;;
  restart)
    need_docker
    ensure_env
    docker compose down
    docker compose up --build -d
    wait_for_ui || true
    echo "Restarted → $URL"
    open_browser
    ;;
  logs)
    need_docker
    docker compose logs -f --tail=100
    ;;
  status)
    need_docker
    docker compose ps
    ;;
  *)
    echo "Usage: ./run.sh [up|stop|restart|logs|status]"
    exit 1
    ;;
esac
