# Maintenance Backup/Restore Troubleshooting

## Issue: "Failed to create backup" Error

### Root Causes & Solutions

#### 1. **Backups Directory Not Created**
- **Symptom**: File not found or permission denied error
- **Solution**:
```powershell
# Ensure backups directory exists
mkdir backups -Force
# On Linux/Mac:
mkdir -p backups
```

#### 2. **Database Connection Failed**
- **Symptom**: Connection refused or timeout
- **Check Environment Variables**:
```powershell
# Verify database connection in .env file
cat .env | Select-String "DB_"
```
- **Required Variables**:
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=rtzkconnect_db
```

#### 3. **Admin Role Not Assigned**
- **Symptom**: 403 Forbidden error when creating backup
- **Solution**: User must have Administrator role
- **Verify Admin Status**:
```sql
-- Connect to database and check
SELECT u.username, r.name as role 
FROM users u 
LEFT JOIN user_roles ur ON u.id = ur.user_id 
LEFT JOIN roles r ON ur.role_id = r.id;
```

#### 4. **PostgreSQL Driver Missing**
- **Symptom**: "ModuleNotFoundError: No module named 'psycopg2'"
- **Solution**:
```powershell
# Install PostgreSQL driver
pip install psycopg2-binary
# Or use the updated requirements.txt:
pip install -r requirements.txt
```

#### 5. **Insufficient Permissions**
- **Symptom**: Permission denied when writing backup file
- **Solution**:
```powershell
# Check backups directory permissions
icacls backups /grant:r "%USERNAME%:F"
# On Linux/Mac:
chmod 755 backups
```

#### 6. **Database Tables Not Initialized**
- **Symptom**: "relation does not exist" error
- **Solution**: Initialize database first
```powershell
# Run migrations
python -c "from app.database import init_db; init_db()"
```

---

## Testing the Backup Endpoint

### Quick Test with curl
```powershell
# 1. Get login token
$loginResponse = curl -X POST "http://localhost:8000/api/auth/login" `
  -H "Content-Type: application/json" `
  -d '{\"username\":\"admin\",\"password\":\"admin123\"}'

# Extract token (PowerShell)
$token = ($loginResponse | ConvertFrom-Json).access_token

# 2. Create backup
curl -X POST "http://localhost:8000/api/maintenance/backup" `
  -H "Authorization: Bearer $token"

# 3. List backups
curl -X GET "http://localhost:8000/api/maintenance/backups" `
  -H "Authorization: Bearer $token"
```

### Using Python Test Script
```powershell
# Run the test script
python test_maintenance.py
```

---

## Backup File Inspection

### Check Backup Contents
```powershell
# Decompress and view
$file = Get-Item "backups/backup_*.json.gz" | Select-Object -Last 1
Get-Content -Path $file.FullName -AsByteStream | 
  Add-Type -AssemblyName System.IO.Compression -PassThru |
  [System.IO.Compression.GZipStream]::new($_, 'Decompress') |
  [System.IO.StreamReader]::new() |
  Read-Host

# Or on Linux/Mac:
zcat backups/backup_*.json.gz | head -50
```

---

## Common Error Messages

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "Error creating backup: [Errno 2]" | Backups dir not found | Create `backups/` directory |
| "Admin role required" | User not admin | Assign Administrator role |
| "Failed to create backup" | DB connection error | Check DB_* env variables |
| "Table does not exist" | Database not initialized | Run `init_db()` |
| "No module named 'psycopg2'" | PostgreSQL driver missing | `pip install psycopg2-binary` |

---

## Deployment Checklist

- [ ] Create `backups/` directory with proper permissions
- [ ] Set all `DB_*` environment variables
- [ ] Ensure admin user exists with Administrator role
- [ ] Install `psycopg2-binary` in requirements.txt
- [ ] Test backup creation in dev environment
- [ ] Test restore in test environment (if possible)
- [ ] Monitor backup disk space in production

---

## Health Check

Run this to verify backup functionality:
```python
import requests
import json

BASE_URL = "http://localhost:8000"

# Login
resp = requests.post(f'{BASE_URL}/api/auth/login', 
  json={'username': 'admin', 'password': 'admin123'})
token = resp.json().get('access_token')

# Test
resp = requests.post(f'{BASE_URL}/api/maintenance/backup',
  headers={'Authorization': f'Bearer {token}'})

if resp.status_code == 200:
    print("✅ Maintenance feature working!")
else:
    print(f"❌ Error: {resp.status_code}")
    print(resp.text)
```
