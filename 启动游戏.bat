@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 阈限深水区

rem 某些终端环境会预设这个变量，不清理的话 Electron 会当成 node 执行
set "ELECTRON_RUN_AS_NODE="
set "ELECTRON=node_modules\electron\dist\electron.exe"

where node >nul 2>&1 || goto no-node
if not exist "%ELECTRON%" goto no-runtime

node "scripts\needs-build.mjs"
if not errorlevel 1 goto launch

:build
echo.
echo   源码有更新，正在构建，请稍候……
echo.
call npm run build
if errorlevel 1 goto build-failed

:launch
start "" "%ELECTRON%" .
exit /b 0

:no-node
echo.
echo   没有找到 Node.js。请先安装 Node 18 或更高版本。
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

:build-failed
echo.
echo   构建失败，请查看上面的报错。
echo.
pause
exit /b 1
