@echo off
REM Start ONLY the backend (http://localhost:8000).
REM Closing this window (or Ctrl+C) stops it — runs in a kill-on-close Job.
title RT Connect backend - close to stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" -Services backend
