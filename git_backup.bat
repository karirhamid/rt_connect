@echo off
echo ========================================
echo Quick Git Backup
echo ========================================
echo.

cd /d "%~dp0"

REM Check if git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo Error: Git is not installed!
    echo Please install Git from: https://git-scm.com/download/win
    echo Then run this script again.
    pause
    exit /b 1
)

REM Check if git repository is initialized
if not exist ".git" (
    echo Initializing Git repository...
    git init
    git branch -M main
)

echo.
echo Adding files to Git...
git add .

echo.
echo Creating commit...
set commit_msg=Backup: %date% %time%
git commit -m "%commit_msg%"

if errorlevel 1 (
    echo No changes to commit.
) else (
    echo.
    echo Pushing to GitHub...
    git push origin main
    
    if errorlevel 1 (
        echo.
        echo ========================================
        echo First time setup needed!
        echo ========================================
        echo Please run these commands:
        echo.
        echo 1. Set your GitHub repository:
        echo    git remote add origin https://github.com/YOUR_USERNAME/zkteco-device-management.git
        echo.
        echo 2. Push to GitHub:
        echo    git push -u origin main
        echo.
        echo Then you can use this script for quick backups.
    ) else (
        echo.
        echo ========================================
        echo Backup Complete!
        echo ========================================
    )
)

echo.
pause
