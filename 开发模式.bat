@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title 阈限深水区 · 开发模式

set "ELECTRON_RUN_AS_NODE="
set "ELECTRON=node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON%" goto no-runtime

rem 开发服务器已经在跑就直接连上，免得 vite 换到 5174 而窗口还连 5173
curl -s -o nul --max-time 2 http://127.0.0.1:5173/ >nul 2>&1
if not errorlevel 1 goto go

echo.
echo   启动 Vite 开发服务器（另开的那个最小化窗口，用完记得关）……
echo.
start "vite" /min cmd /c "npm run dev"

set /a n=0
:wait
set /a n+=1
curl -s -o nul --max-time 2 http://127.0.0.1:5173/ >nul 2>&1
if not errorlevel 1 goto go
if !n! geq 25 goto timeout
ping -n 2 127.0.0.1 >nul
goto wait

:go
start "" "%ELECTRON%" . --dev
exit /b 0

:timeout
echo.
echo   开发服务器 25 秒内没有就绪，请检查那个最小化的 vite 窗口。
echo.
pause
exit /b 1

:no-runtime
echo.
echo   找不到 Electron 运行时。
echo   请先在项目目录执行：npm install
echo.
pause
exit /b 1
