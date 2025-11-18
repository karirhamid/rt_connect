"""
Test FastAPI endpoints
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_endpoints():
    print("="*70)
    print("Testing ZKTeco Management API")
    print("="*70)
    
    # Test root endpoint
    print("\n[1] Testing root endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/")
        print(f"Status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test health endpoint
    print("\n[2] Testing health endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"Status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test device info
    print("\n[3] Getting device information...")
    try:
        response = requests.get(f"{BASE_URL}/api/device/info")
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Device Name: {data['device_name']}")
        print(f"Serial: {data['serial_number']}")
        print(f"Firmware: {data['firmware_version']}")
        print(f"Platform: {data['platform']}")
        print(f"Users: {data['user_count']}")
        print(f"Attendance Records: {data['attendance_count']}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test get users
    print("\n[4] Getting users...")
    try:
        response = requests.get(f"{BASE_URL}/api/users/")
        print(f"Status: {response.status_code}")
        users = response.json()
        print(f"Total Users: {len(users)}")
        print("\nFirst 5 users:")
        for user in users[:5]:
            print(f"  - {user['name']} (ID: {user['user_id']}, UID: {user['uid']})")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test get attendance
    print("\n[5] Getting attendance records...")
    try:
        response = requests.get(f"{BASE_URL}/api/attendance/")
        print(f"Status: {response.status_code}")
        attendance = response.json()
        print(f"Total Records: {len(attendance)}")
        print("\nLast 5 records:")
        for record in attendance[-5:]:
            print(f"  - User {record['user_id']}: {record['timestamp']}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test attendance with filter
    print("\n[6] Getting attendance for specific user...")
    try:
        response = requests.get(f"{BASE_URL}/api/attendance/?user_id=49")
        print(f"Status: {response.status_code}")
        attendance = response.json()
        print(f"Records for user 49: {len(attendance)}")
        if attendance:
            print("\nLast 3 records:")
            for record in attendance[-3:]:
                print(f"  - {record['timestamp']}")
    except Exception as e:
        print(f"Error: {e}")
    
    print("\n" + "="*70)
    print("✓ API Test Complete!")
    print("="*70)
    print(f"\nAPI Documentation: {BASE_URL}/docs")
    print(f"Alternative Docs: {BASE_URL}/redoc")

if __name__ == "__main__":
    test_endpoints()
