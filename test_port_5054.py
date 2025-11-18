"""
Comprehensive ZKTeco device test for port 5054
Tests multiple scenarios to identify connection issues
"""
from zk import ZK
import time
import sys

def test_connection_scenario(ip, port, description, **kwargs):
    """Test a specific connection scenario"""
    print(f"\n  Testing: {description}")
    try:
        zk = ZK(ip, port=port, timeout=kwargs.get('timeout', 5), 
                password=kwargs.get('password', 0),
                force_udp=kwargs.get('force_udp', False),
                ommit_ping=kwargs.get('ommit_ping', True),
                verbose=kwargs.get('verbose', False))
        
        conn = zk.connect()
        print(f"    ✓ Connected successfully!")
        
        # Try to get device information
        try:
            serial = conn.get_serialnumber()
            device_name = conn.get_device_name()
            firmware = conn.get_firmware_version()
            platform = conn.get_platform()
            
            print(f"    ✓ Device Name: {device_name}")
            print(f"    ✓ Serial: {serial}")
            print(f"    ✓ Firmware: {firmware}")
            print(f"    ✓ Platform: {platform}")
            
            # Get users
            users = conn.get_users()
            print(f"    ✓ Total Users: {len(users)}")
            
            # Get attendance
            attendance = conn.get_attendance()
            print(f"    ✓ Total Attendance Records: {len(attendance)}")
            
            conn.disconnect()
            print(f"    ✓ SUCCESS - This configuration works!")
            return True
            
        except Exception as e:
            print(f"    ⚠ Connected but error getting data: {e}")
            try:
                conn.disconnect()
            except:
                pass
            return False
            
    except Exception as e:
        error_msg = str(e)
        if "10054" in error_msg:
            print(f"    ✗ Connection refused by device")
        elif "timed out" in error_msg:
            print(f"    ✗ Connection timeout")
        elif "10061" in error_msg:
            print(f"    ✗ Connection actively refused")
        else:
            print(f"    ✗ Error: {error_msg[:60]}")
        return False

def main():
    print("="*80)
    print("ZKTeco Device Connection Test - Port 5054")
    print("="*80)
    
    ip = "196.206.228.46"
    port = 5054
    
    print(f"\nDevice Address: {ip}:{port}")
    print(f"Note: Port 5054 is NAT forwarded to local device port 4370")
    
    # Test scenarios
    scenarios = [
        # Different passwords with TCP
        {"description": "TCP, password=0, no ping", "password": 0, "force_udp": False, "ommit_ping": True},
        {"description": "TCP, password=0, with ping", "password": 0, "force_udp": False, "ommit_ping": False},
        {"description": "TCP, password=1, no ping", "password": 1, "force_udp": False, "ommit_ping": True},
        {"description": "TCP, password=12345, no ping", "password": 12345, "force_udp": False, "ommit_ping": True},
        
        # UDP options
        {"description": "UDP, password=0, no ping", "password": 0, "force_udp": True, "ommit_ping": True},
        {"description": "UDP, password=1, no ping", "password": 1, "force_udp": True, "ommit_ping": True},
        
        # Extended timeout
        {"description": "TCP, password=0, timeout=20s", "password": 0, "force_udp": False, "ommit_ping": True, "timeout": 20},
        {"description": "UDP, password=0, timeout=20s", "password": 0, "force_udp": True, "ommit_ping": True, "timeout": 20},
        
        # Verbose mode for debugging
        {"description": "TCP, password=0, verbose mode", "password": 0, "force_udp": False, "ommit_ping": True, "verbose": True},
    ]
    
    print("\n" + "="*80)
    print("Running Connection Tests...")
    print("="*80)
    
    success = False
    working_config = None
    
    for i, scenario in enumerate(scenarios, 1):
        print(f"\n[Test {i}/{len(scenarios)}]")
        if test_connection_scenario(ip, port, **scenario):
            success = True
            working_config = scenario
            break
        time.sleep(0.5)
    
    print("\n" + "="*80)
    if success:
        print("✓✓✓ CONNECTION SUCCESSFUL! ✓✓✓")
        print("="*80)
        print("\nWorking Configuration:")
        print(f"  - Password: {working_config['password']}")
        print(f"  - Protocol: {'UDP' if working_config['force_udp'] else 'TCP'}")
        print(f"  - Ping: {'Disabled' if working_config['ommit_ping'] else 'Enabled'}")
        print(f"  - Timeout: {working_config.get('timeout', 5)}s")
        print("\nUpdate your .env file:")
        print(f"  DEVICE_IP=196.206.228.46")
        print(f"  DEVICE_PORT=5054")
        print(f"  DEVICE_PASSWORD={working_config['password']}")
        print(f"  DEVICE_TIMEOUT={working_config.get('timeout', 10)}")
        if working_config['force_udp']:
            print(f"\nAlso update device_manager.py:")
            print(f"  Set force_udp=True in __init__ method")
    else:
        print("❌ ALL CONNECTION ATTEMPTS FAILED")
        print("="*80)
        print("\nDiagnostic Information:")
        print("  - Port 5054 is accessible (TCP handshake works)")
        print("  - Device is actively closing the connection")
        print("  - This suggests a protocol/configuration mismatch")
        
        print("\nPossible Causes:")
        print("  1. Device requires a specific/custom password")
        print("  2. Device is already connected to another client (connection limit)")
        print("  3. Device firmware uses non-standard protocol")
        print("  4. NAT is interfering with the protocol packets")
        print("  5. Device security settings block external connections")
        
        print("\nRecommended Actions:")
        print("  1. Check device configuration panel/web interface for:")
        print("     - Communication password")
        print("     - Connection settings")
        print("     - Active connections")
        print("  2. Try connecting from the local network (bypass NAT):")
        print("     - Find device local IP (usually 192.168.x.x)")
        print("     - Use port 4370 directly")
        print("  3. Check device manual for:")
        print("     - Default password")
        print("     - Required connection settings")
        print("  4. Disconnect any other software (ZKAccess, ZKEMKEEPER, etc.)")
        print("  5. Try the device manufacturer's official software first")
        print("  6. Reset device network settings to factory defaults")
        
        print("\nAlternative Test:")
        print("  If you have access to the local network, try:")
        print("  - Find local IP: Check device display or router DHCP")
        print("  - Test: python test_local_connection.py <local_ip>")
    
    print("="*80)
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
