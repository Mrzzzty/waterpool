@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 打包 Windows 便携版

set "ELECTRON_RUN_AS_NODE="

echo.
echo   [1/2] 构建前端……
call npm run build
if errorlevel 1 goto fail

echo.
echo   [2/2] 打包 exe，首次会下载 Electron 运行时（约 140 MB）……
echo.
call npx electron-builder --win portable
if errorlevel 1 goto fail

echo.
echo   完成，产物在 release 目录。
echo.
pause
exit /b 0

:fail
echo.
echo   失败，请查看上面的报错。
echo.
pause
exit /b 1
