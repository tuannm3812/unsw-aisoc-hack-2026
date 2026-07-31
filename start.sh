#!/usr/bin/env bash
# Bring up Spatial Brain on macOS/Linux: install what is missing, seed the board,
# start both servers. Mirrors start.ps1 (the Windows version this repo shipped with).
#
#   ./start.sh              # start, keeping any existing board
#   ./start.sh --reset      # wipe and reseed first, for a clean rehearsal
#   ./start.sh --check      # install, seed, run the tests, then exit
#
# Backend on http://127.0.0.1:8010, canvas on http://localhost:3100.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PYTHON="$BACKEND/.venv/bin/python"

RESET=false
CHECK=false
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=true ;;
    --check) CHECK=true ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

step() { printf '\033[36m==> %s\033[0m\n' "$1"; }

# The mcp package needs Python >=3.10; macOS's default python3 is often older
# (3.9 here), so prefer a newer interpreter if one is installed via Homebrew.
PYTHON_BIN="python3"
for candidate in python3.12 python3.11 python3.10; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON_BIN="$candidate"
    break
  fi
done

if [ ! -x "$PYTHON" ]; then
  step "Creating the backend virtual environment (using $PYTHON_BIN)"
  "$PYTHON_BIN" -m venv "$BACKEND/.venv"
fi

step "Installing backend dependencies"
"$PYTHON" -m pip install --quiet --disable-pip-version-check -r "$BACKEND/requirements.txt"

if [ ! -d "$FRONTEND/node_modules" ]; then
  step "Installing frontend dependencies"
  (cd "$FRONTEND" && npm install --no-fund --no-audit)
fi

if [ "$RESET" = true ]; then
  step "Resetting and seeding the demo board"
  (cd "$BACKEND" && "$PYTHON" -m app.seed --reset)
else
  step "Seeding the demo board"
  (cd "$BACKEND" && "$PYTHON" -m app.seed)
fi

if [ "$CHECK" = true ]; then
  step "Running the unit tests"
  (cd "$BACKEND" && "$PYTHON" -m pytest)

  step "Typechecking the frontend"
  (cd "$FRONTEND" && npx tsc --noEmit)

  printf '\n\033[32mChecks passed. Start for real with ./start.sh\033[0m\n'
  exit 0
fi

# Ports 8010 and 3100 rather than the usual 8000 and 3000, which are often already
# taken on a laptop that has been running other projects all day.
cleanup() {
  step "Stopping servers"
  [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

step "Starting the API on http://127.0.0.1:8010"
(cd "$BACKEND" && "$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload) &
BACKEND_PID=$!

printf '\n\033[32mCanvas    http://localhost:3100\033[0m\n'
printf '\033[32mAPI docs  http://127.0.0.1:8010/docs\033[0m\n'
printf '\033[32mSign in   priya@spatialbrain.dev / spatial\033[0m\n\n'
printf 'Press Ctrl+C to stop both servers.\n\n'

step "Starting the canvas on http://localhost:3100"
(cd "$FRONTEND" && npm run dev)
