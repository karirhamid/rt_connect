"""
Comprehensive ZKTeco connection test based on pyzk library examples
Tests all possible configurations and connection methods
"""
from zk import ZK, const
import sys
import time

def test_basic_connection(ip, port, timeout=5, password=0):
    """Test basic connection following pyzk examples"""
    print(f"\n{'='*70}")
    print(f"Testing Basic Connection")
    print(f"{'='*70}")
    
    conn = None
    zk = ZK(ip, port=port, timeout=timeout, password=password, force_udp=False, ommit_ping=False)
    
    try:
        print(f"Connecting to {ip}:{port}...")
        conn = zk.connect()
        print("✓ Connected!")
        
        # Disable device to prevent interference
        print("\nDisabling device...")
        conn.disable_device()
        
        # Get firmware version
        print("\nGetting device info...")
        firmware = conn.get_firmware_version()
        print(f"  Firmware: {firmware}")
        
        # Get serialnumber
        serialnumber = conn.get_serialnumber()
        print(f"  Serial Number: {serialnumber}")
        
        # Get platform
        platform = conn.get_platform()
        print(f"  Platform: {platform}")
        
        # Get device name
        device_name = conn.get_device_name()
        print(f"  Device Name: {device_name}")
        
        # Get MAC address
        mac = conn.get_mac()
        print(f"  MAC: {mac}")
        
        # Get users
        print("\nGetting users...")
        users = conn.get_users()
        print(f"  Total Users: {len(users)}")
        for i, user in enumerate(users[:3]):
            print(f"    User {i+1}: uid={user.uid}, name={user.name}, privilege={user.privilege}, user_id={user.user_id}")
        
        # Get attendance
        print("\nGetting attendance...")
        attendances = conn.get_attendance()
        print(f"  Total Records: {len(attendances)}")
        for i, att in enumerate(attendances[-3:]):
            print(f"    Record {i+1}: uid={att.uid}, user_id={att.user_id}, time={att.timestamp}")
        
        # Get time
        print("\nGetting device time...")
        device_time = conn.get_time()
        print(f"  Device Time: {device_time}")
        
        # Re-enable device
        print("\nRe-enabling device...")
        conn.enable_device()
        
        print(f"\n{'='*70}")
        print("✓✓✓ SUCCESS! All operations completed")
        print(f"{'='*70}")
        return True
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        print(f"Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        if conn:
            conn.disconnect()
            print("\nDisconnected")


def test_udp_connection(ip, port, timeout=5, password=0):
    """Test UDP connection"""
    print(f"\n{'='*70}")
    print(f"Testing UDP Connection")
    print(f"{'='*70}")
    
    conn = None
    zk = ZK(ip, port=port, timeout=timeout, password=password, force_udp=True, ommit_ping=False)
    
    try:
        print(f"Connecting via UDP to {ip}:{port}...")
        conn = zk.connect()
        print("✓ Connected via UDP!")
        
        firmware = conn.get_firmware_version()
        print(f"  Firmware: {firmware}")
        
        print(f"\n{'='*70}")
        print("✓✓✓ UDP CONNECTION SUCCESS!")
        print(f"{'='*70}")
        return True
        
    except Exception as e:
        print(f"\n✗ UDP Error: {e}")
        return False
        
    finally:
        if conn:
            conn.disconnect()


def test_with_ping_omit(ip, port, timeout=5, password=0):
    """Test with ping omitted"""
    print(f"\n{'='*70}")
    print(f"Testing with Ping Omitted")
    print(f"{'='*70}")
    
    conn = None
    zk = ZK(ip, port=port, timeout=timeout, password=password, force_udp=False, ommit_ping=True)
    
    try:
        print(f"Connecting (no ping) to {ip}:{port}...")
        conn = zk.connect()
        print("✓ Connected without ping!")
        
        firmware = conn.get_firmware_version()
        print(f"  Firmware: {firmware}")
        
        print(f"\n{'='*70}")
        print("✓✓✓ NO-PING CONNECTION SUCCESS!")
        print(f"{'='*70}")
        return True
        
    except Exception as e:
        print(f"\n✗ No-ping Error: {e}")
        return False
        
    finally:
        if conn:
            conn.disconnect()


def test_different_passwords(ip, port, timeout=5):
    """Test with different password values"""
    print(f"\n{'='*70}")
    print(f"Testing Different Passwords")
    print(f"{'='*70}")
    
    passwords = [0, 1, 1234, 12345, 123456, 0000, 9999]
    
    for pwd in passwords:
        print(f"\nTrying password: {pwd}")
        zk = ZK(ip, port=port, timeout=timeout, password=pwd, force_udp=False, ommit_ping=True)
        
        try:
            conn = zk.connect()
            print(f"✓ SUCCESS with password={pwd}!")
            
            firmware = conn.get_firmware_version()
            print(f"  Firmware: {firmware}")
            
            conn.disconnect()
            
            print(f"\n{'='*70}")
            print(f"✓✓✓ WORKING PASSWORD FOUND: {pwd}")
            print(f"{'='*70}")
            return pwd
            
        except Exception as e:
            print(f"  ✗ Failed: {str(e)[:60]}")
            
    return None


def test_verbose_mode(ip, port, timeout=5, password=0):
    """Test with verbose mode for debugging"""
    print(f"\n{'='*70}")
    print(f"Testing with Verbose Mode (Debug Output)")
    print(f"{'='*70}")
    
    conn = None
    zk = ZK(ip, port=port, timeout=timeout, password=password, force_udp=False, ommit_ping=True, verbose=True)
    
    try:
        print(f"Connecting to {ip}:{port} (verbose mode)...")
        conn = zk.connect()
        print("✓ Connected!")
        
        firmware = conn.get_firmware_version()
        print(f"  Firmware: {firmware}")
        
        return True
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        return False
        
    finally:
        if conn:
            conn.disconnect()


def main():
    print("="*70)
    print("ZKTeco Device Connection Test Suite")
    print("Based on pyzk library examples and best practices")
    print("="*70)
    
    # Configuration
    ip = "196.206.228.46"
    port = 5054
    timeout = 10
    password = 0
    
    print(f"\nTarget Device:")
    print(f"  IP: {ip}")
    print(f"  Port: {port}")
    print(f"  Timeout: {timeout}s")
    print(f"  Default Password: {password}")
    print("\nNOTE: WDMS should be DISABLED for these tests")
    
    input("\nPress Enter to start tests...")
    
    # Test sequence
    tests = [
        ("Basic TCP Connection", lambda: test_basic_connection(ip, port, timeout, password)),
        ("TCP with Ping Omitted", lambda: test_with_ping_omit(ip, port, timeout, password)),
        ("UDP Connection", lambda: test_udp_connection(ip, port, timeout, password)),
        ("Different Passwords", lambda: test_different_passwords(ip, port, timeout)),
        ("Verbose Debug Mode", lambda: test_verbose_mode(ip, port, timeout, password)),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n\n{'#'*70}")
        print(f"# Running: {test_name}")
        print(f"{'#'*70}")
        
        try:
            result = test_func()
            results.append((test_name, result))
        except KeyboardInterrupt:
            print("\n\nTest interrupted by user")
            break
        except Exception as e:
            print(f"\n✗ Test failed with exception: {e}")
            results.append((test_name, False))
        
        time.sleep(1)
    
    # Summary
    print(f"\n\n{'='*70}")
    print("TEST SUMMARY")
    print(f"{'='*70}")
    
    for test_name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {test_name}")
    
    successful = [name for name, result in results if result]
    
    if successful:
        print(f"\n{'='*70}")
        print("✓✓✓ SOME TESTS PASSED!")
        print(f"{'='*70}")
        print("\nWorking methods:")
        for name in successful:
            print(f"  - {name}")
    else:
        print(f"\n{'='*70}")
        print("❌ ALL TESTS FAILED")
        print(f"{'='*70}")
        print("\nPossible reasons:")
        print("  1. Device is not accessible at this IP:port")
        print("  2. WDMS is still enabled (disable it completely)")
        print("  3. Another device/software is connected")
        print("  4. Device requires specific initialization")
        print("  5. Firewall/NAT blocking the connection")
        print("  6. Device in special mode (standalone, etc.)")
        print("\nRecommendations:")
        print("  - Try from local network (not through NAT)")
        print("  - Verify WDMS is completely disabled")
        print("  - Check device is not in standalone mode")
        print("  - Ensure no other software is connected")
        print("  - Try with device's local IP on port 4370")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nTest suite interrupted")
        sys.exit(0)
