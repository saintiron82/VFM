@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ===================================
echo   Vibe Flow Manager 실행
echo ===================================
echo.

echo [1/2] 빌드 중...
call npm run build
if errorlevel 1 (
    echo 빌드 실패!
    pause
    exit /b 1
)

echo.
echo [2/2] 앱 실행 중...
call npm run electron
