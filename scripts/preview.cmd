@echo off
cd /d "%~dp0"
node preview-server.mjs
if errorlevel 1 pause
