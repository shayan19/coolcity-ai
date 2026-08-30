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

"%VENV_PYTHON%" -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)" >nul 2>&1
if errorlevel 1 goto old_python

echo Installing the tested pip version...
"%VENV_PYTHON%" -m pip install "pip==26.2.1"
if errorlevel 1 goto install_failed

echo Installing fully locked backend dependencies...
"%VENV_PYTHON%" -m pip install --requirement "%PROJECT_ROOT%\backend\requirements-dev.lock.txt"
if errorlevel 1 goto install_failed
"%VENV_PYTHON%" -m pip check
if errorlevel 1 goto install_failed
"%VENV_PYTHON%" -c "import hashlib, pathlib, sys; paths = [pathlib.Path(value) for value in sys.argv[1:3]]; pathlib.Path(sys.argv[3]).write_text(':'.join(hashlib.sha256(path.read_bytes()).hexdigest() for path in paths), encoding='ascii')" "%PROJECT_ROOT%\backend\requirements.lock.txt" "%PROJECT_ROOT%\backend\requirements-dev.lock.txt" "%PROJECT_ROOT%\.venv\.coolcity-dependencies.sha256"
if errorlevel 1 goto install_failed

echo Installing locked frontend dependencies...
pushd "%PROJECT_ROOT%\frontend"
call "%NPM_CMD%" ci
if errorlevel 1 (
  popd
  goto install_failed
)
call "%NPM_CMD%" ls --depth=0 >nul
if not errorlevel 1 goto frontend_packages_ready

echo Frontend verification was incomplete. Retrying the clean locked install once...
call "%NPM_CMD%" ci
if errorlevel 1 (
  popd
  goto install_failed
)
call "%NPM_CMD%" ls --depth=0 >nul
if errorlevel 1 (
  popd
  goto install_failed
)

:frontend_packages_ready
"%VENV_PYTHON%" -c "import hashlib, pathlib, sys; paths = [pathlib.Path(value) for value in sys.argv[1:3]]; pathlib.Path(sys.argv[3]).write_text(':'.join(hashlib.sha256(path.read_bytes()).hexdigest() for path in paths), encoding='ascii')" "%PROJECT_ROOT%\frontend\package.json" "%PROJECT_ROOT%\frontend\package-lock.json" "%PROJECT_ROOT%\frontend\node_modules\.coolcity-dependencies.sha256"
if errorlevel 1 (
  popd
  goto install_failed
)
popd
goto frontend_install_complete

:frontend_install_complete

if not exist "%PROJECT_ROOT%\.env" (
  copy /Y "%PROJECT_ROOT%\.env.example" "%PROJECT_ROOT%\.env" >nul
  echo Created .env from .env.example.
) else (
  echo Preserved the existing local .env.
)

echo.
call "%PROJECT_ROOT%\check_coolcity_dependencies.cmd" >nul 2>&1
if errorlevel 1 goto verification_failed

echo Setup complete. All locked dependencies were verified.
echo Double-click start_coolcity.cmd to run CoolCity AI.
if /I "%NO_PAUSE%"=="true" exit /b 0
pause
exit /b 0

:create_venv
where py.exe >nul 2>&1
if not errorlevel 1 (
  py.exe -3.12 -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)" >nul 2>&1
  if not errorlevel 1 (
    py.exe -3.12 -m venv "%PROJECT_ROOT%\.venv"
    exit /b %ERRORLEVEL%
  )
)

set "PYTHON_EXE="
for /f "delims=" %%I in ('where python.exe 2^>nul') do if not defined PYTHON_EXE set "PYTHON_EXE=%%I"
if not defined PYTHON_EXE exit /b 1
"%PYTHON_EXE%" -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)" >nul 2>&1
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

:old_python
echo ERROR: The existing .venv does not use Python 3.12.
echo Rename or remove that local folder, install Python 3.12.13, and retry.
goto fatal

:broken_venv
echo ERROR: .venv exists but its Python executable is missing.
echo Rename or remove that broken local folder, then run setup again.
goto fatal

:install_failed
echo ERROR: Dependency installation failed. Review the message above and retry.
goto fatal

:verification_failed
echo ERROR: Dependency verification failed after installation.
echo Review the messages above, then run setup_coolcity.cmd again.
goto fatal

:fatal
echo.
if /I "%NO_PAUSE%"=="true" exit /b 1
pause
exit /b 1
