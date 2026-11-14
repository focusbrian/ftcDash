@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem --- Find Node.js: PATH first, then a normal Windows install, then the portable copy kept here.
set "NODE_HOME="
where node >nul 2>nul
if not errorlevel 1 set "NODE_HOME=PATH"
if not defined NODE_HOME if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_HOME=%ProgramFiles%\nodejs"
if not defined NODE_HOME if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_HOME=%ProgramFiles(x86)%\nodejs"
if not defined NODE_HOME if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_HOME=%LOCALAPPDATA%\Programs\nodejs"
if not defined NODE_HOME if exist "%~dp0.node\node.exe" set "NODE_HOME=%~dp0.node"

if not defined NODE_HOME goto :noNode
rem npm scripts shell out to `node`, so the runtime has to be on PATH for the child processes too.
if "%NODE_HOME%"=="PATH" goto :runtimeReady
set "PATH=%NODE_HOME%;%PATH%"

:runtimeReady
for /f "delims=" %%v in ('node --version') do set "NODE_VERSION=%%v"
echo Using Node %NODE_VERSION%

if exist "node_modules\vite\package.json" goto :depsReady
echo Installing dependencies - this runs once and takes a minute...
call npm install
if errorlevel 1 goto :failed

:depsReady
echo.
echo   Starting the dev server - Vite prints its address below (http://localhost:5173 by default).
echo   Close this window or press Ctrl+C to stop it.
echo.
call npm run dev -- --open %*
if errorlevel 1 goto :failed
exit /b 0

:noNode
echo.
echo   Node.js is not installed, so FTCDash cannot start yet.
echo.
echo   Install the LTS build from https://nodejs.org/en/download, then run this file again.
echo.
pause
exit /b 1

:failed
echo.
echo   The last command failed - the messages above say why.
echo.
pause
exit /b 1
