"""Remove duplicate attendance records, keeping only the earliest (lowest id) for each
(employee_id, timestamp, device_id) combination."""
import sys
sys.path.insert(0, '.')
from app.database.connection import get_db_session
from app.database.schema import Attendance as A
from sqlalchemy import func

with get_db_session() as db:
    # Find all duplicate groups
    subq = (
        db.query(
            A.employee_id,
            A.timestamp,
            A.device_id,
            func.min(A.id).label("keep_id"),
            func.count(A.id).label("cnt"),
        )
        .group_by(A.employee_id, A.timestamp, A.device_id)
        .having(func.count(A.id) > 1)
        .all()
    )

    total_deleted = 0
    for grp in subq:
        # Delete all but the one with the lowest id
        deleted = (
            db.query(A)
            .filter(
                A.employee_id == grp.employee_id,
                A.timestamp == grp.timestamp,
                A.device_id == grp.device_id,
                A.id != grp.keep_id,
            )
            .delete(synchronize_session=False)
        )
        total_deleted += deleted

    db.commit()
    remaining = db.query(func.count(A.id)).scalar()
    print(f"Removed {total_deleted} duplicate records across {len(subq)} groups.")
    print(f"Remaining records: {remaining}")
