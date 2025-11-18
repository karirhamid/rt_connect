# ZKTeco Device Management System

Full-stack application for managing ZKTeco biometric devices with FastAPI backend and React frontend.

## 🚀 Quick Start

### Start Everything (Recommended)
Double-click: **`start_all.bat`**

This will start both backend API and frontend in separate windows.

### Start Individual Services

**Backend Only:**
```powershell
.\start_backend.bat
```

**Frontend Only:**
```powershell
.\start_frontend.bat
```

### First Time Setup
```powershell
.\setup_and_run.bat
```

## 📂 Project Structure

```
rt_connect/
├── backend-api/          # FastAPI Backend
│   ├── app/
│   │   ├── api/         # REST endpoints
│   │   ├── core/        # Configuration
│   │   ├── models/      # Data models
│   │   └── services/    # Device manager
│   ├── main.py          # FastAPI app
│   └── requirements.txt # Python dependencies
│
├── frontend/            # React Frontend
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── services/    # API client
│   │   └── App.jsx      # Main app
│   └── package.json     # Node dependencies
│
├── venv/               # Python virtual environment
├── .env                # Backend configuration
├── start_all.bat       # Start both services
├── start_backend.bat   # Start backend only
└── start_frontend.bat  # Start frontend only
```

## 🔧 Configuration

### Backend (.env)
```env
DEVICE_IP=10.185.1.201    # Your device IP
DEVICE_PORT=4370          # Device port
DEVICE_TIMEOUT=30
DEVICE_PASSWORD=0
```

### Frontend (frontend/.env)
```env
VITE_API_URL=http://localhost:8000
```

## 🌐 Access Points

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:5173 | Web Interface |
| **Backend API** | http://localhost:8000 | REST API |
| **API Docs** | http://localhost:8000/docs | Interactive API Documentation |

## 📋 Requirements

- **Python 3.8+** - Backend
- **Node.js 16+** - Frontend
- **VPN/Local Network** - Device access

## 🎯 Features

### Device Management
- View device information
- Enable/Disable device
- Restart/Power off
- Test voice feedback

### User Management
- Add new users
- List all users
- Delete users
- Role management (User/Admin)

### Attendance Tracking
- View attendance records
- Filter by date range
- Filter by user
- Export to CSV
- Clear records

## 📱 Device Info

**Current Device:**
- Model: K14
- Serial: OMA6050486050500094
- Firmware: Ver 6.60 Jun 16 2015
- Platform: JZ4725_TFT
- Connection: VPN (10.185.1.201:4370)

## 🛠️ Development

### Backend Development
```powershell
cd backend-api
..\venv\Scripts\activate
python main.py
```

### Frontend Development
```powershell
cd frontend
npm install
npm run dev
```

### Build Frontend for Production
```powershell
cd frontend
npm run build
```

## 📦 Manual Installation

### Backend
```powershell
python -m venv venv
venv\Scripts\activate
pip install -r backend-api\requirements.txt
```

### Frontend
```powershell
cd frontend
npm install
```

## 🔄 Version Control

Backup to GitHub:
```powershell
git add .
git commit -m "Your message"
git push origin main
```

Quick backup:
```powershell
.\git_backup.bat
```

## 📄 License

MIT License - Copyright (c) 2025 Hamid KARIR - RIRAKTECH SARL

See [LICENSE](LICENSE) file for details.

**Author:** Hamid KARIR  
**Company:** RIRAKTECH SARL  
**Website:** https://riraktech.ma  
**Email:** hamid.karir@riraktech.ma  
**Phone:** +212 611 644 6889

## 🐛 Troubleshooting

**Backend won't start:**
- Ensure VPN is connected
- Check `.env` configuration
- Verify device is accessible: `ping 10.185.1.201`

**Frontend won't start:**
- Ensure Node.js is installed
- Run `npm install` in frontend folder
- Check if port 5173 is available

**API connection errors:**
- Ensure backend is running on port 8000
- Check `VITE_API_URL` in `frontend/.env`
- Verify CORS is enabled in backend
