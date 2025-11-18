# ZKTeco Device Management System

A FastAPI-based backend system for managing ZKTeco biometric devices with VPN connectivity.

## Quick Start

### Option 1: Quick Setup and Run (Recommended)
Simply double-click: **`setup_and_run.bat`**

This will:
- Create virtual environment
- Install all dependencies
- Start the backend server

### Option 2: Manual Setup

```powershell
# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r backend\requirements.txt

# Configure device settings (edit .env)
# Set your device IP and port

# Run the backend
python backend\main.py
```

### Option 3: Use Start Script
Double-click: **`start_backend.bat`** (if already set up)

## Configuration

Edit `.env` file to configure your device:

```env
DEVICE_IP=10.185.1.201
DEVICE_PORT=4370
DEVICE_TIMEOUT=30
DEVICE_PASSWORD=0
```

## Device Information

**Current Device:**
- Model: K14
- Serial: OMA6050486050500094
- Firmware: Ver 6.60 Jun 16 2015
- Platform: JZ4725_TFT
- Connection: VPN (10.185.1.201:4370)

## API Access

Once running:
- **API Base URL**: http://localhost:8000
- **Interactive Docs**: http://localhost:8000/docs
- **Alternative Docs**: http://localhost:8000/redoc

## Project Structure

```
rt_connect/
├── backend/               # Backend API application
│   ├── app/
│   │   ├── api/          # API endpoints
│   │   ├── core/         # Configuration
│   │   ├── models/       # Data models
│   │   └── services/     # Device management
│   ├── main.py           # FastAPI application
│   └── requirements.txt  # Dependencies
├── venv/                 # Virtual environment
├── .env                  # Configuration
├── start_backend.bat     # Start server
└── setup_and_run.bat     # Setup and start

Test Scripts:
├── test_api.py           # API endpoint tests
├── test_vpn.py           # VPN connection test
└── test_connection.py    # Device connection test
```

## API Endpoints

### Device Management
- `GET /api/device/info` - Get device information
- `POST /api/device/enable` - Enable device
- `POST /api/device/disable` - Disable device
- `POST /api/device/restart` - Restart device
- `POST /api/device/poweroff` - Power off device
- `POST /api/device/test-voice/{index}` - Test device voice

### User Management
- `GET /api/users/` - Get all users
- `POST /api/users/` - Add new user
- `DELETE /api/users/{uid}` - Delete user

### Attendance
- `GET /api/attendance/` - Get attendance records
- `GET /api/attendance/?user_id={id}` - Filter by user
- `GET /api/attendance/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` - Filter by date
- `DELETE /api/attendance/clear` - Clear all records

## Requirements

- Python 3.8+
- VPN connection to device network
- Device IP: 10.185.1.201:4370

## Testing

Test the API:
```powershell
python test_api.py
```

Test device connection:
```powershell
python test_vpn.py
```

## Troubleshooting

**Server won't start:**
- Ensure VPN is connected
- Check `.env` configuration
- Verify Python and dependencies are installed

**Can't connect to device:**
- Verify VPN connection
- Check device IP is accessible: `ping 10.185.1.201`
- Ensure device is powered on

**API returns errors:**
- Check device is not locked by another connection
- Increase DEVICE_TIMEOUT in `.env`
- Verify device is responding
