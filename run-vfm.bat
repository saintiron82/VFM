@echo off
chcp 65001 >nul
cd /d "%~dp0\vibe-flow-manager"

echo ===================================
echo   Vibe Flow Manager
echo ===================================
echo.

:: dist 폴더 확인
if not exist "dist\index.html" (
    echo [빌드 필요] 첫 실행...
    call npm run build
    if errorlevel 1 (
        echo 빌드 실패!
        pause
        exit /b 1
    )
)

echo 앱 시작...
start "" npm run electron
