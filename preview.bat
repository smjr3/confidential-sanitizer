@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.12 or newer is required.
  pause
  exit /b 1
)
if not exist "src\main.ts" if exist "bin\confidential-sanitizer.mjs" (
  node bin\confidential-sanitizer.mjs serve
  if errorlevel 1 (
    pause
    exit /b 1
  )
  exit /b 0
)
if exist "package.json" (
  if not exist "package-lock.json" (
    echo package-lock.json was not found. Extract the whole source ZIP first.
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
  echo Starting local development view. Press Ctrl+C to stop.
  call npm.cmd run dev -- --host 127.0.0.1 --open
  if errorlevel 1 (
    pause
    exit /b 1
  )
  exit /b 0
)
if exist "index.html" if exist "preview-server.mjs" (
  echo Starting CI artifact view. Press Ctrl+C to stop.
  node preview-server.mjs
  if errorlevel 1 (
    pause
    exit /b 1
  )
  exit /b 0
)
echo Required files were not found. Extract the whole ZIP first.
pause
exit /b 1
