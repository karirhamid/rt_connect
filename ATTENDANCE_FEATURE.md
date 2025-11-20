# Attendance Management System

## Overview
Complete attendance management system for tracking employee pointage (check-ins/check-outs) with real-time monitoring, advanced filtering, and analytics.

## Features Implemented

### 1. **Pointage Today** (`/attendance/today`)
Real-time dashboard for today's attendance with:

- **Live Statistics Cards:**
  - Total Employees
  - Present Today (with percentage)
  - Late Arrivals (after 9:00 AM)
  - Absent Employees

- **Real-time Attendance List:**
  - Employee name and ID
  - Department and company
  - Check-in time
  - Check-out time
  - Status (Present/Late/Absent)
  - Device name

- **Auto-refresh:** Updates every 2 minutes automatically
- **Manual Sync:** Button to trigger immediate device synchronization

### 2. **Filter Pointage** (`/attendance/filter`)
Advanced search and filtering with:

- **Date Range Filter:** Select start and end dates
- **Company Filter:** Filter by specific company
- **Department Filter:** Filter by department (cascades with company)
- **Employee Search:** Search by employee ID or name
- **Status Filter:** All/Present/Late/Absent
- **Work Hours Calculation:** Automatic calculation between check-in and check-out
- **Export Options:** Excel and PDF export buttons (ready for implementation)

### 3. **Collapsible UI:**
- Both menus (Attendance and Settings) are collapsible
- Clean navigation with icons
- Active state highlighting

## Best Practices Implemented

### Frontend Best Practices:
1. **Component Separation:** Each page is a separate component
2. **Reusable API Service:** Centralized API calls in `api.js`
3. **Loading States:** Proper loading indicators for better UX
4. **Error Handling:** Try-catch blocks with user-friendly messages
5. **Responsive Design:** Mobile-friendly with Tailwind CSS
6. **Auto-refresh:** Real-time data updates for today's attendance
7. **Optimistic UI:** Immediate feedback on user actions

### Backend Best Practices:
1. **Database Queries:** Efficient joins with Employee, Department, and Company
2. **Filtering Logic:** Dynamic query building based on provided filters
3. **Result Limiting:** Max 1000 records to prevent performance issues
4. **Error Handling:** Proper logging and exception handling
5. **API Documentation:** Clear parameter descriptions in Query params
6. **Date Formatting:** Proper datetime handling for filters

### Data Structure:
```javascript
// Attendance Record Structure
{
  employee_id: string,        // User ID from device
  employee_name: string,      // Full name
  department: string,         // Department name
  company: string,            // Company name
  check_in: ISO timestamp,    // First check-in of the day
  check_out: ISO timestamp,   // Last check-out of the day
  status: string,             // 'present', 'late', 'absent'
  device_name: string         // Device that recorded attendance
}
```

## API Endpoints

### GET `/api/attendance/today`
Get today's attendance records with aggregated check-ins/check-outs.

**Response:**
```json
{
  "attendance": [...],
  "count": 25
}
```

### GET `/api/attendance/filter`
Filter attendance with multiple criteria.

**Query Parameters:**
- `start_date`: YYYY-MM-DD format
- `end_date`: YYYY-MM-DD format
- `employee_id`: Employee user ID
- `employee_name`: Partial name match
- `department_id`: Integer department ID
- `company_id`: Integer company ID
- `status`: present/late/absent

**Response:**
```json
{
  "attendance": [...],
  "count": 150
}
```

## Future Enhancements (Ready to Add)

### 1. **Attendance Reports** (`/attendance/reports`)
- Monthly/Weekly/Custom reports
- Attendance statistics per employee
- Department-wise attendance summary
- Export to Excel/PDF with charts

### 2. **Manual Entry** (`/attendance/manual`)
- Add attendance manually for absent employees
- Edit incorrect entries
- Add notes/reasons for late arrivals
- Bulk import from Excel

### 3. **Attendance Calendar** (`/attendance/calendar`)
- Monthly calendar view per employee
- Color-coded status (green=present, red=absent, yellow=late)
- Click on day to see details
- Month navigation

### 4. **Attendance Rules** (`/attendance/rules`)
- Configure work hours (e.g., 9:00 AM - 5:00 PM)
- Define "late" threshold
- Set break time rules
- Overtime calculation rules

### 5. **Alerts & Notifications**
- Email alerts for absences
- Late arrival notifications
- Missing check-out reminders
- Weekly attendance summary emails

### 6. **Analytics Dashboard** (`/attendance/analytics`)
- Attendance trends over time
- Most punctual employees
- Department comparison charts
- Absence patterns analysis

### 7. **Leave Management Integration**
- Mark planned absences (vacation, sick leave)
- Distinguish between absent and on-leave
- Leave balance tracking
- Approval workflow

## Implementation Notes

### Status Logic:
- **Present:** Checked in before 9:00 AM
- **Late:** Checked in after 9:00 AM
- **Absent:** No check-in record for the day

### Check-in/Check-out Grouping:
- Status 0 or Punch 0 = Check-in
- Status 1 or Punch 1 = Check-out
- System takes first check-in and last check-out of the day

### Performance Considerations:
- Today's attendance uses date range filter for efficiency
- Filter results limited to 1000 records
- Auto-refresh interval set to 2 minutes (configurable)
- Database indexes on timestamp and employee_id fields recommended

## Testing Checklist

- [ ] Today's attendance loads correctly
- [ ] Statistics cards show accurate counts
- [ ] Filter by date range works
- [ ] Filter by company cascades to departments
- [ ] Filter by employee ID/name works
- [ ] Status filter (all/present/late/absent) works
- [ ] Manual sync button triggers device sync
- [ ] Auto-refresh updates data every 2 minutes
- [ ] Work hours calculation is accurate
- [ ] Responsive design works on mobile
- [ ] Loading states show properly
- [ ] Error messages display correctly

## Next Steps

1. **Test with real data:** Ensure sync service populates attendance table
2. **Implement export:** Add Excel/PDF export functionality
3. **Add more submenus:** Implement Reports, Manual Entry, Calendar
4. **Configure rules:** Add work hours and late threshold settings
5. **Add notifications:** Email/SMS alerts for attendance events
6. **Optimize queries:** Add database indexes if performance degrades
7. **Add permissions:** Role-based access control for attendance management

## Files Added/Modified

**Frontend:**
- `frontend/src/pages/AttendanceToday.jsx` - Today's attendance page
- `frontend/src/pages/AttendanceFilter.jsx` - Filter page
- `frontend/src/App.jsx` - Added Attendance menu with submenus
- `frontend/src/services/api.js` - Added attendance API methods

**Backend:**
- `backend-api/app/api/attendance.py` - Enhanced with today and filter endpoints

## Usage

1. Navigate to **Attendance → Pointage Today** to see today's attendance
2. Use **Manual Sync** button to refresh from devices
3. Navigate to **Attendance → Filter Pointage** for advanced search
4. Apply filters and click **Search**
5. Use **Export** buttons to download results (when implemented)

## Configuration

### Adjust auto-refresh interval:
```javascript
// In AttendanceToday.jsx, line 23
const interval = setInterval(fetchTodayAttendance, 120000); // 2 minutes in milliseconds
```

### Change late arrival threshold:
```javascript
// In backend attendance.py, around line 54
if record.timestamp.hour >= 9 and record.timestamp.minute > 0:
    employee_records[emp_id]['status'] = 'late'
```

### Modify result limit:
```python
# In backend attendance.py, line 117
records = query.order_by(DBAttendance.timestamp.desc()).limit(1000).all()
```
