@echo off
REM Start BOTH the backend and the frontend.
REM Closing this window (or Ctrl+C) STOPS them both — they run inside a
REM Windows Job Object with kill-on-close, so nothing is left holding
REM ports 8000 / 5173.
title RT Connect dev (backend + frontend) - close to stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" -Services backend,frontend
