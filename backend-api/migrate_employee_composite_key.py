"""
Migration: Add composite primary key to employees table

This adds a new unique identifier column that combines:
- Device identifier (last 3 digits of IP)
- Auto-increment number

Example: For device 10.185.1.201, keys will be 20101, 20102, 20103, etc.
         For device 10.185.1.202, keys will be 20201, 20202, 20203, etc.

The existing 'id' column becomes a secondary unique identifier.
The device user_id can now be duplicated across different devices.
"""

import asyncio
from sqlalchemy import text
from app.database import get_db_session
from app.services.device_store import device_store
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def migrate_employee_keys():
    """Add composite key column and migrate existing data"""
    
    with get_db_session() as db:
        try:
            # Step 1: Add new column for composite key
            logger.info("Step 1: Adding composite_id column...")
            db.execute(text("""
                ALTER TABLE employees 
                ADD COLUMN IF NOT EXISTS composite_id BIGINT UNIQUE;
            """))
            db.commit()
            logger.info("✓ Column added")
            
            # Step 2: Create index on composite_id
            logger.info("Step 2: Creating index on composite_id...")
            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_employees_composite_id 
                ON employees(composite_id);
            """))
            db.commit()
            logger.info("✓ Index created")
            
            # Step 3: Get all devices to build device prefix map
            devices = device_store.get_all()
            device_prefixes = {}
            
            for device in devices:
                # Extract last 3 digits from IP (e.g., 10.185.1.201 -> 201)
                ip_parts = device.ip.split('.')
                last_octet = ip_parts[-1]
                prefix = int(last_octet) * 100  # 201 -> 20100
                device_prefixes[device.id] = prefix
                logger.info(f"Device {device.name} ({device.ip}) -> prefix {prefix}")
            
            # Step 4: Migrate existing employees
            logger.info("Step 3: Migrating existing employee data...")
            
            employees = db.execute(text("""
                SELECT id, source_device_id, user_id 
                FROM employees 
                WHERE composite_id IS NULL
                ORDER BY source_device_id, created_at
            """)).fetchall()
            
            # Group by device and assign sequential numbers
            device_counters = {}
            updates = []
            
            for emp in employees:
                emp_id, device_id, user_id = emp
                
                # Get device prefix
                if device_id not in device_prefixes:
                    logger.warning(f"Unknown device {device_id} for employee {emp_id}, skipping...")
                    continue
                
                prefix = device_prefixes[device_id]
                
                # Get next counter for this device
                if device_id not in device_counters:
                    device_counters[device_id] = 1
                else:
                    device_counters[device_id] += 1
                
                counter = device_counters[device_id]
                composite_id = prefix + counter  # e.g., 20100 + 1 = 20101
                
                updates.append((composite_id, emp_id))
                logger.info(f"  Employee ID {emp_id} (user_id={user_id}) -> composite_id {composite_id}")
            
            # Apply updates
            for composite_id, emp_id in updates:
                db.execute(text("""
                    UPDATE employees 
                    SET composite_id = :composite_id 
                    WHERE id = :emp_id
                """), {"composite_id": composite_id, "emp_id": emp_id})
            
            db.commit()
            logger.info(f"✓ Migrated {len(updates)} employees")
            
            # Step 5: Create trigger for auto-assigning composite_id on new inserts
            logger.info("Step 4: Creating trigger for new employees...")
            db.execute(text("""
                CREATE OR REPLACE FUNCTION assign_composite_id()
                RETURNS TRIGGER AS $$
                DECLARE
                    device_prefix INTEGER;
                    last_counter INTEGER;
                    new_composite_id BIGINT;
                    device_ip TEXT;
                    last_octet INTEGER;
                BEGIN
                    -- Get device IP
                    SELECT ip INTO device_ip 
                    FROM devices 
                    WHERE id = NEW.source_device_id;
                    
                    IF device_ip IS NULL THEN
                        RAISE EXCEPTION 'Device not found for source_device_id: %', NEW.source_device_id;
                    END IF;
                    
                    -- Extract last octet from IP (e.g., 10.185.1.201 -> 201)
                    last_octet := CAST(split_part(device_ip, '.', 4) AS INTEGER);
                    device_prefix := last_octet * 100;
                    
                    -- Get last counter for this device
                    SELECT COALESCE(MAX(composite_id), device_prefix) INTO last_counter
                    FROM employees
                    WHERE composite_id >= device_prefix 
                      AND composite_id < device_prefix + 100;
                    
                    -- Assign next composite_id
                    IF last_counter < device_prefix THEN
                        new_composite_id := device_prefix + 1;
                    ELSE
                        new_composite_id := last_counter + 1;
                    END IF;
                    
                    NEW.composite_id := new_composite_id;
                    
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
            """))
            
            db.execute(text("""
                DROP TRIGGER IF EXISTS trg_assign_composite_id ON employees;
                
                CREATE TRIGGER trg_assign_composite_id
                BEFORE INSERT ON employees
                FOR EACH ROW
                WHEN (NEW.composite_id IS NULL)
                EXECUTE FUNCTION assign_composite_id();
            """))
            db.commit()
            logger.info("✓ Trigger created")
            
            # Step 6: Show summary
            logger.info("\n" + "="*60)
            logger.info("MIGRATION SUMMARY")
            logger.info("="*60)
            
            for device in devices:
                count = db.execute(text("""
                    SELECT COUNT(*) 
                    FROM employees 
                    WHERE source_device_id = :device_id
                """), {"device_id": device.id}).scalar()
                
                prefix = device_prefixes[device.id]
                logger.info(f"{device.name} ({device.ip}):")
                logger.info(f"  Prefix: {prefix}")
                logger.info(f"  Employees: {count}")
                logger.info(f"  ID range: {prefix + 1} to {prefix + count}")
            
            logger.info("="*60)
            logger.info("✓ Migration completed successfully!")
            logger.info("\nNote: user_id column can now have duplicates across devices")
            logger.info("      composite_id is now the unique identifier")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Migration failed: {e}")
            raise

if __name__ == "__main__":
    asyncio.run(migrate_employee_keys())
