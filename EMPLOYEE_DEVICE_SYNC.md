# Employee-Device Synchronization

## Problem Solved
When you update an employee's information (name, role/privilege, card number, etc.) in the database, those changes now automatically sync to all registered ZKTeco devices. This ensures that:

1. **Role changes** (Admin ↔ User) are reflected on devices immediately
2. **Name updates** are pushed to devices
3. **Card number changes** are synced
4. **New employees** are automatically added to all devices
5. **Deleted employees** are removed from all devices

## How It Works

### Backend Changes:

1. **New Method in device_manager.py:**
   - `update_user()` - Updates user information on ZKTeco device
   - Works by deleting old user and re-adding with new information

2. **New Helper Function in organization.py:**
   - `sync_employee_to_devices()` - Syncs employee to all registered devices
   - Supports create, update, and delete operations
   - Handles errors gracefully per device

3. **Enhanced API Endpoints:**
   - `POST /api/employees` - Creates employee and syncs to devices
   - `PUT /api/employees/{id}` - Updates employee and syncs changes
   - `DELETE /api/employees/{id}` - Deletes from DB and devices

### Synchronization Flow:

```
User Updates Employee
        ↓
Database Updated
        ↓
Sync to Device 1 ← [Your devices]
Sync to Device 2
Sync to Device 3
        ↓
Response with status
```

### Error Handling:

- If a device is offline, the operation still succeeds in the database
- Sync warnings are logged and returned in the response
- User is notified if some devices couldn't sync
- Next time the device syncs, it will pull the latest data

## Usage

1. **Update Employee Role:**
   - Go to Employees page
   - Click edit on any employee
   - Change Role from User to Admin (or vice versa)
   - Click Save
   - Change is immediately pushed to all devices
   - Reload page - role remains as you set it ✓

2. **Update Employee Name:**
   - Edit employee name
   - Save changes
   - Name updates on all devices
   - Device will show new name on next access

3. **Update Card Number:**
   - Change card_number field
   - Save
   - Device accepts new card for this employee

4. **Add New Employee:**
   - Click "Add Employee"
   - Fill all details
   - Save
   - Employee is created in DB and added to all devices

5. **Delete Employee:**
   - Click delete on employee
   - Confirm deletion
   - Employee removed from DB and all devices

## Technical Details

### Device Sync Function:
```python
def sync_employee_to_devices(employee, operation):
    """
    operation: 'create', 'update', or 'delete'
    """
    devices = device_store.get_all()
    
    for device in devices:
        manager = ZKTecoDeviceManager(device.ip, device.port)
        
        if operation == "delete":
            manager.delete_user(employee.device_user_id)
        else:
            manager.update_user(
                uid=employee.device_user_id,
                name=employee.name,
                privilege=employee.privilege,  # 0=User, 14=Admin
                user_id=employee.user_id,
                card=employee.card_number
            )
```

### Fields Synced to Devices:
- `device_user_id` (UID) - Device's internal user ID
- `name` - Employee full name
- `privilege` - 0 for User, 14 for Admin
- `user_id` - String user identifier
- `card_number` - RFID card number
- `password` - Device password (optional)
- `group_id` - Group identifier (optional)

### Fields Only in Database:
- Email, phone, address (not supported by device)
- Company, department, position (organizational only)
- Hire date, birth date, gender
- Metadata (created_at, updated_at)

## Testing

To verify synchronization works:

1. **Add a device** in Settings → Devices
2. **Create an employee:**
   - Device User ID: 100
   - User ID: "EMP001"
   - Name: "Test Employee"
   - Role: User
   - Card: 12345

3. **Check device:**
   - Employee should appear on device
   - Role should be "User"

4. **Update to Admin:**
   - Edit employee
   - Change Role to "Admin"
   - Save

5. **Verify:**
   - Reload page - role still shows "Admin" ✓
   - Check device - privilege should be 14 (Admin) ✓

6. **Update name:**
   - Change name to "Test Administrator"
   - Save
   - Device shows new name ✓

## Benefits

✅ **Immediate Sync** - Changes pushed to devices right away
✅ **Consistent Data** - DB and devices always match
✅ **No Manual Sync** - Automatic bidirectional sync
✅ **Graceful Degradation** - Works even if some devices offline
✅ **Audit Trail** - All changes logged
✅ **Error Recovery** - Failed syncs logged, retry on next connection

## Troubleshooting

**If changes don't appear on device:**

1. Check device is online and reachable
2. Check backend logs for sync errors
3. Verify device is registered in Settings → Devices
4. Check device connection settings (IP, port)
5. Manually trigger sync from Attendance → Sync Now

**If you see sync warnings:**
- Some devices may be offline
- Changes are saved in DB
- Will sync when devices come online
- Check device connectivity

## Configuration

No configuration needed! Synchronization is automatic.

However, you can adjust timeout in sync function:
```python
manager = ZKTecoDeviceManager(
    ip=device_config.ip,
    port=device_config.port,
    timeout=5  # Adjust timeout (seconds)
)
```

## Next Steps

Potential enhancements:
1. Add sync status indicator in UI
2. Manual "Sync to Devices" button per employee
3. Sync queue for offline devices
4. Bulk employee import with auto-sync
5. Sync history/audit log in UI
