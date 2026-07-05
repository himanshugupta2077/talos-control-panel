@echo off
:: ---------------------------------------------------------------------------
:: Talos Control Panel - Windows path configuration
:: Edit these values to match this machine, then run run-talos-cp.bat
:: ---------------------------------------------------------------------------

:: Root of the main Talos repo (contains pyproject.toml, the talos\ package)
set "TALOS_ROOT=C:\Users\YOURNAME\talos"

:: Root of the talos-control-panel repo (contains backend\ and frontend\)
set "CP_ROOT=C:\Users\YOURNAME\talos-control-panel"

:: Full path to npm.cmd for your standalone Node.js install. The script uses
:: this directly instead of relying on npm being resolved via PATH.
set "NPM_EXE=C:\Program Files\nodejs\npm.cmd"

:: Talos's on-disk state (registry.json, per-project SQLite dbs). Leave as
:: default unless you've pointed Talos somewhere else.
set "TALOS_HOME=%USERPROFILE%\.talos"

:: Ports
set "CP_BACKEND_PORT=8420"
set "CP_FRONTEND_PORT=5173"