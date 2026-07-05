@echo off
setlocal EnableDelayedExpansion

:: Talos Control Panel - Windows launcher.
::
:: Reads paths from talos-cp-config.bat (next to this script), sets up
:: whatever isn't already set up (Talos venv + editable install, control
:: panel backend venv + deps, frontend node_modules), then runs the backend
:: in the foreground (its logs are the only thing printed to this window)
:: and the frontend hidden in the background, output sent to frontend.log.
:: Opens the browser once the frontend responds. Ctrl+C (or closing the
:: backend) stops the frontend too.

if "%~1"=="openWhenReady" goto :openWhenReady

set "SCRIPT_DIR=%~dp0"
call "%SCRIPT_DIR%talos-cp-config.bat"

if not defined TALOS_ROOT (
    echo [error] TALOS_ROOT not set. Edit talos-cp-config.bat first.
    exit /b 1
)
if not defined CP_ROOT (
    echo [error] CP_ROOT not set. Edit talos-cp-config.bat first.
    exit /b 1
)
if not defined CP_BACKEND_PORT set "CP_BACKEND_PORT=8420"
if not defined CP_FRONTEND_PORT set "CP_FRONTEND_PORT=5173"
if not defined TALOS_HOME set "TALOS_HOME=%USERPROFILE%\.talos"
if not defined NPM_EXE (
    echo [error] NPM_EXE not set. Edit talos-cp-config.bat to point at your npm.cmd.
    exit /b 1
)

set "TALOS_VENV=%TALOS_ROOT%\.venv"
set "CP_BACKEND_DIR=%CP_ROOT%\backend"
set "CP_FRONTEND_DIR=%CP_ROOT%\frontend"
set "CP_BACKEND_VENV=%CP_BACKEND_DIR%\.venv"
set "FRONTEND_LOG=%CP_ROOT%\frontend.log"
set "FRONTEND_ERR_LOG=%CP_ROOT%\frontend-error.log"
set "PID_FILE=%CP_ROOT%\.frontend.pid"

echo == Talos Control Panel launcher ==

where python >nul 2>&1
if errorlevel 1 (
    echo [error] python not found in PATH. Install Python 3 and try again.
    exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
    echo [error] node not found in PATH. Install Node.js and try again.
    exit /b 1
)
if not exist "%NPM_EXE%" (
    echo [error] NPM_EXE points at a file that doesn't exist: %NPM_EXE%
    echo         Edit talos-cp-config.bat with the correct path to npm.cmd.
    exit /b 1
)
where curl >nul 2>&1
if errorlevel 1 (
    echo [warn] curl not found - browser will not auto-open.
)

:: ---- 1. Talos core venv + editable install ----
if not exist "%TALOS_VENV%\Scripts\python.exe" (
    echo [setup] Creating Talos venv at %TALOS_VENV%
    python -m venv "%TALOS_VENV%"
    "%TALOS_VENV%\Scripts\python.exe" -m pip install --upgrade pip
    echo [setup] Installing talos package from %TALOS_ROOT%
    "%TALOS_VENV%\Scripts\python.exe" -m pip install -e "%TALOS_ROOT%"
) else (
    echo [setup] Talos venv OK
)

:: ---- 2. Control panel backend venv + deps ----
if not exist "%CP_BACKEND_VENV%\Scripts\python.exe" (
    echo [setup] Creating control panel backend venv
    python -m venv "%CP_BACKEND_VENV%"
    "%CP_BACKEND_VENV%\Scripts\python.exe" -m pip install --upgrade pip
    "%CP_BACKEND_VENV%\Scripts\python.exe" -m pip install -r "%CP_BACKEND_DIR%\requirements.txt"
) else (
    echo [setup] Control panel backend venv OK
)

:: ---- 3. Frontend deps ----
if not exist "%CP_FRONTEND_DIR%\node_modules" (
    echo [setup] Installing frontend dependencies ^(npm install^)
    pushd "%CP_FRONTEND_DIR%"
    call "%NPM_EXE%" install
    popd
) else (
    echo [setup] Frontend node_modules OK
)

set "TALOS_PYTHON=%TALOS_VENV%\Scripts\python.exe"
set "CP_PORT=%CP_BACKEND_PORT%"
set "VITE_API_BASE=http://127.0.0.1:%CP_BACKEND_PORT%"

:: ---- 4. Frontend hidden in background, output only to log files ----
echo [run] Starting frontend in background (logs -^> %FRONTEND_LOG%)
if exist "%PID_FILE%" del "%PID_FILE%"
powershell -NoProfile -Command "$p = Start-Process -FilePath '%NPM_EXE%' -ArgumentList 'run','dev','--','--port','%CP_FRONTEND_PORT%','--strictPort' -WorkingDirectory '%CP_FRONTEND_DIR%' -WindowStyle Hidden -RedirectStandardOutput '%FRONTEND_LOG%' -RedirectStandardError '%FRONTEND_ERR_LOG%' -PassThru; $p.Id | Out-File -Encoding ascii '%PID_FILE%'"

:: ---- 5. Open browser once frontend responds (detached watcher) ----
start "" /min cmd /c "%~f0" openWhenReady

:: ---- 6. Backend in the foreground - the only visible logs ----
echo [run] Starting backend on port %CP_BACKEND_PORT% - press Ctrl+C to stop everything
cd /d "%CP_BACKEND_DIR%"
"%CP_BACKEND_VENV%\Scripts\python.exe" -m uvicorn talos_ui.main:app --reload --host 127.0.0.1 --port %CP_BACKEND_PORT%

:: ---- 7. Cleanup frontend once backend stops ----
echo [run] Backend stopped, cleaning up frontend...
if exist "%PID_FILE%" (
    set /p FRONTEND_PID=<"%PID_FILE%"
    powershell -NoProfile -Command "Stop-Process -Id !FRONTEND_PID! -Force -ErrorAction SilentlyContinue; Get-CimInstance Win32_Process -Filter ('ParentProcessId=' + !FRONTEND_PID!) | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
    del "%PID_FILE%"
)
goto :eof

:openWhenReady
set "FRONTEND_URL=http://localhost:%CP_FRONTEND_PORT%"
for /L %%i in (1,1,40) do (
    curl -s -o nul "%FRONTEND_URL%" 2>nul
    if not errorlevel 1 (
        start "" "%FRONTEND_URL%"
        exit /b
    )
    timeout /t 1 >nul
)
exit /b