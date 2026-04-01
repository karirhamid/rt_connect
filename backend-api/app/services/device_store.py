import json
import os
from typing import List, Optional
from pydantic import BaseModel

class Device(BaseModel):
    id: str
    name: str
    ip: str
    port: int
    tag: Optional[str] = None
    serial_number: Optional[str] = None
    date_format: Optional[str] = "YYYY-MM-DD"  # YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY

class DeviceStore:
    def __init__(self, file_path: str = "devices.json"):
        self.file_path = file_path
        self.devices: List[Device] = []
        self.load_devices()
    
    def load_devices(self):
        """Load devices from JSON file and from database"""
        # First try JSON file for backwards compatibility
        if os.path.exists(self.file_path):
            try:
                with open(self.file_path, 'r') as f:
                    data = json.load(f)
                    self.devices = [Device(**d) for d in data]
                    if self.devices:
                        return
                    # JSON exists but is empty — fall through to database
            except Exception as e:
                print(f"Error loading devices from JSON: {e}")
        
        # If no JSON file or JSON was empty, try loading from database
        self._load_from_db()
    
    def save_devices(self):
        """Save devices to JSON file"""
        try:
            with open(self.file_path, 'w') as f:
                json.dump([d.dict() for d in self.devices], f, indent=2)
        except Exception as e:
            print(f"Error saving devices: {e}")
    
    def get_all(self) -> List[Device]:
        """Get all devices. Falls back to database if in-memory list is empty."""
        if not self.devices:
            self._load_from_db()
        return self.devices

    def _load_from_db(self):
        """Reload device list from PostgreSQL."""
        try:
            from app.database.connection import SessionLocal
            from app.database.schema import Device as DBDevice

            db = SessionLocal()
            db_devices = db.query(DBDevice).filter(DBDevice.is_active == True).all()
            self.devices = [
                Device(
                    id=str(d.id),
                    name=d.name,
                    ip=d.ip,
                    port=d.port,
                    tag=d.tag,
                    serial_number=d.serial_number,
                    date_format=d.date_format if hasattr(d, 'date_format') else "YYYY-MM-DD"
                )
                for d in db_devices
            ]
            db.close()
            if self.devices:
                self.save_devices()
        except Exception as e:
            print(f"Error loading devices from database: {e}")
    
    def get_by_id(self, device_id: str) -> Optional[Device]:
        """Get device by ID"""
        for device in self.devices:
            if device.id == device_id:
                return device
        return None
    
    def add(self, device: Device):
        """Add a new device"""
        self.devices.append(device)
        self.save_devices()
    
    def delete(self, device_id: str) -> bool:
        """Delete a device"""
        for i, device in enumerate(self.devices):
            if device.id == device_id:
                self.devices.pop(i)
                self.save_devices()
                return True
        return False
    
    def update(self, device_id: str, device: Device) -> bool:
        """Update a device"""
        for i, d in enumerate(self.devices):
            if d.id == device_id:
                self.devices[i] = device
                self.save_devices()
                return True
        return False

# Global device store instance
device_store = DeviceStore()
