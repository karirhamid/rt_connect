"""
Test different passwords and connection parameters
"""
from zk import ZK
import time

def test_with_password(ip, port, password, force_udp=False):
    """Test connection with specific password"""
    protocol = "UDP" if force_udp else "TCP"
    try:
        print(f"  Testing password={password} via {protocol}...", end=" ")
        zk = ZK(ip, port=port, timeout=5, password=password, force_udp=force_udp, ommit_ping=True, verbose=False)
        conn = zk.connect()
        print("✓ SUCCESS!")
        
        # Get device info
        try:
            serial = conn.get_serialnumber()
            name = conn.get_device_name()
            firmware = conn.get_firmware_version()
            print(f"    Device: {name}")
            print(f"    Serial: {serial}")
            print(f"    Firmware: {firmware}")
            
            # Try to get users
            users = conn.get_users()
            print(f"    Users: {len(users)}")
            
            conn.disconnect()
            return True
        except Exception as e:
            print(f"    Connected but error getting info: {e}")
            conn.disconnect()
            return True
            
    except Exception as e:
        error_str = str(e)
        if "10054" in error_str:
            print("✗ (Connection closed by device)")
        elif "timed out" in error_str:
            print("✗ (Timeout)")
        else:
            print(f"✗ ({error_str[:50]}...)" if len(error_str) > 50 else f"✗ ({error_str})")
        return False

def main():
    print("="*70)
    print("ZKTeco Device Password Test")
    print("="*70)
    
    ip = "196.206.228.46"
    port = 5054
    
    # Common passwords for ZKTeco devices
    passwords = [0, 1, 12345, 123456, 1234, 0000, 9999]
    
    print(f"\nTesting device at {ip}:{port}")
    print("\n" + "-"*70)
    print("Testing with TCP protocol:")
    print("-"*70)
    
    success = False
    for password in passwords:
        if test_with_password(ip, port, password, force_udp=False):
            success = True
            break
        time.sleep(0.5)
    
    if not success:
        print("\n" + "-"*70)
        print("Testing with UDP protocol:")
        print("-"*70)
        
        for password in passwords:
            if test_with_password(ip, port, password, force_udp=True):
                success = True
                break
            time.sleep(0.5)
    
    if not success:
        print("\n" + "="*70)
        print("❌ Could not connect with any common password")
        print("="*70)
        print("\nPossible issues:")
        print("1. Device has custom password - check device configuration")
        print("2. Device firmware doesn't support standard protocol")
        print("3. Device is in standalone mode or has network issues")
        print("4. Another software is connected (devices have connection limits)")
        print("5. NAT/firewall is blocking the actual device protocol packets")
        print("\nWhat to check:")
        print("- Try connecting from the same local network (not through NAT)")
        print("- Check device manual for default password")
        print("- Verify no other software is connected to the device")
        print("- Check if device web interface is accessible")
    else:
        print("\n" + "="*70)
        print("✓ Connection successful! Update your .env file if needed.")
        print("="*70)

if __name__ == "__main__":
    main()
