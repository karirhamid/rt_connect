# Shift Management System Design

## Overview
Comprehensive shift and schedule management system for employee time tracking with Morocco-specific features.

## Database Schema

### 1. Shifts Table
```sql
- id: Primary Key
- name: String (e.g., "Morning Shift", "Night Shift", "Weekend Guard")
- shift_type: Enum (regular, night, weekend, guard, holiday, aid)
- color: String (hex color for UI display)
- is_active: Boolean
- created_at: DateTime
- updated_at: DateTime
```

### 2. Shift Timings Table
```sql
- id: Primary Key
- shift_id: Foreign Key -> Shifts
- day_of_week: Integer (0=Monday, 6=Sunday) or NULL for all days
- start_time: Time
- end_time: Time
- break_duration_minutes: Integer
- is_overnight: Boolean (for shifts spanning midnight)
- created_at: DateTime
```

### 3. Employee Shifts Table
```sql
- id: Primary Key
- employee_id: Foreign Key -> Employees
- shift_id: Foreign Key -> Shifts
- effective_from: Date
- effective_to: Date (NULL for ongoing)
- assigned_by: String
- notes: Text
- created_at: DateTime
- updated_at: DateTime
```

### 4. Holiday Calendar Table
```sql
- id: Primary Key
- name: String
- date: Date (unique)
- type: Enum (public_holiday, aid, national_day, custom)
- is_paid: Boolean
- country: String (default: 'MA')
- region: String (optional for regional holidays)
- created_at: DateTime
```

### 5. Shift Exceptions Table
```sql
- id: Primary Key
- employee_id: Foreign Key -> Employees
- original_shift_id: Foreign Key -> Shifts (nullable)
- exception_shift_id: Foreign Key -> Shifts (nullable)
- exception_date: Date
- reason: String
- approved_by: String
- created_at: DateTime
```

## Morocco Public Holidays (2025)

### Fixed Holidays
- January 1: New Year's Day
- January 11: Independence Manifesto Day
- May 1: Labour Day
- July 30: Throne Day
- August 14: Oued Ed-Dahab Day
- August 20: Revolution Day
- August 21: Youth Day
- November 6: Green March Day
- November 18: Independence Day

### Islamic Holidays (Hijri-based, dates vary)
- Aid Al-Fitr (End of Ramadan): ~March 30-31, 2025
- Aid Al-Adha (Feast of Sacrifice): ~June 6-7, 2025
- Hijri New Year: ~June 26, 2025
- Mawlid (Prophet's Birthday): ~September 4, 2025

## API Endpoints Structure

### Shifts Management
- GET /api/shifts - List all shifts
- POST /api/shifts - Create new shift
- GET /api/shifts/{id} - Get shift details
- PUT /api/shifts/{id} - Update shift
- DELETE /api/shifts/{id} - Delete shift
- GET /api/shifts/{id}/timings - Get shift timings
- POST /api/shifts/{id}/timings - Add timing to shift
- PUT /api/shifts/{id}/timings/{timing_id} - Update timing
- DELETE /api/shifts/{id}/timings/{timing_id} - Delete timing

### Employee Shift Assignment
- GET /api/employees/{id}/shifts - Get employee shift assignments
- POST /api/employees/{id}/shifts - Assign shift to employee
- PUT /api/employees/{id}/shifts/{assignment_id} - Update assignment
- DELETE /api/employees/{id}/shifts/{assignment_id} - Remove assignment
- GET /api/employees/{id}/schedule - Get employee schedule (calendar view)

### Holiday Calendar
- GET /api/holidays - List holidays (with date range filter)
- POST /api/holidays - Add custom holiday
- PUT /api/holidays/{id} - Update holiday
- DELETE /api/holidays/{id} - Delete holiday
- GET /api/holidays/morocco/2025 - Pre-load Morocco holidays

### Shift Exceptions
- GET /api/shift-exceptions - List exceptions (with filters)
- POST /api/shift-exceptions - Create exception
- PUT /api/shift-exceptions/{id} - Update exception
- DELETE /api/shift-exceptions/{id} - Delete exception

## UI Components

### 1. Shift Management Page (`/settings/shifts`)
- List of all shifts with color coding
- Add/Edit shift modal
- Shift timing configuration (weekly schedule grid)
- Delete with confirmation

### 2. Employee Shift Assignment (`/employees/{id}/shifts`)
- Current shift assignment card
- Shift history timeline
- Assign new shift button -> opens modal

### 3. Shift Assignment Modal
**Features:**
- Shift selector dropdown
- Date range picker (from/to)
- Weekly schedule viewer showing selected shift timings
- Notes field
- Save/Cancel buttons

### 4. Bulk Shift Assignment (`/employees/bulk-shift-assignment`)
- Employee multi-select
- Shift selector
- Date range picker
- Apply to all button

### 5. Interactive Weekly Schedule Modal
**When adding/editing shift timings:**
- Visual weekly calendar (Mon-Sun)
- Click day to toggle selection
- Time pickers for start/end
- Break duration input
- "Apply to selected days" button
- Support multiple time ranges per shift
- Color-coded by shift type

### 6. Holiday Calendar Page (`/settings/holidays`)
- Full calendar view (month/year)
- Holidays marked with colors by type
- Morocco holidays pre-loaded
- Add custom holiday button
- Filter by type
- Import/Export functionality

## Menu Reorganization

```
📊 Dashboard
👥 Employees
   ├─ Employee List
   ├─ Add Employee
   └─ Bulk Shift Assignment

⏰ Attendance
   ├─ Today's Attendance
   ├─ Attendance Filter/History
   └─ Attendance Reports (new)

📅 Scheduling (new section)
   ├─ Shift Management
   ├─ Employee Schedules
   └─ Holiday Calendar

⚙️ Settings
   ├─ General
   ├─ Devices
   ├─ Company Configuration
   └─ User Management (future)
```

## Business Logic

### Shift Assignment Rules
1. Employee can have only one active shift at any given time
2. Overlapping assignments prevented at database level
3. Future assignments allowed
4. Past assignments are historical records

### Shift Timing Rules
1. Shift can have different timings for different days
2. Multiple time ranges per shift supported (e.g., split shifts)
3. Overnight shifts handled with `is_overnight` flag
4. Break duration tracked but not enforced at device level

### Holiday Handling
1. Holidays override regular shift timings
2. Special holiday shifts can be created
3. Paid vs unpaid holiday tracking
4. Attendance on holidays marked specially

### Attendance Calculation with Shifts
1. Expected time = shift start time
2. Late = arrival > (start_time + grace_period)
3. Early leave = departure < shift end time
4. Overtime = work hours > shift duration
5. Holiday attendance = special overtime rate

## Implementation Priority

### Phase 1: Core Shifts (Week 1)
- [ ] Database schema migration
- [ ] Shift CRUD API endpoints
- [ ] Basic shift management UI
- [ ] Shift timing configuration

### Phase 2: Assignment (Week 2)
- [ ] Employee shift assignment API
- [ ] Assignment UI in employee detail
- [ ] Bulk assignment feature
- [ ] Shift history view

### Phase 3: Calendar & Holidays (Week 3)
- [ ] Holiday calendar API
- [ ] Morocco holidays data
- [ ] Holiday calendar UI
- [ ] Holiday management

### Phase 4: Advanced Features (Week 4)
- [ ] Shift exceptions
- [ ] Interactive weekly schedule modal
- [ ] Attendance calculation with shifts
- [ ] Reports integration

## Technical Considerations

### Backend
- Use SQLAlchemy ORM for all database operations
- Implement proper validation for date ranges
- Add timezone support for shift timings
- Create database indexes on frequently queried fields

### Frontend
- Use React Calendar library (react-big-calendar or fullcalendar)
- Implement optimistic UI updates
- Add loading states for all async operations
- Use color coding consistently

### Data Migration
- Create migration scripts for existing data
- Default shift for existing employees
- Backward compatibility during transition

## Testing Checklist
- [ ] Overlapping shift assignments prevented
- [ ] Overnight shifts handled correctly
- [ ] Holiday calculations accurate
- [ ] Timezone conversions correct
- [ ] Bulk operations performant
- [ ] UI responsive on mobile
- [ ] Arabic RTL support
