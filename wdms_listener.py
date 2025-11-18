"""
WDMS Push Protocol Listener
This server listens for connections FROM the ZKTeco device
The device will push attendance data to this server
"""
import socket
import threading
import struct
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class WDMSListener:
    """Listener for WDMS push protocol"""
    
    def __init__(self, host='0.0.0.0', port=8000):
        self.host = host
        self.port = port
        self.server_socket = None
        self.running = False
        self.clients = []
        
    def start(self):
        """Start the WDMS listener"""
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(5)
            self.running = True
            
            logger.info("="*70)
            logger.info(f"WDMS Listener started on {self.host}:{self.port}")
            logger.info("="*70)
            logger.info(f"Waiting for device connections from 196.206.228.46...")
            logger.info(f"Device should be configured to push to: 105.158.158.169:{self.port}")
            logger.info("="*70)
            
            while self.running:
                try:
                    client_socket, address = self.server_socket.accept()
                    logger.info(f"\n{'='*70}")
                    logger.info(f"✓ Device connected from {address[0]}:{address[1]}")
                    logger.info(f"{'='*70}")
                    
                    # Handle client in a new thread
                    client_thread = threading.Thread(
                        target=self.handle_client,
                        args=(client_socket, address)
                    )
                    client_thread.daemon = True
                    client_thread.start()
                    
                except KeyboardInterrupt:
                    logger.info("\nShutting down server...")
                    break
                except Exception as e:
                    if self.running:
                        logger.error(f"Error accepting connection: {e}")
                        
        except Exception as e:
            logger.error(f"Failed to start server: {e}")
        finally:
            self.stop()
    
    def handle_client(self, client_socket, address):
        """Handle incoming device connection"""
        logger.info(f"Handling connection from {address[0]}")
        
        try:
            while self.running:
                # Receive data from device
                data = client_socket.recv(4096)
                
                if not data:
                    logger.warning(f"Connection closed by device {address[0]}")
                    break
                
                # Log received data
                logger.info(f"\nReceived {len(data)} bytes from {address[0]}")
                logger.info(f"Raw data (hex): {data.hex()}")
                logger.info(f"Raw data (bytes): {data}")
                
                # Try to parse the data
                self.parse_zk_packet(data, address)
                
                # Send acknowledgment
                try:
                    ack = b'\x50\x50\x82\x7d\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
                    client_socket.send(ack)
                    logger.info("Sent ACK to device")
                except Exception as e:
                    logger.error(f"Error sending ACK: {e}")
                
        except Exception as e:
            logger.error(f"Error handling client {address[0]}: {e}")
        finally:
            client_socket.close()
            logger.info(f"Connection with {address[0]} closed")
    
    def parse_zk_packet(self, data, address):
        """Parse ZKTeco protocol packet"""
        try:
            if len(data) < 16:
                logger.warning("Packet too short")
                return
            
            # ZKTeco packet header structure
            # Bytes 0-1: Start (0x5050)
            # Bytes 4-7: Command ID
            # Bytes 8-9: Checksum
            # Bytes 10-11: Session ID
            # Bytes 12-13: Reply number
            
            start = struct.unpack('<H', data[0:2])[0]
            if start == 0x5050:
                logger.info("✓ Valid ZKTeco packet detected")
                
                command = struct.unpack('<H', data[4:6])[0]
                session_id = struct.unpack('<H', data[10:12])[0]
                
                logger.info(f"  Command ID: {command} (0x{command:04x})")
                logger.info(f"  Session ID: {session_id}")
                
                # Common command IDs
                commands = {
                    0x03E8: "Connect",
                    0x03E9: "Disconnect", 
                    0x03ED: "Get Attendance",
                    0x05DC: "Real-time Log",
                    0x0064: "Get Users",
                }
                
                if command in commands:
                    logger.info(f"  Command Type: {commands[command]}")
                
                # If there's payload data
                if len(data) > 16:
                    payload = data[16:]
                    logger.info(f"  Payload: {len(payload)} bytes")
                    logger.info(f"  Payload (hex): {payload.hex()}")
                    
                    # Try to parse as attendance record
                    if command == 0x05DC and len(payload) >= 8:
                        self.parse_attendance_record(payload)
            else:
                logger.warning(f"Unknown packet format (start: 0x{start:04x})")
                
        except Exception as e:
            logger.error(f"Error parsing packet: {e}")
    
    def parse_attendance_record(self, payload):
        """Parse attendance record from payload"""
        try:
            # Attendance record structure (varies by device)
            # Try common format
            if len(payload) >= 16:
                user_id = struct.unpack('<I', payload[0:4])[0]
                timestamp = struct.unpack('<I', payload[4:8])[0]
                
                # Convert timestamp
                dt = datetime.fromtimestamp(timestamp)
                
                logger.info(f"\n  📊 ATTENDANCE RECORD:")
                logger.info(f"     User ID: {user_id}")
                logger.info(f"     Timestamp: {dt}")
                logger.info(f"     Raw time: {timestamp}")
                
        except Exception as e:
            logger.error(f"Error parsing attendance: {e}")
    
    def stop(self):
        """Stop the server"""
        self.running = False
        if self.server_socket:
            try:
                self.server_socket.close()
            except:
                pass
        logger.info("Server stopped")


def main():
    print("\n" + "="*70)
    print("ZKTeco WDMS Push Listener")
    print("="*70)
    print("\nYour Configuration:")
    print("  Device IP: 196.206.228.46")
    print("  Your Public IP: 105.158.158.169")
    print("  Device WDMS Setting: Domain/IP = 105.158.158.169")
    print("  Device WDMS Port: 4370 (CHANGE THIS!)")
    print("\n⚠️  IMPORTANT: Change device WDMS port from 4370 to 8000")
    print("   4370 is the device's port, not your server port!")
    print("\nCorrect Device Configuration:")
    print("  Domain/IP: 105.158.158.169")
    print("  Port: 8000 (or any port this server listens on)")
    print("="*70)
    
    # Default port
    port = 8000
    
    print(f"\nStarting listener on port {port}...")
    print("Press Ctrl+C to stop")
    print("\nWaiting for device to connect and push data...")
    print("="*70)
    
    listener = WDMSListener(host='0.0.0.0', port=port)
    
    try:
        listener.start()
    except KeyboardInterrupt:
        print("\n\nShutting down...")
        listener.stop()


if __name__ == "__main__":
    main()
