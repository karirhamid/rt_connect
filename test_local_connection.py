"""
Test ZKTeco device on local network
Usage: python test_local_connection.py <device_local_ip>
Example: python test_local_connection.py 192.168.1.100
"""
from zk import ZK
import sys

def test_local_device(ip, port=4370):
    """Test connection to device on local network"""
    print("="*70)
    print(f"Testing ZKTeco Device at {ip}:{port}")
    print("="*70)
    
    scenarios = [
        {"password": 0, "force_udp": False, "desc": "TCP password=0"},
        {"password": 0, "force_udp": True, "desc": "UDP password=0"},
        {"password": 1, "force_udp": False, "desc": "TCP password=1"},
        {"password": 1, "force_udp": True, "desc": "UDP password=1"},
    ]
    
    for scenario in scenarios:
        print(f"\nTrying: {scenario['desc']}")
        try:
            zk = ZK(ip, port=port, timeout=5, 
                   password=scenario['password'],
                   force_udp=scenario['force_udp'],
                   ommit_ping=True)
            conn = zk.connect()
            
            print("  ✓ Connected!")
            device_name = conn.get_device_name()
            serial = conn.get_serialnumber()
            firmware = conn.get_firmware_version()
            users = conn.get_users()
            attendance = conn.get_attendance()
            
            print(f"  ✓ Device: {device_name}")
            print(f"  ✓ Serial: {serial}")
            print(f"  ✓ Firmware: {firmware}")
            print(f"  ✓ Users: {len(users)}")
            print(f"  ✓ Attendance: {len(attendance)}")
            
            conn.disconnect()
            print(f"\n✓✓✓ SUCCESS! Use these settings:")
            print(f"  DEVICE_IP={ip}")
            print(f"  DEVICE_PORT={port}")
            print(f"  DEVICE_PASSWORD={scenario['password']}")
            print(f"  Force UDP: {scenario['force_udp']}")
            return True
            
        except Exception as e:
            print(f"  ✗ Failed: {str(e)[:60]}")
    
    print("\n❌ Could not connect with any configuration")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_local_connection.py <device_ip> [port]")
        print("Example: python test_local_connection.py 192.168.1.100")
        print("Example: python test_local_connection.py 192.168.1.100 4370")
        sys.exit(1)
    
    ip = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 4370
    
    test_local_device(ip, port)
