@echo off
REM Start ONLY the frontend (Vite, http://localhost:5173).
REM Closing this window (or Ctrl+C) stops it — runs in a kill-on-close Job.
title RT Connect frontend - close to stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" -Services frontend
