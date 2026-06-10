@echo off
setlocal
cd /d "%~dp0"
set "PYTHON_EXE=C:\Users\lsb55\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%PYTHON_EXE%" (
  echo Python executable not found:
  echo %PYTHON_EXE%
  pause
  exit /b 1
)
start "price-proxy" /min "%PYTHON_EXE%" "%~dp0price_proxy_server.py"
timeout /t 1 /nobreak >nul
start "" "%~dp0pension-simulator.html"
