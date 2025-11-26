import re

with open('backend-api/app/services/sync_service.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Add privilege mapping after dictionary
content = re.sub(
    r"('card': user\.card\s*}\s*)(# Check if employee exists)",
    r"\1\n                    \n                    # Map device privilege to app privilege: 6->14 (admin), 0->0 (user)\n                    device_privilege = user_data['privilege']\n                    app_privilege = 14 if device_privilege == 6 else 0\n                    \n                    \2",
    content
)

# Fix 2: Don't update privilege for existing employees
content = re.sub(
    r"db_employee\.privilege = user_data\['privilege'\]",
    r"# db_employee.privilege = DON'T UPDATE - preserve manual changes",
    content
)

# Fix 3: Use mapped privilege for new employees
content = re.sub(
    r"(privilege=)user_data\['privilege'\],",
    r'\1app_privilege,  # Use mapped privilege',
    content
)

# Fix 4: Add logging for new employees with privilege mapping
content = re.sub(
    r"(logger\.info\(f\"Created new employee user_id=\{user_data\['user_id'\]\})",
    r"logger.info(f\"Created new employee user_id={user_data['user_id']} ({user_data['name']}, device_priv={device_privilege}->app_priv={app_privilege})",
    content
)

with open('backend-api/app/services/sync_service.py', 'w', encoding='utf-8') as f:
    f.write(content)
    
print('✅ File updated successfully')
print('✅ Added privilege mapping (device 6->app 14)')
print('✅ Disabled privilege overwrite for existing employees')
print('✅ New employees will use mapped privilege')
print('✅ Added detailed logging for privilege mapping')
