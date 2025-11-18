"""
Advanced diagnostic tool for ZKTeco device connection
"""
import socket
from zk import ZK
import time

def test_raw_connection(ip, port):
    """Test raw TCP connection"""
    print(f"\n[TEST 1] Raw TCP connection to {ip}:{port}")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex((ip, port))
        if result == 0:
            print(f"  ✓ TCP port {port} is open")
            sock.close()
            return True
        else:
            print(f"  ✗ TCP port {port} is closed or unreachable (error code: {result})")
            sock.close()
            return False
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False

def test_udp_connection(ip, port):
    """Test UDP connection"""
    print(f"\n[TEST 2] UDP connection to {ip}:{port}")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(5)
        # Send a simple packet
        sock.sendto(b'test', (ip, port))
        print(f"  ✓ UDP packet sent to {port}")
        sock.close()
        return True
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False

def test_zk_connection(ip, port, force_udp=False, ommit_ping=True, timeout=10):
    """Test ZK library connection"""
    protocol = "UDP" if force_udp else "TCP"
    ping_status = "without ping" if ommit_ping else "with ping"
    print(f"\n[TEST 3] ZK library via {protocol} ({ping_status}) to {ip}:{port}")
    
    try:
        zk = ZK(ip, port=port, timeout=timeout, password=0, force_udp=force_udp, ommit_ping=ommit_ping, verbose=True)
        conn = zk.connect()
        print(f"  ✓ Connected successfully!")
        
        # Try to get basic info
        try:
            serial = conn.get_serialnumber()
            print(f"  ✓ Serial number: {serial}")
        except Exception as e:
            print(f"  ⚠ Could not get serial number: {e}")
        
        conn.disconnect()
        return True
    except Exception as e:
        print(f"  ✗ Connection failed: {e}")
        return False

def main():
    print("="*70)
    print("ZKTeco Device Advanced Diagnostics")
    print("="*70)
    
    # Test configurations
    configs = [
        ("196.206.228.46", 5054, "Public IP with NAT port"),
        ("196.206.228.46", 4370, "Public IP with local port"),
    ]
    
    for ip, port, description in configs:
        print(f"\n{'='*70}")
        print(f"Testing: {description}")
        print(f"Address: {ip}:{port}")
        print(f"{'='*70}")
        
        # Test raw TCP
        tcp_ok = test_raw_connection(ip, port)
        
        # Test UDP
        udp_ok = test_udp_connection(ip, port)
        
        if tcp_ok or udp_ok:
            # Test ZK library with different configurations
            print("\n" + "-"*70)
            print("Testing ZK library with different configurations:")
            print("-"*70)
            
            # TCP with ping
            test_zk_connection(ip, port, force_udp=False, ommit_ping=False, timeout=10)
            time.sleep(1)
            
            # TCP without ping
            test_zk_connection(ip, port, force_udp=False, ommit_ping=True, timeout=10)
            time.sleep(1)
            
            # UDP without ping
            test_zk_connection(ip, port, force_udp=True, ommit_ping=True, timeout=10)
            time.sleep(1)
    
    print("\n" + "="*70)
    print("Diagnostics Complete")
    print("="*70)
    print("\nRecommendations:")
    print("1. If TCP port is open but ZK connection fails, the device might:")
    print("   - Have a different password (try 1, 12345, etc.)")
    print("   - Be in a different mode or firmware")
    print("   - Require specific initialization")
    print("2. If only UDP works, configure force_udp=True in device_manager.py")
    print("3. If port 4370 works but 5054 doesn't, update .env with DEVICE_PORT=4370")
    print("4. Check if device has connection limit (some devices allow only 1-5 connections)")

if __name__ == "__main__":
    main()
