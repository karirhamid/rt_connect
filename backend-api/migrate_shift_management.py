"""
Database migration script for shift management tables
Run this to create shift, holiday, and schedule tables
"""
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.connection import engine, SessionLocal
from app.database.schema import Base
from app.database.shift_schema import (
    Shift, ShiftTiming, EmployeeShift, Holiday, ShiftException,
    ShiftType, HolidayType
)
from app.data.morocco_holidays import get_all_preloaded_holidays
from datetime import datetime, timezone, date, time


def create_tables():
    """Create all shift management tables"""
    print("Creating shift management tables...")
    Base.metadata.create_all(bind=engine)
    print("✓ Tables created successfully")


def create_default_shifts():
    """Create default shift templates"""
    print("\nCreating default shifts...")
    
    db = SessionLocal()
    try:
        # Check if shifts already exist
        existing_shifts = db.query(Shift).count()
        if existing_shifts > 0:
            print(f"  ⚠ Skipping: {existing_shifts} shifts already exist")
            return
        
        default_shifts = [
            {
                "name": "Morning Shift / Matin / الصباح",
                "shift_type": ShiftType.REGULAR,
                "color": "#3B82F6",  # Blue
                "description": "Standard morning shift",
                "timings": [
                    {
                        "day_of_week": None,  # All days
                        "start_time": time(8, 0),
                        "end_time": time(16, 0),
                        "break_duration_minutes": 60,
                        "is_overnight": False,
                        "late_grace_minutes": 15,
                        "early_leave_grace_minutes": 15
                    }
                ]
            },
            {
                "name": "Afternoon Shift / Après-midi / المساء",
                "shift_type": ShiftType.REGULAR,
                "color": "#F59E0B",  # Amber
                "description": "Standard afternoon shift",
                "timings": [
                    {
                        "day_of_week": None,
                        "start_time": time(14, 0),
                        "end_time": time(22, 0),
                        "break_duration_minutes": 30,
                        "is_overnight": False,
                        "late_grace_minutes": 15,
                        "early_leave_grace_minutes": 15
                    }
                ]
            },
            {
                "name": "Night Shift / Nuit / الليل",
                "shift_type": ShiftType.NIGHT,
                "color": "#6366F1",  # Indigo
                "description": "Night shift (overnight)",
                "timings": [
                    {
                        "day_of_week": None,
                        "start_time": time(22, 0),
                        "end_time": time(6, 0),
                        "break_duration_minutes": 30,
                        "is_overnight": True,
                        "late_grace_minutes": 15,
                        "early_leave_grace_minutes": 15
                    }
                ]
            },
            {
                "name": "Weekend Guard / Gardien Weekend / حارس نهاية الأسبوع",
                "shift_type": ShiftType.WEEKEND,
                "color": "#10B981",  # Green
                "description": "Weekend security guard shift",
                "timings": [
                    {
                        "day_of_week": 5,  # Saturday
                        "start_time": time(7, 0),
                        "end_time": time(19, 0),
                        "break_duration_minutes": 60,
                        "is_overnight": False,
                        "late_grace_minutes": 10,
                        "early_leave_grace_minutes": 10
                    },
                    {
                        "day_of_week": 6,  # Sunday
                        "start_time": time(7, 0),
                        "end_time": time(19, 0),
                        "break_duration_minutes": 60,
                        "is_overnight": False,
                        "late_grace_minutes": 10,
                        "early_leave_grace_minutes": 10
                    }
                ]
            },
            {
                "name": "Holiday Shift / Shift Jour Férié / وردية العطل",
                "shift_type": ShiftType.HOLIDAY,
                "color": "#EF4444",  # Red
                "description": "Special shift for public holidays",
                "timings": [
                    {
                        "day_of_week": None,
                        "start_time": time(9, 0),
                        "end_time": time(17, 0),
                        "break_duration_minutes": 60,
                        "is_overnight": False,
                        "late_grace_minutes": 10,
                        "early_leave_grace_minutes": 10
                    }
                ]
            },
            {
                "name": "Administrative / Administratif / إداري",
                "shift_type": ShiftType.REGULAR,
                "color": "#8B5CF6",  # Purple
                "description": "Standard office hours (Mon-Fri)",
                "timings": [
                    {
                        "day_of_week": 0,  # Monday
                        "start_time": time(8, 30),
                        "end_time": time(17, 30),
                        "break_duration_minutes": 60,
                        "is_overnight": False,
                        "late_grace_minutes": 15,
                        "early_leave_grace_minutes": 15
                    },
                    {
                        "day_of_week": 1,  # Tuesday
                        "start_time": time(8, 30),
                        "end_time": time(17, 30),
                        "break_duration_minutes": 60,
                        "is_overnight": False,
                        "late_grace_minutes": 15,
                        "early_leave_grace_minutes": 15
                    },
                    {
                        "day_of_week": 2,  # Wednesday
                        "start_time": time(8, 30),
                        "end_time": time(17, 30),
                        "break_duration_minutes": 60,
                        "is_overnight": False,
                        "late_grace_minutes": 15,
                        "early_leave_grace_minutes": 15
                    },
                    {
                        "day_of_week": 3,  # Thursday
                        "start_time": time(8, 30),
                        "end_time": time(17, 30),
                        "break_duration_minutes": 60,
                        "is_overnight": False,
                        "late_grace_minutes": 15,
                        "early_leave_grace_minutes": 15
                    },
                    {
                        "day_of_week": 4,  # Friday
                        "start_time": time(8, 30),
                        "end_time": time(12, 30),
                        "break_duration_minutes": 0,
                        "is_overnight": False,
                        "late_grace_minutes": 15,
                        "early_leave_grace_minutes": 15
                    }
                ]
            }
        ]
        
        for shift_data in default_shifts:
            timings_data = shift_data.pop("timings")
            shift = Shift(**shift_data)
            db.add(shift)
            db.flush()  # Get shift ID
            
            for timing_data in timings_data:
                timing = ShiftTiming(shift_id=shift.id, **timing_data)
                db.add(timing)
            
            print(f"  ✓ Created: {shift.name}")
        
        db.commit()
        print(f"✓ Created {len(default_shifts)} default shifts")
    
    except Exception as e:
        db.rollback()
        print(f"✗ Error creating shifts: {e}")
        raise
    finally:
        db.close()


def load_morocco_holidays():
    """Load Morocco holidays (2025-2026)"""
    print("\nLoading Morocco holidays...")
    
    db = SessionLocal()
    try:
        # Check if holidays already exist
        existing_holidays = db.query(Holiday).count()
        if existing_holidays > 0:
            print(f"  ⚠ Skipping: {existing_holidays} holidays already exist")
            return
        
        holidays_data = get_all_preloaded_holidays()
        
        for holiday_data in holidays_data:
            holiday = Holiday(
                name=holiday_data["name"],
                date=holiday_data["date"],
                holiday_type=holiday_data["type"],
                is_paid=holiday_data["is_paid"],
                country="MA",
                description=holiday_data.get("note")
            )
            db.add(holiday)
        
        db.commit()
        print(f"✓ Loaded {len(holidays_data)} Morocco holidays (2025-2026)")
    
    except Exception as e:
        db.rollback()
        print(f"✗ Error loading holidays: {e}")
        raise
    finally:
        db.close()


def main():
    """Main migration function"""
    print("=" * 60)
    print("SHIFT MANAGEMENT SYSTEM MIGRATION")
    print("=" * 60)
    
    try:
        # Step 1: Create tables
        create_tables()
        
        # Step 2: Create default shifts
        create_default_shifts()
        
        # Step 3: Load Morocco holidays
        load_morocco_holidays()
        
        print("\n" + "=" * 60)
        print("✓ MIGRATION COMPLETED SUCCESSFULLY")
        print("=" * 60)
        print("\nNext steps:")
        print("1. Start/restart the backend server")
        print("2. Access the shift management UI")
        print("3. Assign shifts to employees")
        
    except Exception as e:
        print("\n" + "=" * 60)
        print("✗ MIGRATION FAILED")
        print("=" * 60)
        print(f"\nError: {e}")
        print("\nPlease fix the error and run the migration again.")
        sys.exit(1)


if __name__ == "__main__":
    main()
