@echo off
echo ========================================================
echo   Starting Vibe Flow Manager (Dev Mode)
echo ========================================================

cd /d "%~dp0"

echo Closing running instances...
taskkill /F /IM "Vibe Flow Manager.exe" 2>nul
taskkill /F /IM "electron.exe" 2>nul

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo Starting application (Dev Mode with Hot Reload)...
call npm run dev

pause
