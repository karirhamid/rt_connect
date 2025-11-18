"""
Test ZKTeco device with WDMS (Wireless Device Management System) enabled
WDMS devices may use different connection methods
"""
from zk import ZK
import socket
import struct
import time

def test_wdms_connection(ip, port):
    """Test connection for WDMS-enabled device"""
    print("="*80)
    print("ZKTeco WDMS Device Connection Test")
    print("="*80)
    print(f"\nDevice: {ip}:{port}")
    print("WDMS Mode: Enabled")
    print("\nWDMS devices may require:")
    print("  - Push protocol (device pushes data to server)")
    print("  - Different initialization sequence")
    print("  - Server mode listening for device connection")
    print("\n" + "-"*80)
    
    # Test 1: Standard ZK connection with different settings
    print("\n[Test 1] Standard ZK Protocol with WDMS compatibility")
    
    configs = [
        {"password": 0, "force_udp": False, "ommit_ping": True, "sdk_build_1": True},
        {"password": 0, "force_udp": True, "ommit_ping": True, "sdk_build_1": True},
        {"password": 0, "force_udp": False, "ommit_ping": False, "sdk_build_1": True},
        {"password": 1, "force_udp": False, "ommit_ping": True, "sdk_build_1": True},
        {"password": 0, "force_udp": False, "ommit_ping": True, "sdk_build_1": False},
    ]
    
    for i, config in enumerate(configs, 1):
        try:
            desc = f"{'UDP' if config['force_udp'] else 'TCP'}, pwd={config['password']}, ping={'off' if config['ommit_ping'] else 'on'}, sdk={config['sdk_build_1']}"
            print(f"\n  [{i}] Testing: {desc}")
            
            zk = ZK(
                ip,
                port=port,
                timeout=10,
                password=config['password'],
                force_udp=config['force_udp'],
                ommit_ping=config['ommit_ping'],
                verbose=False
            )
            
            conn = zk.connect()
            
            # Try to set SDK build if needed
            if config.get('sdk_build_1'):
                try:
                    conn.set_sdk_build_1()
                except:
                    pass
            
            print(f"      ✓ Connected successfully!")
            
            # Get device info
            try:
                serial = conn.get_serialnumber()
                device_name = conn.get_device_name()
                firmware = conn.get_firmware_version()
                platform = conn.get_platform()
                
                print(f"      ✓ Device: {device_name}")
                print(f"      ✓ Serial: {serial}")
                print(f"      ✓ Firmware: {firmware}")
                print(f"      ✓ Platform: {platform}")
                
                # Get users
                users = conn.get_users()
                print(f"      ✓ Users: {len(users)}")
                
                # Get attendance
                attendance = conn.get_attendance()
                print(f"      ✓ Attendance: {len(attendance)}")
                
                conn.disconnect()
                
                print(f"\n{'='*80}")
                print("✓✓✓ SUCCESS! Connection established with WDMS device ✓✓✓")
                print("="*80)
                print("\nWorking Configuration:")
                print(f"  DEVICE_IP={ip}")
                print(f"  DEVICE_PORT={port}")
                print(f"  DEVICE_PASSWORD={config['password']}")
                print(f"  Protocol: {'UDP' if config['force_udp'] else 'TCP'}")
                print(f"  Ping: {'Disabled' if config['ommit_ping'] else 'Enabled'}")
                print(f"  SDK Build: {config['sdk_build_1']}")
                return True
                
            except Exception as e:
                print(f"      ⚠ Connected but error getting data: {e}")
                try:
                    conn.disconnect()
                except:
                    pass
                
        except Exception as e:
            error_msg = str(e)
            if "10054" in error_msg:
                print(f"      ✗ Connection refused")
            elif "timed out" in error_msg:
                print(f"      ✗ Timeout")
            else:
                print(f"      ✗ {error_msg[:50]}")
        
        time.sleep(0.3)
    
    # Test 2: Check if device is in push mode (WDMS push protocol)
    print("\n" + "-"*80)
    print("\n[Test 2] WDMS Push Protocol Check")
    print("\nNote: WDMS devices in push mode need a server to listen for connections.")
    print("The device pushes data to a configured server IP/port.")
    print("\nTo use WDMS push mode:")
    print("  1. Configure device to push to your server IP")
    print("  2. Set up a listener on a port (e.g., 8000)")
    print("  3. Device will connect and push attendance data")
    
    return False

def check_wdms_settings():
    """Provide information about WDMS settings"""
    print("\n" + "="*80)
    print("WDMS (Wireless Device Management System) Information")
    print("="*80)
    print("\nWDMS devices can operate in different modes:")
    print("\n1. PULL Mode (Standard):")
    print("   - Server connects to device")
    print("   - Server requests data from device")
    print("   - This is what we've been testing")
    
    print("\n2. PUSH Mode:")
    print("   - Device connects to server")
    print("   - Device pushes attendance data automatically")
    print("   - Requires server listener")
    
    print("\n3. HTTP/SOAP Mode:")
    print("   - Device pushes via HTTP/SOAP protocol")
    print("   - Requires web service endpoint")
    
    print("\nDevice Configuration Needed:")
    print("  - Check device WDMS settings")
    print("  - Note the communication mode")
    print("  - If push mode: note server IP/port it's configured to push to")
    print("  - If pull mode: ensure device allows incoming connections")
    
    print("\nCommon WDMS Issues:")
    print("  - Device in push mode but no server listening")
    print("  - Firewall blocking incoming connections from device")
    print("  - Incorrect server IP configured in device")
    print("  - Device requires ADMS/WDMS cloud service")
    
    print("\nRecommended Actions:")
    print("  1. Access device settings (via keypad/display)")
    print("  2. Check WDMS configuration:")
    print("     - Communication mode (Pull/Push)")
    print("     - Server IP address")
    print("     - Server port")
    print("     - Communication password")
    print("  3. If push mode: Set up server listener")
    print("  4. If pull mode: Ensure device accepts connections")
    print("  5. Try disabling WDMS temporarily to test standard connection")

def main():
    ip = "196.206.228.46"
    port = 5054
    
    success = test_wdms_connection(ip, port)
    
    if not success:
        print("\n" + "="*80)
        print("❌ Standard connection attempts failed")
        print("="*80)
        check_wdms_settings()
        
        print("\n" + "="*80)
        print("Next Steps:")
        print("="*80)
        print("\n1. Check device WDMS settings:")
        print("   - Go to device menu: Comm → WDMS")
        print("   - Note the mode and settings")
        print("   - Check server IP and port configured")
        
        print("\n2. Try these options:")
        print("   a) Disable WDMS temporarily and test")
        print("   b) Configure WDMS push to your server IP")
        print("   c) Ensure pull mode is enabled if using standard connection")
        
        print("\n3. Alternative: Use device web interface")
        print(f"   - Try accessing: http://{ip}")
        print("   - Check communication settings")
        
        print("\n4. Provide more details:")
        print("   - What mode is WDMS set to? (Push/Pull)")
        print("   - What server IP/port is configured?")
        print("   - Is there a communication password set?")
    
    print("\n" + "="*80)

if __name__ == "__main__":
    main()
