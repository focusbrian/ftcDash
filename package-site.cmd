@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem Builds the site and zips the contents of dist/ ready to upload to cPanel (InMotion).
rem   package-site.cmd                 -> domain root  (https://example.com/)
rem   package-site.cmd /ftcdash/       -> a subfolder  (https://example.com/ftcdash/)

set "BASE_PATH=%~1"
if "%BASE_PATH%"=="" set "BASE_PATH=/"

set "NODE_HOME="
where node >nul 2>nul
if not errorlevel 1 set "NODE_HOME=PATH"
if not defined NODE_HOME if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_HOME=%ProgramFiles%\nodejs"
if not defined NODE_HOME if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_HOME=%ProgramFiles(x86)%\nodejs"
if not defined NODE_HOME if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_HOME=%LOCALAPPDATA%\Programs\nodejs"
if not defined NODE_HOME if exist "%~dp0.node\node.exe" set "NODE_HOME=%~dp0.node"

if not defined NODE_HOME goto :noNode
if "%NODE_HOME%"=="PATH" goto :runtimeReady
set "PATH=%NODE_HOME%;%PATH%"

:runtimeReady
if exist "node_modules\vite\package.json" goto :depsReady
echo Installing dependencies - this runs once and takes a minute...
call npm install
if errorlevel 1 goto :failed

:depsReady
echo.
echo   Packaging for base path %BASE_PATH%
echo.
call node scripts\package.mjs --base=%BASE_PATH%
if errorlevel 1 goto :failed

echo.
echo   Upload ftcdash-site.zip to cPanel - File Manager - public_html
echo   (or the sub-folder above), Extract it there, then delete the zip.
echo.
pause
exit /b 0

:noNode
echo.
echo   Node.js is not installed, so the site cannot be built yet.
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
