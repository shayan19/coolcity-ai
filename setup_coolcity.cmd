@echo off
setlocal EnableExtensions
title CoolCity AI Setup

set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "VENV_PYTHON=%PROJECT_ROOT%\.venv\Scripts\python.exe"
set "NO_PAUSE=false"
if /I "%~1"=="--no-pause" set "NO_PAUSE=true"

echo.
echo ========================================
echo   CoolCity AI - Dependency setup
echo ========================================
echo.

set "NODE_EXE="
set "NPM_CMD="
for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
for /f "delims=" %%I in ('where npm.cmd 2^>nul') do if not defined NPM_CMD set "NPM_CMD=%%I"
if not defined NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not defined NPM_CMD if exist "C:\Program Files\nodejs\npm.cmd" set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
if not defined NODE_EXE goto missing_node
if not defined NPM_CMD goto missing_node
"%NODE_EXE%" -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 20 || (major === 20 && minor >= 9) ? 0 : 1)"
if errorlevel 1 goto old_node

if not exist "%VENV_PYTHON%" (
  if exist "%PROJECT_ROOT%\.venv" goto broken_venv
  echo Creating the local Python environment...
  call :create_venv
  if errorlevel 1 goto missing_python
) else (
  echo Reusing the existing .venv.
)

echo Installing pinned backend dependencies...
"%VENV_PYTHON%" -m pip install --requirement "%PROJECT_ROOT%\backend\requirements-dev.txt"
if errorlevel 1 goto install_failed

echo Installing locked frontend dependencies...
pushd "%PROJECT_ROOT%\frontend"
call "%NPM_CMD%" ci
set "NPM_EXIT=%ERRORLEVEL%"
popd
if not "%NPM_EXIT%"=="0" goto install_failed

if not exist "%PROJECT_ROOT%\.env" (
  copy /Y "%PROJECT_ROOT%\.env.example" "%PROJECT_ROOT%\.env" >nul
  echo Created .env from .env.example.
) else (
  echo Preserved the existing local .env.
)

echo.
echo Setup complete. Double-click start_coolcity.cmd to run CoolCity AI.
if /I "%NO_PAUSE%"=="true" exit /b 0
pause
exit /b 0

:create_venv
where py.exe >nul 2>&1
if not errorlevel 1 (
  py.exe -3.12 -c "import sys; raise SystemExit(0 if sys.version_info ^>= (3, 12) else 1)" >nul 2>&1
  if not errorlevel 1 (
    py.exe -3.12 -m venv "%PROJECT_ROOT%\.venv"
    exit /b %ERRORLEVEL%
  )
)

set "PYTHON_EXE="
for /f "delims=" %%I in ('where python.exe 2^>nul') do if not defined PYTHON_EXE set "PYTHON_EXE=%%I"
if not defined PYTHON_EXE exit /b 1
"%PYTHON_EXE%" -c "import sys; raise SystemExit(0 if sys.version_info ^>= (3, 12) else 1)" >nul 2>&1
if errorlevel 1 exit /b 1
"%PYTHON_EXE%" -m venv "%PROJECT_ROOT%\.venv"
exit /b %ERRORLEVEL%

:missing_node
echo ERROR: Node.js 20.9 or newer and npm were not found.
echo Install the current Node.js LTS release from https://nodejs.org/ and retry.
goto fatal

:old_node
echo ERROR: Node.js 20.9 or newer is required.
goto fatal

:missing_python
echo ERROR: Python 3.12 was not found or could not create .venv.
echo Install Python 3.12 from https://www.python.org/ and retry.
goto fatal

:broken_venv
echo ERROR: .venv exists but its Python executable is missing.
echo Rename or remove that broken local folder, then run setup again.
goto fatal

:install_failed
echo ERROR: Dependency installation failed. Review the message above and retry.
goto fatal

:fatal
echo.
if /I "%NO_PAUSE%"=="true" exit /b 1
pause
exit /b 1
