@echo off
echo === Vibe Flow Manager 프로젝트 초기화 ===

cd /d "c:\Users\saintiron\claudeWorkFlow"

echo [1/5] 프로젝트 폴더 생성...
mkdir vibe-flow-manager 2>nul
cd vibe-flow-manager

echo [2/5] package.json 생성...
(
echo {
echo   "name": "vibe-flow-manager",
echo   "version": "0.1.0",
echo   "description": "바이브코딩 워크플로우 자동화 시스템",
echo   "main": "electron/main.js",
echo   "scripts": {
echo     "dev": "vite",
echo     "build": "vite build",
echo     "electron": "electron .",
echo     "start": "concurrently \"npm run dev\" \"wait-on http://localhost:5173 && electron .\""
echo   },
echo   "dependencies": {
echo     "react": "^18.2.0",
echo     "react-dom": "^18.2.0",
echo     "zustand": "^4.4.0",
echo     "@dnd-kit/core": "^6.1.0",
echo     "@dnd-kit/sortable": "^8.0.0"
echo   },
echo   "devDependencies": {
echo     "vite": "^5.0.0",
echo     "@vitejs/plugin-react": "^4.2.0",
echo     "electron": "^28.0.0",
echo     "concurrently": "^8.2.0",
echo     "wait-on": "^7.2.0"
echo   }
echo }
) > package.json

echo [3/5] 폴더 구조 생성...
mkdir electron 2>nul
mkdir electron\services 2>nul
mkdir src 2>nul
mkdir src\components 2>nul
mkdir src\store 2>nul
mkdir src\styles 2>nul
mkdir data 2>nul
mkdir data\projects 2>nul

echo [4/5] 기본 파일 생성...

REM index.html
(
echo ^<!DOCTYPE html^>
echo ^<html lang="ko"^>
echo ^<head^>
echo   ^<meta charset="UTF-8"^>
echo   ^<meta name="viewport" content="width=device-width, initial-scale=1.0"^>
echo   ^<title^>Vibe Flow Manager^</title^>
echo ^</head^>
echo ^<body^>
echo   ^<div id="root"^>^</div^>
echo   ^<script type="module" src="/src/main.jsx"^>^</script^>
echo ^</body^>
echo ^</html^>
) > index.html

REM vite.config.js
(
echo import { defineConfig } from 'vite'
echo import react from '@vitejs/plugin-react'
echo.
echo export default defineConfig^({
echo   plugins: [react^(^)],
echo   base: './',
echo   server: {
echo     port: 5173
echo   }
echo }^)
) > vite.config.js

echo [5/5] 완료!
echo.
echo 다음 단계: npm install 실행 필요
pause
