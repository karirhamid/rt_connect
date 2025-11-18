# Project Structure - ZKTeco Device Management System

## 📁 Directory Organization

```
rt_connect/
│
├── 📂 backend/                    # Backend API Application
│   ├── 📂 app/
│   │   ├── 📂 api/               # REST API endpoints
│   │   │   ├── device.py         # Device control endpoints
│   │   │   ├── users.py          # User management endpoints
│   │   │   └── attendance.py     # Attendance endpoints
│   │   ├── 📂 core/              # Core configuration
│   │   │   └── config.py         # App settings & env vars
│   │   ├── 📂 models/            # Data models
│   │   │   └── schemas.py        # Pydantic models
│   │   └── 📂 services/          # Business logic
│   │       └── device_manager.py # ZKTeco device operations
│   ├── main.py                   # FastAPI application entry
│   └── requirements.txt          # Python dependencies
│
├── 📂 venv/                       # Python virtual environment
│
├── 🚀 start_backend.bat          # START THE BACKEND (Double-click this!)
├── ⚙️ setup_and_run.bat          # First-time setup + start
│
├── 🔧 Configuration Files
│   ├── .env                      # Your device configuration
│   ├── .env.example              # Configuration template
│   └── .gitignore                # Git ignore rules
│
├── 🧪 Test Scripts
│   ├── test_api.py               # Test API endpoints
│   ├── test_vpn.py               # Test VPN connection (BEST)
│   ├── test_connection.py        # General connection test
│   ├── test_comprehensive.py     # Full test suite
│   ├── test_local_connection.py  # Local network test
│   └── test_port_5054.py         # NAT port test
│
├── 📚 Documentation
│   ├── README.md                 # Main documentation (START HERE)
│   ├── QUICKSTART.md             # Quick start guide
│   ├── SOLUTION.md               # Connection solution details
│   ├── CONNECTION_ISSUES.md      # Troubleshooting NAT issues
│   └── WDMS_SETUP.md            # WDMS configuration guide
│
└── 🔍 Diagnostic Tools
    ├── diagnose_connection.py    # Connection diagnostics
    ├── test_passwords.py         # Password testing
    ├── test_wdms.py              # WDMS testing
    └── wdms_listener.py          # WDMS push listener

```

## 🚀 Quick Start Guide

### For First Time Setup:
**Double-click:** `setup_and_run.bat`

### To Start Backend (After Setup):
**Double-click:** `start_backend.bat`

### To Test Everything:
```powershell
# Test VPN connection to device
python test_vpn.py

# Test API endpoints
python test_api.py
```

## 📝 Current Configuration

**Device Settings (.env):**
```
DEVICE_IP=10.185.1.201
DEVICE_PORT=4370
DEVICE_TIMEOUT=30
DEVICE_PASSWORD=0
```

**Device Info:**
- Model: K14
- Serial: OMA6050486050500094
- Firmware: Ver 6.60 Jun 16 2015
- Connection: VPN Required
- Users: 23
- Attendance Records: 3,386

## 🌐 API Access

Once backend is running:
- **Base URL:** http://localhost:8000
- **Interactive Docs:** http://localhost:8000/docs ← Use this!
- **API Docs:** http://localhost:8000/redoc

## 🔑 Key Files Explained

### Backend Files
- **main.py** - FastAPI application setup and routing
- **device_manager.py** - Core logic for ZKTeco device communication
- **config.py** - Loads configuration from .env file
- **schemas.py** - Data models for API requests/responses

### Batch Files
- **start_backend.bat** - Starts the API server
- **setup_and_run.bat** - First-time setup (venv + dependencies)

### Test Files
- **test_vpn.py** - Tests connection through VPN ✅ WORKS
- **test_api.py** - Tests all API endpoints ✅ WORKS
- **test_connection.py** - General connection test

### Documentation
- **README.md** - Complete project documentation
- **SOLUTION.md** - Explains why NAT didn't work and VPN solution

## ✅ What's Working

✓ Backend API fully functional
✓ Device connection via VPN
✓ All endpoints tested and working:
  - Device info and control
  - User management (23 users)
  - Attendance records (3,386 records)
  - Real-time data access

## 🎯 Next Steps

1. **Start Backend:** Run `start_backend.bat`
2. **Open Docs:** Go to http://localhost:8000/docs
3. **Test Endpoints:** Try getting device info, users, attendance
4. **Develop:** Build your frontend or integrate with other systems

## 💡 Tips

- Always connect to VPN before starting backend
- Use `/docs` endpoint for interactive API testing
- Check `.env` file if device IP changes
- Backend logs show in terminal window

## 🆘 Troubleshooting

**Backend won't start:**
```powershell
# Ensure VPN is connected
ping 10.185.1.201

# Check if port 8000 is free
netstat -ano | findstr :8000
```

**Connection errors:**
- Verify VPN connection
- Check device IP in .env
- Increase DEVICE_TIMEOUT

**Need help:**
- Check CONNECTION_ISSUES.md
- Review test script outputs
- Verify device is powered on
