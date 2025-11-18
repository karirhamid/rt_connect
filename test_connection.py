"""
Test script to verify connection to ZKTeco device
"""
import sys
from app.services.device_manager import ZKTecoDeviceManager
from app.core import settings

def test_connection():
    print("="*60)
    print("ZKTeco Device Connection Test")
    print("="*60)
    print(f"\nDevice Configuration:")
    print(f"  IP Address: {settings.DEVICE_IP}")
    print(f"  Port: {settings.DEVICE_PORT}")
    print(f"  Timeout: {settings.DEVICE_TIMEOUT}s")
    print(f"  Password: {settings.DEVICE_PASSWORD}")
    print("\n" + "-"*60)
    
    # Create device manager instance
    device_manager = ZKTecoDeviceManager()
    
    try:
        print("\n1. Testing device connection...")
        device_manager.connect()
        print("   ✓ Connection successful!")
        
        print("\n2. Getting device information...")
        device_info = device_manager.get_device_info()
        print(f"   ✓ Device Name: {device_info.device_name}")
        print(f"   ✓ Serial Number: {device_info.serial_number}")
        print(f"   ✓ Firmware Version: {device_info.firmware_version}")
        print(f"   ✓ Platform: {device_info.platform}")
        print(f"   ✓ MAC Address: {device_info.mac_address}")
        print(f"   ✓ User Count: {device_info.user_count}")
        print(f"   ✓ Fingerprint Count: {device_info.fingerprint_count}")
        print(f"   ✓ Attendance Count: {device_info.attendance_count}")
        
        print("\n3. Getting users from device...")
        users = device_manager.get_users()
        print(f"   ✓ Total users: {len(users)}")
        if users:
            print("\n   First 5 users:")
            for user in users[:5]:
                print(f"     - UID: {user.uid}, Name: {user.name}, User ID: {user.user_id}")
        
        print("\n4. Getting attendance records...")
        attendance = device_manager.get_attendance()
        print(f"   ✓ Total attendance records: {len(attendance)}")
        if attendance:
            print("\n   Last 5 attendance records:")
            for record in attendance[-5:]:
                print(f"     - User ID: {record.user_id}, Time: {record.timestamp}, Status: {record.status}")
        
        print("\n" + "="*60)
        print("✓ All tests passed successfully!")
        print("="*60)
        return True
        
    except Exception as e:
        print(f"\n✗ Error: {str(e)}")
        print("\nTroubleshooting tips:")
        print("  1. Verify device IP and port are correct")
        print("  2. Check network connectivity (ping the device)")
        print("  3. Ensure NAT/port forwarding is configured properly")
        print("  4. Verify firewall allows the connection")
        print("  5. Check if device is powered on and connected to network")
        print("  6. Try increasing DEVICE_TIMEOUT in .env file")
        return False
    
    finally:
        if device_manager.conn:
            device_manager.disconnect()
            print("\nConnection closed.")

if __name__ == "__main__":
    success = test_connection()
    sys.exit(0 if success else 1)
