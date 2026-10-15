@echo off
cd /d "%~dp0"
title Anime Cover Studio
set "PATH=%PATH%;C:\Program Files\nodejs"

where node >nul 2>nul
if errorlevel 1 goto NONODE

node launcher.mjs 8080
goto DONE

:NONODE
echo.
echo   [ERROR] Node.js not found.
echo.
echo   This tool needs Node.js to run a small local web server.
echo   Please install it (just click Next all the way):
echo.
echo       https://nodejs.org/
echo.
echo   Then double-click this file again.
echo.
pause
exit /b 1

:DONE
echo.
echo   Server stopped. Press any key to close.
pause >nul
