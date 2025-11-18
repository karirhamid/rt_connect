# Quick Start Guide

## Setup and Run (Windows PowerShell)

```powershell
# Navigate to project directory
cd c:\Users\RTHOME\Desktop\rt_connect

# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Copy environment configuration
Copy-Item .env.example .env

# Run the application
python main.py
```

## Access the API

Once running, open your browser:
- **API Documentation**: http://localhost:8000/docs
- **API Root**: http://localhost:8000

## Test Device Connection

```powershell
# Using PowerShell
Invoke-RestMethod -Uri "http://localhost:8000/api/device/info"
```

## Your Device Configuration

- **IP**: 196.206.228.46
- **Port**: 5054 (NAT forwarding to 4370)
- **API will connect to**: 196.206.228.46:5054

## Common Commands

```powershell
# Get all users
Invoke-RestMethod -Uri "http://localhost:8000/api/users/"

# Get attendance records
Invoke-RestMethod -Uri "http://localhost:8000/api/attendance/"

# Enable device
Invoke-RestMethod -Uri "http://localhost:8000/api/device/enable" -Method POST
```

For full documentation, see README.md
