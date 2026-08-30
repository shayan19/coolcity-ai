@echo off
setlocal

set "NODE_DIR=C:\Program Files\nodejs"
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "FRONTEND_DIR=%PROJECT_DIR%\frontend"
set "APP_URL=http://localhost:3000"

rem Keep this PATH change local to the launcher process and its children.
set "PATH=%NODE_DIR%;%PATH%"

if not exist "%NODE_DIR%\node.exe" (
    echo.
    echo ERROR: Node.js was not found at C:\Program Files\nodejs
    echo.
    pause
    exit /b 1
)

if not exist "%NODE_DIR%\npm.cmd" (
    echo.
    echo ERROR: npm.cmd was not found.
    echo.
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%\" (
    echo.
    echo ERROR: CoolCity frontend directory was not found.
    echo.
    pause
    exit /b 1
)

cd /d "%FRONTEND_DIR%"
if errorlevel 1 (
    echo.
    echo ERROR: CoolCity frontend directory was not found.
    echo.
    pause
    exit /b 1
)

if not exist "package.json" (
    echo.
    echo ERROR: frontend\package.json was not found.
    echo.
    pause
    exit /b 1
)

%SystemRoot%\System32\netstat.exe -ano -p TCP | %SystemRoot%\System32\findstr.exe /R /C:":3000 .*LISTENING" >nul
if not errorlevel 1 (
    echo.
    echo ERROR: Port 3000 is already in use. CoolCity may already be running.
    echo Open %APP_URL% or stop the existing process before launching again.
    echo.
    pause
    exit /b 1
)

echo Starting the CoolCity frontend from:
echo %CD%
echo.
echo The browser will open %APP_URL% shortly.
echo Press Ctrl+C to stop the development server.
echo.

rem COOLCITY_SKIP_BROWSER is used only by the automated launcher smoke test.
if /I not "%COOLCITY_SKIP_BROWSER%"=="1" (
    start "" /b "%ComSpec%" /d /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
)

npm.cmd run dev
set "NPM_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%NPM_EXIT_CODE%"=="0" (
    echo ERROR: The CoolCity frontend server stopped with exit code %NPM_EXIT_CODE%.
) else (
    echo The CoolCity frontend server has stopped.
)

if /I "%COOLCITY_SKIP_BROWSER%"=="1" exit /b %NPM_EXIT_CODE%
pause
exit /b %NPM_EXIT_CODE%
