"""
Holiday Calendar API Endpoints
Handles public holidays, Aids, and custom holidays
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from datetime import date

from app.database.connection import get_db
from app.database.shift_schema import Holiday, HolidayType
from app.models.shift_schemas import HolidayCreate, HolidayUpdate, HolidayResponse
from app.data.morocco_holidays import get_morocco_holidays, get_all_preloaded_holidays

router = APIRouter(prefix="/api/holidays", tags=["holidays"])


@router.get("", response_model=List[HolidayResponse])
async def list_holidays(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    holiday_type: Optional[str] = None,
    country: str = "MA",
    db: Session = Depends(get_db)
):
    """Get list of holidays with optional filters"""
    query = db.query(Holiday).filter(Holiday.country == country)
    
    if start_date:
        query = query.filter(Holiday.date >= start_date)
    
    if end_date:
        query = query.filter(Holiday.date <= end_date)
    
    if holiday_type:
        query = query.filter(Holiday.holiday_type == holiday_type)
    
    holidays = query.order_by(Holiday.date).all()
    return holidays


@router.get("/year/{year}", response_model=List[HolidayResponse])
async def get_holidays_by_year(
    year: int,
    country: str = "MA",
    db: Session = Depends(get_db)
):
    """Get all holidays for a specific year"""
    start_date = date(year, 1, 1)
    end_date = date(year, 12, 31)
    
    holidays = db.query(Holiday).filter(
        Holiday.country == country,
        Holiday.date >= start_date,
        Holiday.date <= end_date
    ).order_by(Holiday.date).all()
    
    return holidays


@router.post("", response_model=HolidayResponse)
async def create_holiday(
    holiday: HolidayCreate,
    db: Session = Depends(get_db)
):
    """Create a new holiday"""
    db_holiday = Holiday(**holiday.model_dump())
    
    try:
        db.add(db_holiday)
        db.commit()
        db.refresh(db_holiday)
        return db_holiday
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Holiday already exists for date {holiday.date}"
        )


@router.put("/{holiday_id}", response_model=HolidayResponse)
async def update_holiday(
    holiday_id: int,
    holiday: HolidayUpdate,
    db: Session = Depends(get_db)
):
    """Update a holiday"""
    db_holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not db_holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")
    
    update_data = holiday.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(db_holiday, field, value)
    
    try:
        db.commit()
        db.refresh(db_holiday)
        return db_holiday
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Holiday already exists for the new date"
        )


@router.delete("/{holiday_id}")
async def delete_holiday(
    holiday_id: int,
    db: Session = Depends(get_db)
):
    """Delete a holiday"""
    db_holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not db_holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")
    
    db.delete(db_holiday)
    db.commit()
    return {"success": True, "message": "Holiday deleted successfully"}


@router.post("/load-morocco-holidays/{year}")
async def load_morocco_holidays(
    year: int,
    db: Session = Depends(get_db)
):
    """Load pre-defined Morocco holidays for a specific year"""
    if year not in [2025, 2026]:
        raise HTTPException(
            status_code=400,
            detail=f"Pre-loaded holidays only available for 2025 and 2026"
        )
    
    holidays_data = get_morocco_holidays(year)
    
    if not holidays_data:
        raise HTTPException(
            status_code=404,
            detail=f"No pre-loaded holidays found for year {year}"
        )
    
    loaded = []
    skipped = []
    refreshed = []

    for holiday_data in holidays_data:
        existing = db.query(Holiday).filter(
            Holiday.date == holiday_data["date"]
        ).first()

        if existing:
            # Idempotent name refresh: if the preset name has more info (e.g.,
            # added Arabic translation), update the existing row's name.
            if existing.name != holiday_data["name"]:
                old = existing.name
                existing.name = holiday_data["name"]
                refreshed.append({"date": holiday_data["date"], "from": old, "to": holiday_data["name"]})
            else:
                skipped.append({"date": holiday_data["date"], "name": holiday_data["name"], "reason": "Already exists"})
            continue

        db_holiday = Holiday(
            name=holiday_data["name"],
            date=holiday_data["date"],
            holiday_type=holiday_data["type"],
            is_paid=holiday_data["is_paid"],
            country="MA",
            description=holiday_data.get("note"),
        )
        db.add(db_holiday)
        loaded.append({"date": holiday_data["date"], "name": holiday_data["name"], "type": holiday_data["type"]})

    db.commit()

    return {
        "year": year,
        "total_available": len(holidays_data),
        "loaded": len(loaded),
        "skipped": len(skipped),
        "refreshed": len(refreshed),
        "loaded_holidays": loaded,
        "skipped_holidays": skipped,
        "refreshed_holidays": refreshed,
    }


@router.post("/load-all-morocco-holidays")
async def load_all_morocco_holidays(db: Session = Depends(get_db)):
    """Load all pre-defined Morocco holidays (2025-2026)"""
    holidays_data = get_all_preloaded_holidays()

    loaded = []
    skipped = []
    refreshed = []

    for holiday_data in holidays_data:
        existing = db.query(Holiday).filter(
            Holiday.date == holiday_data["date"]
        ).first()
        if existing:
            if existing.name != holiday_data["name"]:
                old = existing.name
                existing.name = holiday_data["name"]
                refreshed.append({"date": holiday_data["date"], "from": old, "to": holiday_data["name"]})
            else:
                skipped.append({"date": holiday_data["date"], "name": holiday_data["name"], "reason": "Already exists"})
            continue
        db_holiday = Holiday(
            name=holiday_data["name"], date=holiday_data["date"],
            holiday_type=holiday_data["type"], is_paid=holiday_data["is_paid"],
            country="MA", description=holiday_data.get("note"),
        )
        db.add(db_holiday)
        loaded.append({"date": holiday_data["date"], "name": holiday_data["name"], "type": holiday_data["type"]})

    db.commit()

    return {
        "years": "2025-2026",
        "total_available": len(holidays_data),
        "loaded": len(loaded),
        "skipped": len(skipped),
        "refreshed": len(refreshed),
        "loaded_holidays": loaded,
        "skipped_holidays": skipped,
        "refreshed_holidays": refreshed,
    }


@router.get("/check/{check_date}")
async def check_holiday(
    check_date: date,
    country: str = "MA",
    db: Session = Depends(get_db)
):
    """Check if a specific date is a holiday"""
    holiday = db.query(Holiday).filter(
        Holiday.date == check_date,
        Holiday.country == country
    ).first()
    
    if holiday:
        return {
            "is_holiday": True,
            "holiday": holiday
        }
    else:
        return {
            "is_holiday": False,
            "holiday": None
        }
