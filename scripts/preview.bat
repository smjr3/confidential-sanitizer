@echo off
setlocal
cd /d "%~dp0"
if not exist "index.html" (
  echo index.html was not found. Extract the whole artifact ZIP first.
  pause
  exit /b 1
)
if not exist "preview-server.mjs" (
  echo preview-server.mjs was not found. Extract the whole artifact ZIP first.
  pause
  exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
node preview-server.mjs
if errorlevel 1 pause
