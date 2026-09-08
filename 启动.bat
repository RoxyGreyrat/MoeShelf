@echo off
setlocal
cd /d "%~dp0"
echo [bat] start >> start-bat.log
where node >> start-bat.log 2>&1
echo [bat] about to run node >> start-bat.log
node launcher.js
echo [bat] node exited %errorlevel% >> start-bat.log
if %errorlevel% neq 0 (
  echo.
  echo [ERROR] Launcher exited abnormally. Check launcher.log / start-bat.log
  echo If "node" is not recognized, install Node.js 18+ and enable "Add to PATH".
)
pause
