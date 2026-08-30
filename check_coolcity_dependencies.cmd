@echo off
setlocal EnableExtensions

set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "VENV_PYTHON=%PROJECT_ROOT%\.venv\Scripts\python.exe"
set "PYTHON_STAMP=%PROJECT_ROOT%\.venv\.coolcity-dependencies.sha256"
set "FRONTEND_DIR=%PROJECT_ROOT%\frontend"
set "FRONTEND_STAMP=%FRONTEND_DIR%\node_modules\.coolcity-dependencies.sha256"

if not exist "%VENV_PYTHON%" exit /b 1
if not exist "%PROJECT_ROOT%\backend\requirements.lock.txt" exit /b 1
if not exist "%PROJECT_ROOT%\backend\requirements-dev.lock.txt" exit /b 1
if not exist "%PYTHON_STAMP%" exit /b 1

"%VENV_PYTHON%" -c "import sys; import fastapi, httpx, pydantic, dotenv, uvicorn; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)" >nul 2>&1
if errorlevel 1 exit /b 1
"%VENV_PYTHON%" -m pip check >nul 2>&1
if errorlevel 1 exit /b 1

"%VENV_PYTHON%" -c "import hashlib, pathlib, sys; paths = [pathlib.Path(value) for value in sys.argv[1:3]]; expected = ':'.join(hashlib.sha256(path.read_bytes()).hexdigest() for path in paths); actual = pathlib.Path(sys.argv[3]).read_text(encoding='ascii').strip(); raise SystemExit(0 if actual == expected else 1)" "%PROJECT_ROOT%\backend\requirements.lock.txt" "%PROJECT_ROOT%\backend\requirements-dev.lock.txt" "%PYTHON_STAMP%" >nul 2>&1
if errorlevel 1 exit /b 1

set "NODE_EXE="
set "NPM_CMD="
for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
for /f "delims=" %%I in ('where npm.cmd 2^>nul') do if not defined NPM_CMD set "NPM_CMD=%%I"
if not defined NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not defined NPM_CMD if exist "C:\Program Files\nodejs\npm.cmd" set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
if not defined NODE_EXE exit /b 1
if not defined NPM_CMD exit /b 1

"%NODE_EXE%" -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 20 || (major === 20 && minor >= 9) ? 0 : 1)" >nul 2>&1
if errorlevel 1 exit /b 1
if not exist "%FRONTEND_DIR%\package.json" exit /b 1
if not exist "%FRONTEND_DIR%\package-lock.json" exit /b 1
if not exist "%FRONTEND_STAMP%" exit /b 1

"%VENV_PYTHON%" -c "import hashlib, pathlib, sys; paths = [pathlib.Path(value) for value in sys.argv[1:3]]; expected = ':'.join(hashlib.sha256(path.read_bytes()).hexdigest() for path in paths); actual = pathlib.Path(sys.argv[3]).read_text(encoding='ascii').strip(); raise SystemExit(0 if actual == expected else 1)" "%FRONTEND_DIR%\package.json" "%FRONTEND_DIR%\package-lock.json" "%FRONTEND_STAMP%" >nul 2>&1
if errorlevel 1 exit /b 1

pushd "%FRONTEND_DIR%"
call "%NPM_CMD%" ls --depth=0 >nul 2>&1
set "NPM_EXIT=%ERRORLEVEL%"
popd
if not "%NPM_EXIT%"=="0" exit /b 1

exit /b 0
