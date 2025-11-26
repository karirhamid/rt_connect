"""
Timestamp validation and correction utilities
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple
import logging

logger = logging.getLogger(__name__)


def validate_and_correct_timestamp(
    timestamp: datetime, 
    device_date_format: str = "YYYY-MM-DD",
    max_future_days: int = 1,
    max_past_years: int = 5
) -> Tuple[datetime, Optional[str]]:
    """
    Validate and attempt to correct malformed timestamps from devices.
    
    Args:
        timestamp: The timestamp to validate
        device_date_format: Expected date format from device (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY)
        max_future_days: Maximum days in future allowed (default: 1)
        max_past_years: Maximum years in past allowed (default: 5)
    
    Returns:
        Tuple of (corrected_timestamp, error_message)
        If no error, error_message is None
    """
    now = datetime.now(timezone.utc)
    
    # Ensure timestamp is timezone-aware
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    
    # Check if timestamp is too far in the future
    future_limit = now + timedelta(days=max_future_days)
    if timestamp > future_limit:
        error = f"Timestamp too far in future: {timestamp.isoformat()}"
        
        # Try to detect if day/month were swapped (DD/MM vs MM/DD confusion)
        if device_date_format == "DD/MM/YYYY" and timestamp.month <= 12 and timestamp.day <= 12:
            # Try swapping day and month
            try:
                corrected = timestamp.replace(day=timestamp.month, month=timestamp.day)
                if corrected <= future_limit and corrected >= (now - timedelta(days=365 * max_past_years)):
                    logger.warning(f"Corrected timestamp by swapping day/month: {timestamp} -> {corrected}")
                    return corrected, None
            except ValueError:
                pass
        
        # If still invalid, clamp to current time
        logger.error(f"{error}. Clamping to current time.")
        return now, error
    
    # Check if timestamp is too far in the past
    past_limit = now - timedelta(days=365 * max_past_years)
    if timestamp < past_limit:
        error = f"Timestamp too far in past: {timestamp.isoformat()}"
        
        # Try to detect if year is wrong (2-digit year interpreted incorrectly)
        if timestamp.year < 2000:
            # Try adding 100 years (1925 -> 2025)
            try:
                corrected = timestamp.replace(year=timestamp.year + 100)
                if corrected <= future_limit and corrected >= past_limit:
                    logger.warning(f"Corrected timestamp by adjusting year: {timestamp} -> {corrected}")
                    return corrected, None
            except ValueError:
                pass
        
        logger.error(f"{error}. Timestamp rejected.")
        return timestamp, error
    
    # Check for obviously invalid dates
    if timestamp.year < 2020 or timestamp.year > 2030:
        error = f"Timestamp has invalid year: {timestamp.year}"
        
        # Try to correct common year mistakes
        current_year = now.year
        if timestamp.year < 2000:
            # 2-digit year issue: 25 should be 2025, not 1925
            try:
                corrected = timestamp.replace(year=2000 + (timestamp.year % 100))
                if corrected <= future_limit and corrected >= past_limit:
                    logger.warning(f"Corrected 2-digit year: {timestamp} -> {corrected}")
                    return corrected, None
            except ValueError:
                pass
        
        logger.error(f"{error}. Timestamp rejected.")
        return timestamp, error
    
    # Timestamp is valid
    return timestamp, None


def format_timestamp_error(error: str, record_info: dict) -> dict:
    """
    Format timestamp validation error for reporting
    
    Args:
        error: Error message from validation
        record_info: Dictionary with record details (user_id, timestamp, etc.)
    
    Returns:
        Formatted error dictionary
    """
    return {
        "user_id": record_info.get("user_id"),
        "timestamp": record_info.get("timestamp"),
        "error": f"Timestamp validation failed: {error}"
    }
