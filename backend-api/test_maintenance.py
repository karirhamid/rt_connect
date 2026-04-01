#!/usr/bin/env python
"""
Quick test script for maintenance backup/restore endpoints
Run this from the backend-api directory with: python test_maintenance.py
"""
import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

# Configuration
BASE_URL = os.getenv('API_URL', 'http://localhost:8000')
ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'admin123')

def test_maintenance():
    """Test maintenance backup/restore endpoints"""
    
    print(f"Testing maintenance endpoints at {BASE_URL}")
    print("=" * 60)
    
    # Step 1: Login
    print("\n1. Logging in as admin...")
    login_response = requests.post(
        f'{BASE_URL}/api/auth/login',
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
        data={'username': ADMIN_USERNAME, 'password': ADMIN_PASSWORD}
    )
    
    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.status_code}")
        print(login_response.text)
        return
    
    token_data = login_response.json()
    access_token = token_data.get('access_token')
    print(f"✅ Login successful. Token: {access_token[:20]}...")
    
    headers = {'Authorization': f'Bearer {access_token}'}
    
    # Step 2: List backups
    print("\n2. Listing existing backups...")
    list_response = requests.get(
        f'{BASE_URL}/api/maintenance/backups',
        headers=headers
    )
    
    if list_response.status_code != 200:
        print(f"❌ List backups failed: {list_response.status_code}")
        print(list_response.text)
        return
    
    backups_data = list_response.json()
    print(f"✅ Found {len(backups_data.get('backups', []))} backups")
    print(f"   Total size: {backups_data.get('total_size_mb', 0)} MB")
    
    # Step 3: Create backup
    print("\n3. Creating a new backup...")
    create_response = requests.post(
        f'{BASE_URL}/api/maintenance/backup',
        headers=headers
    )
    
    if create_response.status_code != 200:
        print(f"❌ Backup creation failed: {create_response.status_code}")
        print(create_response.text)
        return
    
    backup_info = create_response.json()
    backup_filename = backup_info.get('filename')
    print(f"✅ Backup created: {backup_filename}")
    print(f"   Created at: {backup_info.get('created_at')}")
    
    # Step 4: List backups again
    print("\n4. Listing backups after creation...")
    list_response2 = requests.get(
        f'{BASE_URL}/api/maintenance/backups',
        headers=headers
    )
    
    if list_response2.status_code == 200:
        backups_data2 = list_response2.json()
        print(f"✅ Now have {len(backups_data2.get('backups', []))} backups")
    
    # Step 5: Download backup
    print(f"\n5. Downloading backup: {backup_filename}...")
    download_response = requests.get(
        f'{BASE_URL}/api/maintenance/backup/{backup_filename}',
        headers=headers
    )
    
    if download_response.status_code != 200:
        print(f"❌ Download failed: {download_response.status_code}")
        return
    
    # Save to file
    local_path = f'./backups/{backup_filename}'
    with open(local_path, 'wb') as f:
        f.write(download_response.content)
    
    file_size = os.path.getsize(local_path)
    print(f"✅ Downloaded to {local_path} ({file_size} bytes)")
    
    print("\n" + "=" * 60)
    print("✅ All tests passed!")

if __name__ == '__main__':
    test_maintenance()
