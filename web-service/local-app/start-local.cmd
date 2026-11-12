@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist public\app.js (
  echo 먼저 npm install 과 npm run build 를 실행해 주세요.
  pause
  exit /b 1
)
echo HyperRx: http://127.0.0.1:8787
node --env-file-if-exists=.env launch.mjs --open
pause
