"""
Deduplicate employee table: keep one row per user_id,
reassign attendance records, delete duplicates.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.database.connection import get_db_session
from app.database.schema import Employee, Attendance
from sqlalchemy import func

def main():
    with get_db_session() as db:
        # Find all user_ids that have duplicates
        dups = (
            db.query(Employee.user_id, func.count(Employee.id))
            .group_by(Employee.user_id)
            .having(func.count(Employee.id) > 1)
            .all()
        )
        print(f"Found {len(dups)} user_ids with duplicates")

        total_deleted = 0
        total_reassigned = 0

        for user_id, count in dups:
            rows = (
                db.query(Employee)
                .filter(Employee.user_id == user_id)
                .all()
            )
            # Keep the one linked to an active device (source_device_id)
            # Prefer the first one with most attendance records
            keep = None
            best_att = -1
            for emp in rows:
                att_count = db.query(Attendance).filter(
                    Attendance.employee_id == emp.id
                ).count()
                if att_count > best_att:
                    best_att = att_count
                    keep = emp

            if not keep:
                keep = rows[0]

            to_delete = [r for r in rows if r.id != keep.id]
            print(f"\n  user_id={user_id} ({keep.name}): keeping pk={keep.id}, "
                  f"deleting {len(to_delete)} dupes")

            # Reassign attendance from dupes to the keeper
            for dup in to_delete:
                moved = (
                    db.query(Attendance)
                    .filter(Attendance.employee_id == dup.id)
                    .update({Attendance.employee_id: keep.id})
                )
                if moved:
                    print(f"    reassigned {moved} attendance records from pk={dup.id}")
                    total_reassigned += moved

            # Delete duplicate employee rows
            for dup in to_delete:
                db.delete(dup)
                total_deleted += 1

        db.commit()
        final_count = db.query(Employee).count()
        print(f"\nDone: deleted {total_deleted} duplicate employees, "
              f"reassigned {total_reassigned} attendance records")
        print(f"Employees now: {final_count}")

if __name__ == "__main__":
    main()
