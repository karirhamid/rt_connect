# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-18

### Added
- Initial FastAPI backend for ZKTeco device management
- Device connection via VPN (10.185.1.201:4370)
- Device information endpoint (GET /api/device/info)
- Device control endpoints (enable/disable/restart/poweroff)
- User management endpoints (list/add/delete users)
- Attendance tracking with filtering by date and user
- Automatic connection retry (TCP then UDP fallback)
- Configuration via .env file
- Interactive API documentation (Swagger UI)
- Batch scripts for easy startup (start_backend.bat)
- Setup script with auto-install (setup_and_run.bat)
- Comprehensive test scripts
- Project documentation and guides

### Device Info
- Device Model: K14
- Serial Number: OMA6050486050500094
- Firmware: Ver 6.60 Jun 16 2015
- Platform: JZ4725_TFT
- Current Users: 23
- Current Attendance Records: 3,386

### Technical Details
- Python 3.13.7
- FastAPI 0.104.1
- pyzk 0.9.1 (ZKTeco library)
- Uvicorn ASGI server
- Pydantic for data validation
- Connection timeout: 30 seconds
- Default password: 0

### Configuration
- Device IP: 10.185.1.201 (VPN)
- Device Port: 4370
- API Port: 8000
- Environment: Development with auto-reload

### API Endpoints
#### Device Management
- GET /api/device/info - Get device information
- POST /api/device/enable - Enable device
- POST /api/device/disable - Disable device
- POST /api/device/restart - Restart device
- POST /api/device/poweroff - Power off device
- POST /api/device/test-voice/{index} - Test device voice

#### User Management
- GET /api/users/ - List all users
- POST /api/users/ - Add new user
- DELETE /api/users/{uid} - Delete user

#### Attendance
- GET /api/attendance/ - Get all attendance records
- GET /api/attendance/?user_id={id} - Filter by user
- GET /api/attendance/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD - Filter by date
- DELETE /api/attendance/clear - Clear all records

### Documentation
- README.md - Main documentation
- GIT_SETUP.md - Git and GitHub setup guide
- PROJECT_STRUCTURE.md - Project organization
- SOLUTION.md - Connection troubleshooting
- CONNECTION_ISSUES.md - NAT issues documentation
- WDMS_SETUP.md - WDMS configuration guide

### Testing
- test_vpn.py - VPN connection test (working)
- test_api.py - API endpoint tests (working)
- test_connection.py - Device connection test
- test_comprehensive.py - Full test suite

### Known Issues
- NAT/Port forwarding not supported (documented in SOLUTION.md)
- Requires VPN connection to device network
- Windows-only batch scripts (PowerShell required)

### Future Enhancements
- [ ] Database storage for historical data
- [ ] User authentication/authorization
- [ ] Real-time attendance notifications
- [ ] Web dashboard/frontend
- [ ] Multi-device support
- [ ] Scheduled data synchronization
- [ ] Export to Excel/PDF
- [ ] User photo management
- [ ] Fingerprint template management
- [ ] Access control rules

## [Unreleased]

### Planned Features
- Database integration (SQLite/PostgreSQL)
- JWT authentication
- Real-time WebSocket updates
- Admin dashboard
- Data export functionality
- Email notifications
- Multi-language support

---

## Version Numbering

- **Major (X.0.0)**: Breaking changes, major new features
- **Minor (1.X.0)**: New features, backward compatible
- **Patch (1.0.X)**: Bug fixes, small improvements

## Git Tags

Use these commands to create version tags:
```bash
git tag -a v1.0.0 -m "Initial release"
git push origin v1.0.0
```
