@echo off
setlocal
cd /d "%~dp0.."

echo Installing dependencies (with dev tools: vite, typescript)...
call npm.cmd install --include=dev
if errorlevel 1 exit /b 1

echo.
echo Starting TestDex UI at http://localhost:5173
call npm.cmd run dev -w web
endlocal
