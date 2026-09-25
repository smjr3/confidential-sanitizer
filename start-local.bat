@echo off
setlocal
cd /d "%~dp0"
if not exist "package.json" (
  echo package.json was not found. Extract the whole source ZIP first.
  pause
  exit /b 1
)
if not exist "package-lock.json" (
  echo package-lock.json was not found. Extract the whole source ZIP first.
  pause
  exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  call npm.cmd ci
  if errorlevel 1 (
    echo npm ci failed. Check the message above.
    pause
    exit /b 1
  )
)
echo Starting the local preview. Press Ctrl+C to stop.
call npm.cmd run dev -- --host 127.0.0.1 --open
if errorlevel 1 pause
