# WDMS Configuration Guide

## ⚠️ IMPORTANT: Correct Your Device Settings

### Current Configuration (INCORRECT)
```
Domain/IP: 105.158.158.169 ✓ Correct (your public IP)
Port: 4370 ✗ WRONG (this is the device's port!)
```

### Correct Configuration
```
Domain/IP: 105.158.158.169 ✓ (your public IP)
Port: 8000 ✓ (your server listening port)
```

## Why Change the Port?

- **4370** = ZKTeco device's local port (where it normally listens)
- **8000** = Your server's listening port (where you receive data)

In WDMS **Push mode**, the device connects TO your server, so you specify YOUR port, not the device's port.

## Steps to Configure

### 1. Update Device WDMS Settings
Go to your device and set:
- **Domain/IP**: `105.158.158.169`
- **Port**: `8000` (or use 5054 if you prefer)
- **Enable WDMS**: Yes
- Save settings and restart device

### 2. Start the WDMS Listener
```powershell
python wdms_listener.py
```

This will:
- Listen on port 8000
- Wait for device to connect
- Receive and parse attendance data
- Display real-time logs

### 3. Open Firewall Port
Make sure port 8000 is open on your router/firewall:
```powershell
# Check if port is accessible
Test-NetConnection -ComputerName 105.158.158.169 -Port 8000
```

## Alternative Ports

You can use any port, just make sure:
1. Device is configured with the same port
2. Listener uses the same port
3. Firewall allows the port

### To use port 5054 instead:
Edit `wdms_listener.py` line with port number, or run:
```powershell
# Start listener on custom port (we'll add this feature)
python wdms_listener.py --port 5054
```

Then configure device with:
- Domain/IP: 105.158.158.169
- Port: 5054

## Testing the Connection

1. Start listener: `python wdms_listener.py`
2. Save device settings and restart device
3. Device should connect within 1-2 minutes
4. You'll see connection logs in the listener

## What You'll See

When device connects successfully:
```
✓ Device connected from 196.206.228.46:xxxxx
✓ Valid ZKTeco packet detected
  Command Type: Real-time Log
  📊 ATTENDANCE RECORD:
     User ID: 1
     Timestamp: 2025-11-18 14:30:45
```

## Troubleshooting

**Device not connecting?**
1. Verify public IP is correct: https://whatismyip.com
2. Check firewall allows incoming on port 8000
3. Verify device has internet connection
4. Check NAT/port forwarding on your router
5. Try restarting the device after saving settings

**Connection drops immediately?**
- Check device WDMS password setting
- Verify protocol settings match

## Integration with FastAPI

Once the listener works, we can integrate it into your FastAPI application to:
- Store attendance in database automatically
- Provide real-time attendance API
- Send notifications when users clock in/out
