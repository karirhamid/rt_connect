from zk import ZK
from typing import Optional, List
from datetime import datetime
import logging
import socket
from app.core import settings
from app.models import DeviceInfo, User, Attendance

logger = logging.getLogger(__name__)


class ZKTecoDeviceManager:
    """Manager class for ZKTeco device operations"""
    
    def __init__(self, ip: str = None, port: int = None, timeout: int = None, password: int = None, force_udp: bool = False):
        self.ip = ip or settings.DEVICE_IP
        self.port = port or settings.DEVICE_PORT
        self.timeout = timeout or settings.DEVICE_TIMEOUT
        self.password = password or settings.DEVICE_PASSWORD
        self.force_udp = force_udp
        self.conn = None
        self.zk = None
        
    def connect(self) -> bool:
        """Establish connection to the ZKTeco device"""
        last_error = None
        
        # Try TCP first, then UDP if TCP fails
        for force_udp in [False, True] if not self.force_udp else [True]:
            try:
                protocol = "UDP" if force_udp else "TCP"
                logger.info(f"Attempting connection via {protocol} to {self.ip}:{self.port}")
                
                self.zk = ZK(
                    self.ip,
                    port=self.port,
                    timeout=self.timeout,
                    password=self.password,
                    force_udp=force_udp,
                    ommit_ping=True,
                    verbose=False
                )
                
                # Set socket timeout
                socket.setdefaulttimeout(self.timeout)
                
                self.conn = self.zk.connect()
                logger.info(f"✓ Connected successfully via {protocol} to device at {self.ip}:{self.port}")
                return True
                
            except Exception as e:
                last_error = e
                logger.warning(f"Connection via {protocol} failed: {str(e)}")
                if self.conn:
                    try:
                        self.conn.disconnect()
                    except:
                        pass
                self.conn = None
                self.zk = None
                continue
        
        # If both methods failed
        error_msg = f"Failed to connect to device {self.ip}:{self.port}. Last error: {str(last_error)}"
        logger.error(error_msg)
        raise Exception(error_msg)
    
    def disconnect(self):
        """Disconnect from the ZKTeco device"""
        if self.conn:
            try:
                self.conn.disconnect()
                logger.info("Disconnected from device")
            except Exception as e:
                logger.error(f"Disconnect error: {str(e)}")
    
    def get_device_info(self) -> DeviceInfo:
        """Get device information"""
        try:
            self.connect()
            
            # Get device information
            serial_number = self.conn.get_serialnumber()
            device_name = self.conn.get_device_name()
            firmware_version = self.conn.get_firmware_version()
            platform = self.conn.get_platform()
            
            # Get counts
            users = self.conn.get_users()
            attendance_records = self.conn.get_attendance()
            
            # Get fingerprint and face counts
            fp_count = len([u for u in users if hasattr(u, 'privilege')])
            
            # Get network info
            mac = self.conn.get_mac()
            
            device_info = DeviceInfo(
                serial_number=serial_number or "Unknown",
                device_name=device_name or "ZKTeco Device",
                firmware_version=firmware_version or "Unknown",
                platform=platform or "Unknown",
                fingerprint_count=fp_count,
                user_count=len(users),
                face_count=0,  # Will need specific API call if supported
                attendance_count=len(attendance_records),
                ip_address=self.ip,
                mac_address=mac or "Unknown"
            )
            
            return device_info
        except Exception as e:
            logger.error(f"Error getting device info: {str(e)}")
            raise
        finally:
            self.disconnect()
    
    def get_users(self) -> List[User]:
        """Get all users from the device"""
        try:
            self.connect()
            users = self.conn.get_users()
            
            user_list = []
            for user in users:
                user_list.append(User(
                    uid=user.uid,
                    name=user.name,
                    privilege=user.privilege,
                    password=user.password if hasattr(user, 'password') else None,
                    group_id=user.group_id,
                    user_id=user.user_id,
                    card=user.card if hasattr(user, 'card') else None
                ))
            
            return user_list
        except Exception as e:
            logger.error(f"Error getting users: {str(e)}")
            raise
        finally:
            self.disconnect()
    
    def add_user(self, uid: int, name: str, privilege: int = 0, password: str = "", 
                 group_id: str = "", user_id: str = "", card: int = 0) -> bool:
        """Add a new user to the device"""
        try:
            self.connect()
            self.conn.set_user(
                uid=uid,
                name=name,
                privilege=privilege,
                password=password,
                group_id=group_id,
                user_id=user_id,
                card=card
            )
            logger.info(f"User {name} added successfully")
            return True
        except Exception as e:
            logger.error(f"Error adding user: {str(e)}")
            raise
        finally:
            self.disconnect()
    
    def update_user(self, uid: int, name: str, privilege: int = 0, password: str = "", 
                    group_id: str = "", user_id: str = "", card: int = 0) -> bool:
        """Update an existing user on the device
        
        IMPORTANT: This only updates the SPECIFIC user by UID.
        Other users on the device are NOT affected.
        
        Args:
            uid: Device user ID (unique identifier)
            name: User name
            privilege: 0=User, 14=Admin
            password: Optional password
            group_id: Optional group ID
            user_id: String user identifier
            card: Card number
        
        Returns:
            True if successful, raises exception otherwise
        """
        try:
            self.connect()
            
            # Log the operation for audit trail
            logger.info(f"Updating user UID={uid} on device: name='{name}', privilege={privilege}")
            
            # ZKTeco doesn't have a direct update method, so we delete and re-add
            # SAFETY: Only deletes the SPECIFIC user by UID, not all users
            user_existed = False
            try:
                self.conn.delete_user(uid=uid)
                user_existed = True
                logger.debug(f"Deleted existing user UID={uid} before update")
            except Exception as del_err:
                # User might not exist on device, which is OK for new users
                logger.debug(f"User UID={uid} not found on device (creating new): {del_err}")
                pass
            
            # Add the user with updated information
            # SAFETY: Only adds/updates this specific user
            self.conn.set_user(
                uid=uid,
                name=name,
                privilege=privilege,
                password=password,
                group_id=group_id,
                user_id=user_id,
                card=card
            )
            
            action = "updated" if user_existed else "created"
            logger.info(f"User {name} (UID: {uid}) {action} successfully on device")
            return True
            
        except Exception as e:
            logger.error(f"Error updating user UID={uid} on device: {str(e)}")
            raise
        finally:
            self.disconnect()
    
    def delete_user(self, uid: int) -> bool:
        """Delete a user from the device"""
        try:
            self.connect()
            self.conn.delete_user(uid=uid)
            logger.info(f"User {uid} deleted successfully")
            return True
        except Exception as e:
            logger.error(f"Error deleting user: {str(e)}")
            raise
        finally:
            self.disconnect()
    
    def get_attendance(self) -> List[Attendance]:
        """Get all attendance records from the device"""
        try:
            self.connect()
            attendance_records = self.conn.get_attendance()
            
            attendance_list = []
            for record in attendance_records:
                attendance_list.append(Attendance(
                    uid=record.uid,
                    user_id=record.user_id,
                    timestamp=record.timestamp,
                    status=record.status,
                    punch=record.punch
                ))
            
            return attendance_list
        except Exception as e:
            logger.error(f"Error getting attendance: {str(e)}")
            raise
        finally:
            self.disconnect()
    
    def clear_attendance(self) -> bool:
        """Clear all attendance records from the device"""
        try:
            self.connect()
            self.conn.clear_attendance()
            logger.info("Attendance records cleared successfully")
            return True
        except Exception as e:
            logger.error(f"Error clearing attendance: {str(e)}")
            raise
        finally:
            self.disconnect()
    
    def enable_device(self) -> bool:
        """Enable the device (unlock)"""
        try:
            self.connect()
            self.conn.enable_device()
            logger.info("Device enabled")
            return True
        except Exception as e:
            logger.error(f"Error enabling device: {str(e)}")
            raise
        finally:
            self.disconnect()
    
    def disable_device(self) -> bool:
        """Disable the device (lock)"""
        try:
            self.connect()
            self.conn.disable_device()
            logger.info("Device disabled")
            return True
        except Exception as e:
            logger.error(f"Error disabling device: {str(e)}")
            raise
        finally:
            self.disconnect()
    
    def restart_device(self) -> bool:
        """Restart the device"""
        try:
            self.connect()
            self.conn.restart()
            logger.info("Device restart command sent")
            return True
        except Exception as e:
            logger.error(f"Error restarting device: {str(e)}")
            raise
        finally:
            self.disconnect()
    
    def poweroff_device(self) -> bool:
        """Power off the device"""
        try:
            self.connect()
            self.conn.poweroff()
            logger.info("Device poweroff command sent")
            return True
        except Exception as e:
            logger.error(f"Error powering off device: {str(e)}")
            raise
        finally:
            self.disconnect()
    
    def test_voice(self, index: int = 0) -> bool:
        """Test voice on the device"""
        try:
            self.connect()
            self.conn.test_voice(index=index)
            logger.info(f"Voice test {index} executed")
            return True
        except Exception as e:
            logger.error(f"Error testing voice: {str(e)}")
            raise
        finally:
            self.disconnect()
    
    def get_time(self) -> dict:
        """Get device time and timezone offset"""
        try:
            self.connect()
            device_time = self.conn.get_time()
            logger.info(f"Device time: {device_time}")
            
            return {
                "device_time": device_time.isoformat() if device_time else None,
                "timezone_offset": 0  # ZKTeco devices don't directly expose timezone, we'll calculate from time difference
            }
        except Exception as e:
            logger.error(f"Error getting device time: {str(e)}")
            raise
        finally:
            self.disconnect()
    
    def set_time(self, timestamp=None) -> bool:
        """Set device time"""
        try:
            from datetime import datetime, timezone as tz
            
            self.connect()
            if timestamp is None:
                timestamp = datetime.now(tz.utc)
            
            self.conn.set_time(timestamp)
            logger.info(f"Device time set to: {timestamp}")
            return True
        except Exception as e:
            logger.error(f"Error setting device time: {str(e)}")
            raise
        finally:
            self.disconnect()


# Create a singleton instance
device_manager = ZKTecoDeviceManager()
