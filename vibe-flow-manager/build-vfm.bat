@echo off
setlocal
echo ========================================================
echo   Vibe Flow Manager Build Script
echo ========================================================

:: 1. Force close running instances
echo [1/5] Closing running instances...
taskkill /F /IM "Vibe Flow Manager.exe" 2>nul
taskkill /F /IM "electron.exe" 2>nul

:: 2. Clean previous build artifacts
echo [2/5] Cleaning previous build artifacts...
if exist "dist" rmdir /s /q "dist"
if exist "release" rmdir /s /q "release"

:: 2. Set environment variables to skip code signing
echo [2/4] Configuring environment...
set CSC_IDENTITY_AUTO_DISCOVERY=false

:: 3. Clean Electron Builder Cache (Optional but recommended for fix)
echo [3/4] Checking Electron Builder cache...
:: Uncomment the next line if you want to force clean cache every time
:: rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" 2>nul

:: 4. Run Build
echo [4/4] Starting Build (Vite + Electron Builder)...
echo.
call npm run dist

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Build failed with error code %ERRORLEVEL%.
    echo Please check the error messages above.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================================
echo   Build Successful!
echo   Output: release\win-unpacked\Vibe Flow Manager.exe
echo ========================================================
pause
