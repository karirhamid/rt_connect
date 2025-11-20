"""
Script to populate source_device_id for existing employees by matching them with devices.
This is a one-time migration script to fix existing employees that were synced before
the source_device_id field was added.
"""
from app.database import get_db_session
from app.database.schema import Employee, Device
from app.services.device_manager import ZKTecoDeviceManager
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

with get_db_session() as db:
    # Get all devices
    devices = db.query(Device).all()
    logger.info(f"Found {len(devices)} devices")
    
    # Get all employees without source_device_id
    employees_without_device = db.query(Employee).filter(
        Employee.source_device_id == None
    ).all()
    logger.info(f"Found {len(employees_without_device)} employees without source_device_id")
    
    if not employees_without_device:
        logger.info("All employees already have source_device_id set!")
        exit(0)
    
    updated_count = 0
    
    # For each device, get users and match with employees
    for device in devices:
        logger.info(f"\nChecking device: {device.name} ({device.ip}:{device.port})")
        
        try:
            # Connect to device and get users
            manager = ZKTecoDeviceManager(ip=device.ip, port=device.port)
            manager.connect()
            users = manager.get_users()
            manager.disconnect()
            
            logger.info(f"  Found {len(users)} users on device")
            
            # Match users with employees
            for user in users:
                # Find employee by device_user_id and user_id
                employee = db.query(Employee).filter(
                    Employee.device_user_id == user.uid,
                    Employee.user_id == user.user_id,
                    Employee.source_device_id == None
                ).first()
                
                if employee:
                    employee.source_device_id = device.id
                    updated_count += 1
                    logger.info(f"  ✓ Linked employee {employee.name} (ID: {employee.user_id}) to device {device.name}")
            
            db.commit()
            
        except Exception as e:
            logger.error(f"  ✗ Error accessing device {device.name}: {e}")
            continue
    
    logger.info(f"\n{'='*60}")
    logger.info(f"Migration complete!")
    logger.info(f"Updated {updated_count} employees with source_device_id")
    logger.info(f"{'='*60}")
