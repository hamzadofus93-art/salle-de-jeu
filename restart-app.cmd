@echo off
setlocal

for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
  taskkill /PID %%p /F >nul 2>&1
)

timeout /t 1 >nul
cd /d "%~dp0server"
call cmd /c npm run start
