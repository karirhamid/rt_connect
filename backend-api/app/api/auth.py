from fastapi import APIRouter, HTTPException, status, Depends, Response, Request
from pydantic import BaseModel
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token, get_current_user
from app.database.connection import get_db_session
from app.database.schema import User
from datetime import timedelta
import os

router = APIRouter()


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = 'bearer'


@router.post('/auth/login', response_model=TokenOut)
def login(payload: LoginIn, response: Response):
    with get_db_session() as db:
        user = db.query(User).filter(User.username == payload.username).first()
        if not user or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid credentials')

        data = {'sub': user.username}
        access = create_access_token(data, expires_delta=timedelta(minutes=int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', '15'))))
        refresh = create_refresh_token(data, expires_delta=timedelta(days=int(os.getenv('REFRESH_TOKEN_EXPIRE_DAYS', '7'))))
        # Set refresh token in a secure, httpOnly cookie. Frontend should
        # call refresh endpoint with credentials included to rotate the cookie.
        secure_flag = os.getenv('ENV', 'development') == 'production'
        response.set_cookie(
            key='refresh_token', value=refresh,
            httponly=True, secure=secure_flag, samesite='Lax', path='/api/auth/refresh'
        )
        return {'access_token': access}


@router.post('/auth/refresh', response_model=TokenOut)
def refresh_token(request: Request, response: Response):
    # Read refresh token from secure cookie (HttpOnly)
    refresh_token = request.cookies.get('refresh_token')
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing refresh token')

    token_data = decode_token(refresh_token)
    if not token_data or token_data.get('type') != 'refresh':
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid refresh token')

    username = token_data.get('sub')
    with get_db_session() as db:
        user = db.query(User).filter(User.username == username).first()
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='User not found')

        data = {'sub': user.username}
        access = create_access_token(data)
        # rotate refresh token in cookie
        new_refresh = create_refresh_token(data)
        secure_flag = os.getenv('ENV', 'development') == 'production'
        response.set_cookie(
            key='refresh_token', value=new_refresh,
            httponly=True, secure=secure_flag, samesite='Lax', path='/api/auth/refresh'
        )
        return {'access_token': access}


@router.post('/auth/logout')
def logout(response: Response):
    # Clear refresh cookie
    response.delete_cookie('refresh_token', path='/api/auth/refresh')
    return {'detail': 'Logged out'}


@router.get('/auth/me')
def me(current_user: User = Depends(get_current_user)):
    return {
        'username': current_user.username,
        'email': current_user.email,
        'is_active': current_user.is_active,
        'roles': [r.name for r in current_user.roles]
    }
