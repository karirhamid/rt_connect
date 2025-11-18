"""
Simple VPN connection test with better error handling
"""
from zk import ZK
import time

def test_vpn_connection():
    print("="*70)
    print("ZKTeco Device Test via VPN")
    print("="*70)
    
    ip = "10.185.1.201"
    port = 4370
    
    # Test TCP
    print(f"\n[Test 1] TCP Connection")
    print(f"Connecting to {ip}:{port}...")
    
    zk = ZK(ip, port=port, timeout=30, password=0, force_udp=False, ommit_ping=True)
    
    try:
        conn = zk.connect()
        print("✓ Connected via TCP!")
        
        # Test basic command
        print("\nDisabling device...")
        conn.disable_device()
        print("✓ Device disabled")
        
        time.sleep(1)
        
        print("\nGetting firmware...")
        firmware = conn.get_firmware_version()
        print(f"✓ Firmware: {firmware}")
        
        print("\nGetting serial number...")
        serial = conn.get_serialnumber()
        print(f"✓ Serial: {serial}")
        
        print("\nGetting users...")
        users = conn.get_users()
        print(f"✓ Users: {len(users)}")
        
        if users:
            print("\nFirst 3 users:")
            for user in users[:3]:
                print(f"  - {user.name} (ID: {user.user_id})")
        
        print("\nGetting attendance...")
        attendance = conn.get_attendance()
        print(f"✓ Attendance records: {len(attendance)}")
        
        if attendance:
            print("\nLast 3 attendance records:")
            for att in attendance[-3:]:
                print(f"  - User {att.user_id}: {att.timestamp}")
        
        print("\nRe-enabling device...")
        conn.enable_device()
        print("✓ Device enabled")
        
        conn.disconnect()
        
        print("\n" + "="*70)
        print("✓✓✓ SUCCESS! All operations completed")
        print("="*70)
        return True
        
    except Exception as e:
        print(f"\n✗ TCP Error: {e}")
        
    # Test UDP if TCP times out
    print(f"\n[Test 2] UDP Connection")
    print(f"Connecting to {ip}:{port} via UDP...")
    
    zk = ZK(ip, port=port, timeout=30, password=0, force_udp=True, ommit_ping=True)
    
    try:
        conn = zk.connect()
        print("✓ Connected via UDP!")
        
        print("\nGetting firmware...")
        firmware = conn.get_firmware_version()
        print(f"✓ Firmware: {firmware}")
        
        print("\nGetting users...")
        users = conn.get_users()
        print(f"✓ Users: {len(users)}")
        
        conn.disconnect()
        
        print("\n" + "="*70)
        print("✓✓✓ UDP SUCCESS!")
        print("="*70)
        print("\nNote: Update device_manager.py to use force_udp=True")
        return True
        
    except Exception as e:
        print(f"\n✗ UDP Error: {e}")
        
    return False

if __name__ == "__main__":
    test_vpn_connection()
