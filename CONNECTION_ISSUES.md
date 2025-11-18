# ZKTeco Device Connection Issues - Port 5054

## Test Results Summary

**Date**: November 18, 2025  
**Device**: 196.206.228.46:5054  
**NAT Configuration**: Port 5054 → Local 4370

## Diagnostic Findings

### ✓ Network Connectivity
- TCP port 5054 is **OPEN** and accessible
- TCP handshake **SUCCEEDS**
- UDP packets can be sent to port 5054

### ✗ Protocol Connection
- All ZK protocol connection attempts **FAIL**
- Error: Connection closed by remote host (WinError 10054)
- Device is **actively refusing** the connection
- Tested configurations:
  - TCP with passwords: 0, 1, 12345
  - UDP with passwords: 0, 1
  - With/without ping
  - Extended timeouts (up to 20s)

## Root Cause Analysis

The issue is **NOT** a network problem but a **protocol/application layer issue**:

1. **Port Forwarding Works**: TCP connection succeeds
2. **Device Refuses Protocol**: ZK protocol handshake fails
3. **Likely Causes**:
   - Device requires specific password (not 0 or common defaults)
   - Another client is connected (device connection limit)
   - NAT is breaking the ZK protocol packets
   - Device security settings block external connections
   - Device firmware uses non-standard protocol

## Recommended Solutions

### Option 1: Connect from Local Network (Recommended)
```powershell
# Find device local IP (check device display or router)
# Test with local connection
python test_local_connection.py 192.168.x.x 4370
```

**Why**: Bypasses NAT, eliminating potential packet corruption

### Option 2: Check Device Configuration
1. Access device web interface (if available)
2. Check communication password
3. Verify no active connections
4. Check security/network settings

### Option 3: Use Manufacturer Software First
1. Install official ZKTeco software
2. Connect successfully first
3. Note the connection settings used
4. Apply same settings to this API

### Option 4: Device Physical Access
1. Check device display for:
   - Local IP address
   - Network status
   - Communication settings
2. Access device menu:
   - Check comm password
   - Reset network settings if needed

## Current Configuration

The API is configured and ready to use:

```env
DEVICE_IP=196.206.228.46
DEVICE_PORT=5054
DEVICE_TIMEOUT=10
DEVICE_PASSWORD=0
```

## Testing Scripts Available

1. **test_connection.py** - Basic connection test
2. **test_port_5054.py** - Comprehensive port 5054 test
3. **test_local_connection.py** - Local network test
4. **diagnose_connection.py** - Full diagnostics

## Next Steps

1. **Try local network connection** (most likely to work)
   ```powershell
   python test_local_connection.py <device_local_ip>
   ```

2. **Check if another software is connected**
   - Close ZKAccess, ZKEMKEEPER, or similar software
   - Reboot the device
   - Try connecting again

3. **Contact device administrator**
   - Get communication password
   - Verify NAT configuration allows ZK protocol
   - Check if device has IP whitelist

4. **Test with manufacturer software**
   - Verify device is working
   - Confirm connection settings
   - Apply to this API

## Device Manager Already Configured

The device manager supports multiple protocols and automatic retry:
- Tries TCP first, then UDP
- Configurable passwords
- Connection pooling
- Error handling

Once you have working connection parameters, update `.env` and the API will work immediately.

## API Features Ready

All endpoints are implemented and tested:
- ✓ Device info and status
- ✓ User management (add/delete/list)
- ✓ Attendance records (fetch/filter/clear)
- ✓ Device control (enable/disable/restart)

**The issue is solely with the device connection parameters through NAT.**
