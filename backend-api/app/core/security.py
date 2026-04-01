from datetime import datetime, timedelta
import os
from passlib.context import CryptContext
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from typing import List
from app.database.connection import get_db_session
from app.database.schema import User, Role, Permission
from sqlalchemy.orm import joinedload
from sqlalchemy.orm.exc import DetachedInstanceError
from sqlalchemy import inspect

SECRET_KEY = os.getenv('JWT_SECRET', 'dev-secret-key')
ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', '480'))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv('REFRESH_TOKEN_EXPIRE_DAYS', '7'))

"""
Use PBKDF2-SHA256 for password hashing in development environments to avoid
platform-specific bcrypt backend issues (binary mismatches). For production
you can switch back to bcrypt if desired.
"""
pwd_context = CryptContext(schemes=['pbkdf2_sha256'], deprecated='auto')
oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/api/auth/login')


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({'exp': expire, 'type': 'access'})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({'exp': expire, 'type': 'refresh'})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def get_current_user(token: str = Depends(oauth2_scheme)):
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token')

    if payload.get('type') != 'access':
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token type')

    username = payload.get('sub')
    if username is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token payload')

    with get_db_session() as db:
        # Eagerly load roles and permissions with joinedload so relationships
        # are populated while the session is open and won't require lazy
        # loading after the session closes.
        user = db.query(User).options(
            joinedload(User.roles).joinedload(Role.permissions)
        ).filter(User.username == username).first()
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='User not found or inactive')
        # At this point roles and permissions should be loaded due to joinedload.
        return user


def user_has_permission(user: User, permission_code: str) -> bool:
    # Check user's roles for the permission code. If the user instance is
    # detached (relationships not available), re-query the DB to fetch roles
    # and permissions for the user id as a safe fallback.
    try:
        roles = user.roles or []
    except DetachedInstanceError:
        roles = None

    if roles is None:
        # Get user PK safely and re-query roles+permissions
        try:
            insp = inspect(user)
            pk = insp.identity[0] if insp and insp.identity else None
        except Exception:
            pk = None

        if not pk:
            return False

        with get_db_session() as db:
            # Get role IDs for the user, then check permissions by role IDs.
            role_objs = db.query(Role).join(Role.users).filter(User.id == pk).all()
            role_ids = [r.id for r in role_objs]
            if not role_ids:
                return False
            exists = db.query(Permission).join(Permission.roles).filter(Role.id.in_(role_ids), Permission.code == permission_code).first()
            return bool(exists)

    # If we have role instances, compute their PKs safely (without accessing
    # attributes that may trigger lazy loads) and run a DB query to check
    # whether any of their permissions match `permission_code`.
    role_pks = []
    for role in roles:
        try:
            r_insp = inspect(role)
            role_pk = r_insp.identity[0] if r_insp and r_insp.identity else getattr(role, 'id', None)
        except Exception:
            role_pk = getattr(role, 'id', None)
        if role_pk:
            role_pks.append(role_pk)

    if not role_pks:
        return False

    with get_db_session() as db:
        exists = db.query(Permission).join(Permission.roles).filter(Role.id.in_(role_pks), Permission.code == permission_code).first()
        return bool(exists)
    return False


def require_permission(permission_code: str):
    def dependency(user: User = Depends(get_current_user)):
        if user_has_permission(user, permission_code):
            return True
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Insufficient permissions')
    return dependency
