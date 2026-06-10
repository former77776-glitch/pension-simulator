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
echo Starting local price proxy on http://127.0.0.1:8765
echo Keep this window open while using pension-simulator.html.
"%PYTHON_EXE%" "%~dp0price_proxy_server.py"
pause
