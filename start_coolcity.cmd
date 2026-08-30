@echo off
setlocal
title CoolCity AI Launcher

set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "BACKEND_PYTHON=%PROJECT_ROOT%\.venv\Scripts\python.exe"
set "BACKEND_APP=%PROJECT_ROOT%\backend\app\main.py"
set "FRONTEND_DIR=%PROJECT_ROOT%\frontend"
set "NODE_EXE="
set "NPM_CMD="

echo.
echo ========================================
echo   CoolCity AI - One-click start
echo ========================================
echo.

call "%PROJECT_ROOT%\check_coolcity_dependencies.cmd" >nul 2>&1
if errorlevel 1 goto run_setup
echo Locked dependencies verified.
goto setup_complete

:run_setup
echo Missing, broken, or outdated dependencies detected.
echo Creating or repairing the local environments automatically...
call "%PROJECT_ROOT%\setup_coolcity.cmd" --no-pause
if errorlevel 1 goto fatal
call "%PROJECT_ROOT%\check_coolcity_dependencies.cmd" >nul 2>&1
if errorlevel 1 goto dependency_verification_failed
echo Locked dependencies installed and verified.

:setup_complete
if not exist "%BACKEND_PYTHON%" goto missing_python
if not exist "%BACKEND_APP%" goto missing_backend
if not exist "%FRONTEND_DIR%\" goto missing_frontend
if not exist "%FRONTEND_DIR%\package.json" goto missing_package

for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
for /f "delims=" %%I in ('where npm.cmd 2^>nul') do if not defined NPM_CMD set "NPM_CMD=%%I"
if not defined NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not defined NPM_CMD if exist "C:\Program Files\nodejs\npm.cmd" set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
if not defined NODE_EXE goto missing_node
if not defined NPM_CMD goto missing_npm

if not exist "%PROJECT_ROOT%\.env" (
  copy /Y "%PROJECT_ROOT%\.env.example" "%PROJECT_ROOT%\.env" >nul
  echo Created .env from the safe template.
)
findstr /R /C:"^FORTYGUARD_API_KEY=..*" "%PROJECT_ROOT%\.env" >nul 2>&1
if errorlevel 1 echo NOTE: Add FORTYGUARD_API_KEY to .env before running a live analysis.

call :backend_ready
if not errorlevel 1 (
  echo Backend already running - reusing port 8000.
  goto frontend_check
)

call :port_listening 8000
if not errorlevel 1 (
  echo ERROR: Port 8000 is occupied by another application.
  echo Close that application, then run this launcher again.
  goto fatal
)

echo Starting CoolCity backend...
if /I "%COOLCITY_HEADLESS%"=="true" (
  start "" /b /D "%PROJECT_ROOT%" cmd.exe /c ""%BACKEND_PYTHON%" -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000"
  goto frontend_check
)
start "CoolCity Backend" /D "%PROJECT_ROOT%" cmd.exe /k ""%BACKEND_PYTHON%" -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000"

:frontend_check
call :frontend_ready
if not errorlevel 1 (
  echo Frontend already running - reusing port 3000.
  goto wait_for_services
)

call :port_listening 3000
if not errorlevel 1 (
  echo ERROR: Port 3000 is occupied by another application.
  echo Close that application, then run this launcher again.
  goto fatal
)

echo Starting CoolCity frontend...
if /I "%COOLCITY_HEADLESS%"=="true" (
  start "" /b /D "%FRONTEND_DIR%" cmd.exe /c ""%NPM_CMD%" run dev -- --hostname 127.0.0.1"
  goto wait_for_services
)
start "CoolCity Frontend" /D "%FRONTEND_DIR%" cmd.exe /k ""%NPM_CMD%" run dev -- --hostname 127.0.0.1"

:wait_for_services
echo Waiting for local services...
set "BACKEND_OK=false"
set "FRONTEND_OK=false"

for /L %%G in (1,1,60) do (
  call :backend_ready
  if not errorlevel 1 set "BACKEND_OK=true"
  call :frontend_ready
  if not errorlevel 1 set "FRONTEND_OK=true"
  call :both_ready
  if not errorlevel 1 goto services_ready
  call :wait_one_second
)

echo ERROR: CoolCity did not become ready within 60 seconds.
echo Check the Backend and Frontend command windows for details.
goto fatal

:services_ready
echo Backend health: HTTP 200
echo Frontend: HTTP 200
if /I "%COOLCITY_SKIP_BROWSER%"=="true" goto skip_browser
if /I "%COOLCITY_SKIP_BROWSER%"=="1" goto skip_browser
echo Opening CoolCity AI in your default browser...
start "" "http://localhost:3000"
goto ready

:skip_browser
echo Browser opening skipped for launcher verification.

:ready
echo.
echo CoolCity AI is ready at http://localhost:3000
echo Keep the Backend and Frontend windows open during the demo.
echo You may close this launcher window.
if /I "%COOLCITY_SKIP_PAUSE%"=="true" exit /b 0
pause
exit /b 0

:backend_ready
powershell.exe -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2; if ($r.StatusCode -eq 200 -and $r.Content -match 'CoolCity AI') { exit 0 } } catch {}; exit 1" >nul 2>&1
exit /b %errorlevel%

:frontend_ready
powershell.exe -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000' -TimeoutSec 2; if ($r.StatusCode -eq 200 -and $r.Content -match 'CoolCity AI') { exit 0 } } catch {}; exit 1" >nul 2>&1
exit /b %errorlevel%

:wait_one_second
if /I "%COOLCITY_HEADLESS%"=="true" (
  powershell.exe -NoProfile -Command "Start-Sleep -Seconds 1" >nul 2>&1
  exit /b 0
)
timeout /t 1 /nobreak >nul
exit /b 0

:port_listening
netstat -ano -p tcp | findstr /R /C:":%~1 .*LISTENING" >nul
exit /b %errorlevel%

:both_ready
if /I not "%BACKEND_OK%"=="true" exit /b 1
if /I not "%FRONTEND_OK%"=="true" exit /b 1
exit /b 0

:missing_python
echo ERROR: The project Python environment is unavailable. Run setup_coolcity.cmd.
goto fatal

:missing_backend
echo ERROR: CoolCity backend was not found at:
echo %BACKEND_APP%
goto fatal

:missing_node
echo ERROR: Node.js 20.9 or newer was not found.
goto fatal

:missing_npm
echo ERROR: npm.cmd was not found.
goto fatal

:missing_frontend
echo ERROR: CoolCity frontend directory was not found.
goto fatal

:missing_package
echo ERROR: frontend\package.json was not found.
goto fatal

:dependency_verification_failed
echo ERROR: Dependency verification failed after automatic setup.
echo Run setup_coolcity.cmd to see the detailed installation output.
goto fatal

:fatal
echo.
if /I "%COOLCITY_SKIP_PAUSE%"=="true" exit /b 1
pause
exit /b 1
