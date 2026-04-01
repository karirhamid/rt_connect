#!/usr/bin/env python3
"""Create a strong `rtadmin` user in the application's database.

Usage: run with the project's venv Python:
  C:\path\to\venv\Scripts\python.exe scripts\create_rtadmin.py

The script prints the generated password to stdout once the user is created.
"""
import secrets
import string
import sys
import os

# Ensure project root is on sys.path so `app` package can be imported when
# running this script directly.
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.database.connection import get_db_session
from app.database.schema import User, Role
from app.core.security import get_password_hash


def generate_password(length: int = 20) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*()-_=+[]{}<>?"
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def main(force_reset: bool = False):
    username = 'rtadmin'
    password = generate_password(20)
    hashed = get_password_hash(password)

    with get_db_session() as db:
        existing = db.query(User).filter(User.username == username).first()
        # Try to find Administrator role if exists
        admin_role = db.query(Role).filter(Role.name == 'Administrator').first()

        if existing:
            if not force_reset:
                print(f"User '{username}' already exists (id={existing.id}). Exiting.")
                sys.exit(0)
            # rotate password for existing user
            existing.password_hash = hashed
            if admin_role and admin_role not in existing.roles:
                existing.roles.append(admin_role)
            db.add(existing)
            db.commit()
            created_id = existing.id
            created_user = existing
            action = 'rotated'
        else:
            user = User(username=username, email=None, password_hash=hashed, is_active=True)
            if admin_role:
                user.roles = [admin_role]
            db.add(user)
            db.commit()
            db.refresh(user)
            created_id = user.id
            created_user = user
            action = 'created'

    print(f"User '{username}' {action} (id={created_id}).")
    print('IMPORTANT: store the password securely. Password shown below:')
    print(password)


if __name__ == '__main__':
    force = '--force' in sys.argv or '--reset' in sys.argv
    main(force_reset=force)
