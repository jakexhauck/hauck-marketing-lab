@echo off
REM GHL CLI wrapper for Windows: loads .env then calls the venv entrypoint.
setlocal enabledelayedexpansion
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%SCRIPT_DIR%.env") do (
    if not "%%A"=="" set "%%A=%%B"
  )
)
"%SCRIPT_DIR%.venv\Scripts\ghl.exe" %*
endlocal
