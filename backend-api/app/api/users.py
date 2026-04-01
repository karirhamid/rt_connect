from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.database.connection import get_db_session
from app.database.schema import User, Role, Permission
from app.core.security import get_password_hash, require_permission, get_current_user

router = APIRouter()


class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str]
    is_active: bool
    roles: List[str] = []


class CreateUserIn(BaseModel):
    username: str
    email: Optional[str]
    password: str
    roles: Optional[List[str]] = []


class UpdateUserIn(BaseModel):
    email: Optional[str]
    password: Optional[str]
    is_active: Optional[bool]
    roles: Optional[List[str]] = None


@router.get('/users', response_model=List[UserOut])
def list_users(current=Depends(get_current_user)):
    with get_db_session() as db:
        users = db.query(User).all()
        out = []
        for u in users:
            out.append(UserOut(id=u.id, username=u.username, email=u.email, is_active=u.is_active, roles=[r.name for r in u.roles]))
        return out

# Convenience alias: GET /api/users -> list users (same as /api/users/users)
@router.get('/', response_model=List[UserOut])
def list_users_root(current=Depends(get_current_user)):
    with get_db_session() as db:
        users = db.query(User).all()
        out = []
        for u in users:
            out.append(UserOut(id=u.id, username=u.username, email=u.email, is_active=u.is_active, roles=[r.name for r in u.roles]))
        return out


# Also support no-slash path for convenience (maps to /api/users)
@router.get('', response_model=List[UserOut])
def list_users_empty(current=Depends(get_current_user)):
    with get_db_session() as db:
        users = db.query(User).all()
        out = []
        for u in users:
            out.append(UserOut(id=u.id, username=u.username, email=u.email, is_active=u.is_active, roles=[r.name for r in u.roles]))
        return out


@router.post('/users', response_model=UserOut, status_code=201, dependencies=[Depends(require_permission('users.create'))])
def create_user(payload: CreateUserIn):
    with get_db_session() as db:
        if db.query(User).filter(User.username == payload.username).first():
            raise HTTPException(status_code=400, detail='Username already exists')
        user = User(username=payload.username, email=payload.email, password_hash=get_password_hash(payload.password))
        if payload.roles:
            roles = db.query(Role).filter(Role.name.in_(payload.roles)).all()
            user.roles = roles
        db.add(user)
        db.commit()
        db.refresh(user)
        return UserOut(id=user.id, username=user.username, email=user.email, is_active=user.is_active, roles=[r.name for r in user.roles])


@router.get('/users/{user_id}', response_model=UserOut, dependencies=[Depends(require_permission('users.read'))])
def get_user(user_id: int):
    with get_db_session() as db:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail='User not found')
        return UserOut(id=user.id, username=user.username, email=user.email, is_active=user.is_active, roles=[r.name for r in user.roles])


@router.put('/users/{user_id}', response_model=UserOut, dependencies=[Depends(require_permission('users.update'))])
def update_user(user_id: int, payload: UpdateUserIn):
    with get_db_session() as db:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail='User not found')
        if payload.email is not None:
            user.email = payload.email
        if payload.password:
            user.password_hash = get_password_hash(payload.password)
        if payload.is_active is not None:
            user.is_active = payload.is_active
        if payload.roles is not None:
            roles = db.query(Role).filter(Role.name.in_(payload.roles)).all()
            user.roles = roles
        db.add(user)
        db.commit()
        db.refresh(user)
        return UserOut(id=user.id, username=user.username, email=user.email, is_active=user.is_active, roles=[r.name for r in user.roles])


@router.delete('/users/{user_id}', status_code=204, dependencies=[Depends(require_permission('users.delete'))])
def delete_user(user_id: int):
    with get_db_session() as db:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail='User not found')
        db.delete(user)
        db.commit()
        return {}


# Roles and permissions management
class RoleOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    permissions: List[str] = []


class CreateRoleIn(BaseModel):
    name: str
    description: Optional[str]
    permissions: Optional[List[str]] = []


@router.get('/roles', response_model=List[RoleOut], dependencies=[Depends(require_permission('roles.read'))])
def list_roles():
    with get_db_session() as db:
        roles = db.query(Role).all()
        out = [RoleOut(id=r.id, name=r.name, description=r.description, permissions=[p.code for p in r.permissions]) for r in roles]
        return out


@router.post('/roles', response_model=RoleOut, status_code=201, dependencies=[Depends(require_permission('roles.manage'))])
def create_role(payload: CreateRoleIn):
    with get_db_session() as db:
        if db.query(Role).filter(Role.name == payload.name).first():
            raise HTTPException(status_code=400, detail='Role exists')
        role = Role(name=payload.name, description=payload.description)
        if payload.permissions:
            perms = db.query(Permission).filter(Permission.code.in_(payload.permissions)).all()
            role.permissions = perms
        db.add(role)
        db.commit()
        db.refresh(role)
        return RoleOut(id=role.id, name=role.name, description=role.description, permissions=[p.code for p in role.permissions])


@router.put('/roles/{role_id}', response_model=RoleOut, dependencies=[Depends(require_permission('roles.manage'))])
def update_role(role_id: int, payload: CreateRoleIn):
    with get_db_session() as db:
        role = db.query(Role).filter(Role.id == role_id).first()
        if not role:
            raise HTTPException(status_code=404, detail='Role not found')
        role.name = payload.name or role.name
        role.description = payload.description if payload.description is not None else role.description
        if payload.permissions is not None:
            perms = db.query(Permission).filter(Permission.code.in_(payload.permissions)).all()
            role.permissions = perms
        db.add(role)
        db.commit()
        db.refresh(role)
        return RoleOut(id=role.id, name=role.name, description=role.description, permissions=[p.code for p in role.permissions])


@router.get('/permissions', dependencies=[Depends(require_permission('roles.read'))])
def list_permissions():
    with get_db_session() as db:
        perms = db.query(Permission).all()
        return [{'code': p.code, 'description': p.description} for p in perms]
