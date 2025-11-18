# Git Setup and GitHub Backup Guide

## Step 1: Install Git

1. Download Git for Windows from: https://git-scm.com/download/win
2. Run the installer and use default settings
3. Restart PowerShell/Command Prompt after installation

## Step 2: Configure Git (First Time Only)

Open PowerShell and run:
```powershell
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

## Step 3: Create GitHub Repository

1. Go to https://github.com
2. Click "New repository" (green button)
3. Repository name: `zkteco-device-management`
4. Description: `FastAPI backend for ZKTeco biometric device management`
5. Choose: **Private** (recommended for security)
6. **Do NOT** initialize with README (we already have one)
7. Click "Create repository"

## Step 4: Initial Commit and Push

After Git is installed, run these commands in PowerShell:

```powershell
# Navigate to project
cd C:\Users\RTHOME\Desktop\rt_connect

# Initialize Git repository
git init

# Add all files
git add .

# Create initial commit (Version 1.0.0)
git commit -m "Initial commit - ZKTeco Device Management v1.0.0

- FastAPI backend for ZKTeco device management
- Device connection via VPN (10.185.1.201:4370)
- User management endpoints
- Attendance tracking and filtering
- Device control (enable/disable/restart)
- 23 users, 3,386 attendance records
- Working with device K14 (Serial: OMA6050486050500094)"

# Add your GitHub repository as remote (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/zkteco-device-management.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Version Tagging

Tag your current version:
```powershell
# Create version tag
git tag -a v1.0.0 -m "Version 1.0.0 - Initial working version"

# Push tags to GitHub
git push origin --tags
```

## Future Updates

When you make changes:

### Regular Commit
```powershell
# Check what changed
git status

# Add changed files
git add .

# Commit with message
git commit -m "Description of changes"

# Push to GitHub
git push
```

### Create New Version
```powershell
# For minor updates (1.0.0 -> 1.0.1)
git tag -a v1.0.1 -m "Bug fixes and improvements"

# For feature updates (1.0.0 -> 1.1.0)
git tag -a v1.1.0 -m "New feature: Added XYZ"

# For major updates (1.0.0 -> 2.0.0)
git tag -a v2.0.0 -m "Major update: Breaking changes"

# Push tags
git push origin --tags
```

## Restore Previous Version

To go back to a previous version:

```powershell
# See all versions
git tag

# See all commits
git log --oneline

# Restore to specific version (creates new branch)
git checkout v1.0.0

# Or restore to previous commit
git checkout <commit-hash>

# To return to latest
git checkout main
```

## Current Project Structure

```
rt_connect/
├── backend/          # Your FastAPI application
├── venv/            # Virtual environment (NOT committed)
├── .env             # Config (NOT committed - sensitive)
├── .gitignore       # Files to ignore
├── README.md        # Project documentation
└── test scripts     # Test files
```

## Files NOT Included in Git (Already in .gitignore)

- `venv/` - Virtual environment
- `.env` - Contains sensitive device IP/credentials
- `*.db` - Database files
- `__pycache__/` - Python cache
- `*.pyc` - Compiled Python files

## Quick Backup Script

After setting up Git, you can use this for quick backups:
```powershell
# Save this as quick_backup.bat
@echo off
cd /d "%~dp0"
git add .
git commit -m "Backup: %date% %time%"
git push
echo Backup complete!
pause
```

## Clone on Another Computer

```powershell
# Clone your repository
git clone https://github.com/YOUR_USERNAME/zkteco-device-management.git

cd zkteco-device-management

# Create virtual environment
python -m venv venv
venv\Scripts\activate

# Install dependencies
pip install -r backend\requirements.txt

# Create .env file with your settings
copy .env.example .env
# Edit .env with your device IP

# Run the backend
.\start_backend.bat
```

## GitHub Repository Settings (Recommended)

After pushing to GitHub:

1. **Settings → General**
   - Make repository private
   - Disable wikis and projects if not needed

2. **Settings → Branches**
   - Add branch protection rules for `main`
   - Require pull request reviews (if team project)

3. **Add .env.example**
   - Already included - shows structure without sensitive data

## Version History Example

```
v1.0.0 - Initial working version (Nov 18, 2025)
  - Basic device connection via VPN
  - User management
  - Attendance tracking
  
v1.1.0 - Enhanced features (Future)
  - Added real-time monitoring
  - Dashboard improvements
  
v1.1.1 - Bug fixes (Future)
  - Fixed connection timeout
  - Improved error handling
```

## Troubleshooting

**Git not recognized:**
- Install Git from: https://git-scm.com/download/win
- Restart PowerShell

**Permission denied (GitHub):**
- Use HTTPS URL: `https://github.com/username/repo.git`
- Or set up SSH keys: https://docs.github.com/en/authentication

**Large files warning:**
- Check .gitignore includes venv/ and *.db
- Remove large files: `git rm --cached large_file`

**Merge conflicts:**
- Pull latest: `git pull origin main`
- Resolve conflicts manually
- Commit: `git add . && git commit -m "Resolved conflicts"`
- Push: `git push`
