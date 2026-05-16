"""Force-kill any stuck ZKTeco device sessions by sending CMD_EXIT.

Reads device IPs from devices.json (the same file the backend uses).
Run from the backend-api directory:  python _kill_sessions.py
"""
import json
import socket
import struct
from pathlib import Path

try:
    with open(Path(__file__).parent / 'devices.json', 'r', encoding='utf-8') as f:
        _devices = json.load(f)
    DEVICES = [(d['ip'], int(d.get('port') or 4370)) for d in _devices if d.get('ip')]
except Exception:
    DEVICES = []  # no devices.json yet, or empty

CMD_EXIT = 1001

for ip, port in DEVICES:
    for proto in ('tcp', 'udp'):
        try:
            if proto == 'tcp':
                s = socket.create_connection((ip, port), timeout=3)
                header = struct.pack('<HHHH', CMD_EXIT, 0, 0, 0)
                s.sendall(b'\x50\x50\x82\x7e' + struct.pack('<H', len(header)) + b'\x00\x00' + header)
            else:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.settimeout(3)
                header = struct.pack('<HHHH', CMD_EXIT, 0, 0, 0)
                s.sendto(header, (ip, port))
            try:
                s.recv(64)
            except:
                pass
            s.close()
            print(f"  {ip}:{port} ({proto.upper()}) - CMD_EXIT sent")
        except Exception as e:
            print(f"  {ip}:{port} ({proto.upper()}) - {e}")

print("\nAll device sessions cleared.")
