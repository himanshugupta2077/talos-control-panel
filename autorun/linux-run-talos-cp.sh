#!/usr/bin/env bash
#
# Talos Control Panel — Linux launcher.
#
# Reads paths from talos-cp.env (next to this script), sets up whatever
# isn't already set up (Talos venv + editable install, control-panel backend
# venv + deps, frontend node_modules), then runs the backend in the
# foreground (its logs are the only thing printed to this terminal) and the
# frontend in the background with its output sent to frontend.log. Opens the
# browser once the frontend responds. Ctrl+C stops both.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/talos-cp.env"

if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "[error] Missing config file: $CONFIG_FILE"
    exit 1
fi
# shellcheck disable=SC1090
source "$CONFIG_FILE"

: "${TALOS_ROOT:?TALOS_ROOT not set in $CONFIG_FILE}"
: "${CP_ROOT:?CP_ROOT not set in $CONFIG_FILE}"
: "${CP_BACKEND_PORT:=8420}"
: "${CP_FRONTEND_PORT:=5173}"
: "${TALOS_HOME:=$HOME/.talos}"
TALOS_VENV="${TALOS_VENV:-$TALOS_ROOT/.venv}"

CP_BACKEND_DIR="$CP_ROOT/backend"
CP_FRONTEND_DIR="$CP_ROOT/frontend"
CP_BACKEND_VENV="$CP_BACKEND_DIR/.venv"
FRONTEND_LOG="$CP_ROOT/frontend.log"

echo "== Talos Control Panel launcher =="

for bin in python3 node npm; do
    command -v "$bin" >/dev/null 2>&1 || { echo "[error] '$bin' not found in PATH"; exit 1; }
done

# ---- 1. Talos core venv + editable install ----
if [[ ! -x "$TALOS_VENV/bin/python" ]]; then
    echo "[setup] Creating Talos venv at $TALOS_VENV"
    python3 -m venv "$TALOS_VENV"
    "$TALOS_VENV/bin/pip" install --upgrade pip
    echo "[setup] Installing talos package from $TALOS_ROOT"
    "$TALOS_VENV/bin/pip" install -e "$TALOS_ROOT"
else
    echo "[setup] Talos venv OK ($TALOS_VENV)"
fi

# ---- 2. Control panel backend venv + deps ----
if [[ ! -x "$CP_BACKEND_VENV/bin/python" ]]; then
    echo "[setup] Creating control panel backend venv"
    python3 -m venv "$CP_BACKEND_VENV"
    "$CP_BACKEND_VENV/bin/pip" install --upgrade pip
    "$CP_BACKEND_VENV/bin/pip" install -r "$CP_BACKEND_DIR/requirements.txt"
else
    echo "[setup] Control panel backend venv OK"
fi

# ---- 3. Frontend deps ----
if [[ ! -d "$CP_FRONTEND_DIR/node_modules" ]]; then
    echo "[setup] Installing frontend dependencies (npm install)"
    (cd "$CP_FRONTEND_DIR" && npm install)
else
    echo "[setup] Frontend node_modules OK"
fi

export TALOS_HOME TALOS_ROOT
export TALOS_PYTHON="$TALOS_VENV/bin/python"
export CP_PORT="$CP_BACKEND_PORT"
export VITE_API_BASE="http://127.0.0.1:${CP_BACKEND_PORT}"

# ---- 4. Frontend in background, output only to log file ----
echo "[run] Starting frontend in background (logs -> $FRONTEND_LOG)"
(
  cd "$CP_FRONTEND_DIR"
  npm run dev -- --port "$CP_FRONTEND_PORT" --strictPort
) > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

cleanup() {
    echo ""
    echo "[run] Shutting down frontend (pid $FRONTEND_PID)..."
    kill "$FRONTEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ---- 5. Open browser once frontend responds ----
FRONTEND_URL="http://localhost:${CP_FRONTEND_PORT}"
if command -v curl >/dev/null 2>&1; then
    (
        for _ in $(seq 1 40); do
            if curl -s -o /dev/null "$FRONTEND_URL"; then
                if command -v xdg-open >/dev/null 2>&1; then
                    xdg-open "$FRONTEND_URL" >/dev/null 2>&1 || true
                else
                    echo "[run] Frontend ready: $FRONTEND_URL"
                fi
                break
            fi
            sleep 0.5
        done
    ) &
else
    echo "[warn] curl not found — open $FRONTEND_URL manually once it's up"
fi

# ---- 6. Backend in the foreground — the only visible logs ----
echo "[run] Starting backend on port $CP_BACKEND_PORT (Ctrl+C to stop everything)"
cd "$CP_BACKEND_DIR"
"$CP_BACKEND_VENV/bin/python" -m uvicorn talos_ui.main:app --reload --host 127.0.0.1 --port "$CP_BACKEND_PORT"
