"""
Morocco Public Holidays Data
Including fixed holidays and Islamic holidays (Hijri calendar)
"""
from datetime import date
from typing import List, Dict

# Morocco Fixed Holidays (Gregorian calendar)
MOROCCO_FIXED_HOLIDAYS_2025 = [
    {
        "name": "Jour de l'An / New Year's Day / رأس السنة الميلادية",
        "date": date(2025, 1, 1),
        "type": "public_holiday",
        "is_paid": True
    },
    {
        "name": "Manifeste de l'Indépendance / Independence Manifesto Day / ذكرى تقديم وثيقة الاستقلال",
        "date": date(2025, 1, 11),
        "type": "national_day",
        "is_paid": True
    },
    {
        "name": "Fête du Travail / Labour Day / عيد العمال",
        "date": date(2025, 5, 1),
        "type": "public_holiday",
        "is_paid": True
    },
    {
        "name": "Fête du Trône / Throne Day / عيد العرش",
        "date": date(2025, 7, 30),
        "type": "national_day",
        "is_paid": True
    },
    {
        "name": "Journée de Oued Ed-Dahab / Oued Ed-Dahab Day / ذكرى استرجاع إقليم وادي الذهب",
        "date": date(2025, 8, 14),
        "type": "national_day",
        "is_paid": True
    },
    {
        "name": "Révolution du Roi et du Peuple / Revolution Day / ذكرى ثورة الملك والشعب",
        "date": date(2025, 8, 20),
        "type": "national_day",
        "is_paid": True
    },
    {
        "name": "Fête de la Jeunesse / Youth Day / عيد الشباب",
        "date": date(2025, 8, 21),
        "type": "national_day",
        "is_paid": True
    },
    {
        "name": "Marche Verte / Green March Day / ذكرى المسيرة الخضراء",
        "date": date(2025, 11, 6),
        "type": "national_day",
        "is_paid": True
    },
    {
        "name": "Fête de l'Indépendance / Independence Day / عيد الاستقلال",
        "date": date(2025, 11, 18),
        "type": "national_day",
        "is_paid": True
    }
]

# Morocco Islamic Holidays 2025 (Hijri calendar - approximate Gregorian dates)
# Note: Islamic holidays depend on moon sighting and may vary by ±1 day
MOROCCO_ISLAMIC_HOLIDAYS_2025 = [
    {
        "name": "Aid Al-Fitr (2 jours) / عيد الفطر",
        "date": date(2025, 3, 30),
        "type": "aid",
        "is_paid": True,
        "note": "End of Ramadan - 2-day holiday"
    },
    {
        "name": "Aid Al-Fitr (2 jours) / عيد الفطر",
        "date": date(2025, 3, 31),
        "type": "aid",
        "is_paid": True,
        "note": "End of Ramadan - 2-day holiday"
    },
    {
        "name": "Aid Al-Adha (2 jours) / عيد الأضحى",
        "date": date(2025, 6, 6),
        "type": "aid",
        "is_paid": True,
        "note": "Feast of Sacrifice - 2-day holiday"
    },
    {
        "name": "Aid Al-Adha (2 jours) / عيد الأضحى",
        "date": date(2025, 6, 7),
        "type": "aid",
        "is_paid": True,
        "note": "Feast of Sacrifice - 2-day holiday"
    },
    {
        "name": "Nouvel An Hégirien / Hijri New Year / رأس السنة الهجرية",
        "date": date(2025, 6, 26),
        "type": "public_holiday",
        "is_paid": True,
        "note": "1447 AH"
    },
    {
        "name": "Aid Al-Mawlid Nabawi / عيد المولد النبوي",
        "date": date(2025, 9, 4),
        "type": "public_holiday",
        "is_paid": True,
        "note": "Prophet Muhammad's Birthday"
    }
]

# Morocco Holidays for 2026 (for planning ahead)
MOROCCO_FIXED_HOLIDAYS_2026 = [
    {"name": "Jour de l'An / New Year's Day / رأس السنة الميلادية", "date": date(2026, 1, 1), "type": "public_holiday", "is_paid": True},
    {"name": "Manifeste de l'Indépendance / Independence Manifesto Day / ذكرى تقديم وثيقة الاستقلال", "date": date(2026, 1, 11), "type": "national_day", "is_paid": True},
    {"name": "Fête du Travail / Labour Day / عيد العمال", "date": date(2026, 5, 1), "type": "public_holiday", "is_paid": True},
    {"name": "Fête du Trône / Throne Day / عيد العرش", "date": date(2026, 7, 30), "type": "national_day", "is_paid": True},
    {"name": "Journée de Oued Ed-Dahab / Oued Ed-Dahab Day / ذكرى استرجاع إقليم وادي الذهب", "date": date(2026, 8, 14), "type": "national_day", "is_paid": True},
    {"name": "Révolution du Roi et du Peuple / Revolution Day / ذكرى ثورة الملك والشعب", "date": date(2026, 8, 20), "type": "national_day", "is_paid": True},
    {"name": "Fête de la Jeunesse / Youth Day / عيد الشباب", "date": date(2026, 8, 21), "type": "national_day", "is_paid": True},
    {"name": "Marche Verte / Green March Day / ذكرى المسيرة الخضراء", "date": date(2026, 11, 6), "type": "national_day", "is_paid": True},
    {"name": "Fête de l'Indépendance / Independence Day / عيد الاستقلال", "date": date(2026, 11, 18), "type": "national_day", "is_paid": True}
]

MOROCCO_ISLAMIC_HOLIDAYS_2026 = [
    {"name": "Aid Al-Fitr (2 jours) / عيد الفطر", "date": date(2026, 3, 20), "type": "aid", "is_paid": True},
    {"name": "Aid Al-Fitr (2 jours) / عيد الفطر", "date": date(2026, 3, 21), "type": "aid", "is_paid": True},
    {"name": "Aid Al-Adha (2 jours) / عيد الأضحى", "date": date(2026, 5, 27), "type": "aid", "is_paid": True},
    {"name": "Aid Al-Adha (2 jours) / عيد الأضحى", "date": date(2026, 5, 28), "type": "aid", "is_paid": True},
    {"name": "Nouvel An Hégirien / Hijri New Year / رأس السنة الهجرية", "date": date(2026, 6, 16), "type": "public_holiday", "is_paid": True},
    {"name": "Aid Al-Mawlid Nabawi / عيد المولد النبوي", "date": date(2026, 8, 25), "type": "public_holiday", "is_paid": True}
]


def get_morocco_holidays(year: int) -> List[Dict]:
    """
    Get Morocco holidays for a specific year
    
    Args:
        year: The year to get holidays for
        
    Returns:
        List of holiday dictionaries
    """
    if year == 2025:
        return MOROCCO_FIXED_HOLIDAYS_2025 + MOROCCO_ISLAMIC_HOLIDAYS_2025
    elif year == 2026:
        return MOROCCO_FIXED_HOLIDAYS_2026 + MOROCCO_ISLAMIC_HOLIDAYS_2026
    else:
        # For other years, return fixed holidays only
        # Islamic holidays would need to be calculated or looked up
        return []


def get_all_preloaded_holidays() -> List[Dict]:
    """Get all preloaded Morocco holidays (2025-2026)"""
    return (MOROCCO_FIXED_HOLIDAYS_2025 + MOROCCO_ISLAMIC_HOLIDAYS_2025 +
            MOROCCO_FIXED_HOLIDAYS_2026 + MOROCCO_ISLAMIC_HOLIDAYS_2026)


# Holiday color coding for UI
HOLIDAY_COLORS = {
    "public_holiday": "#10B981",  # Green
    "national_day": "#3B82F6",    # Blue
    "aid": "#F59E0B",             # Amber
    "custom": "#8B5CF6"           # Purple
}
