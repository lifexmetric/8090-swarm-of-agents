from jose import JWTError

from src.core.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from src.db import postgres, redis_client
from src.models.schemas import LoginRequest, TokenResponse, UserInfo, VerifyResponse


async def authenticate_user(username: str, password: str) -> dict | None:
    user = await postgres.get_user_by_username(username)
    if user is None:
        return None
    if not user.get("is_active", False):
        return None
    if not verify_password(password, user["password_hash"]):
        return None
    return user


async def login(request: LoginRequest) -> TokenResponse:
    user = await authenticate_user(request.username, request.password)
    if user is None:
        raise ValueError("Invalid username or password")

    token_data = {
        "sub": user["id"],
        "username": user["username"],
        "email": user["email"],
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    await redis_client.store_refresh_token(
        user_id=user["id"],
        token=refresh_token,
        expire_days=REFRESH_TOKEN_EXPIRE_DAYS,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


async def refresh_tokens(refresh_token: str) -> TokenResponse:
    try:
        payload = decode_token(refresh_token)
    except JWTError:
        raise ValueError("Invalid or expired refresh token")

    if payload.get("type") != "refresh":
        raise ValueError("Token is not a refresh token")

    user_id: str = payload.get("sub", "")
    if not user_id:
        raise ValueError("Invalid token payload")

    stored_token = await redis_client.get_refresh_token(user_id)
    if stored_token is None or stored_token != refresh_token:
        raise ValueError("Refresh token not found or already invalidated")

    token_data = {
        "sub": user_id,
        "username": payload.get("username", ""),
        "email": payload.get("email", ""),
    }
    new_access_token = create_access_token(token_data)
    new_refresh_token = create_refresh_token(token_data)

    await redis_client.store_refresh_token(
        user_id=user_id,
        token=new_refresh_token,
        expire_days=REFRESH_TOKEN_EXPIRE_DAYS,
    )

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
    )


async def logout(access_token: str, user_id: str) -> None:
    await redis_client.blacklist_token(
        token=access_token,
        expire_minutes=ACCESS_TOKEN_EXPIRE_MINUTES,
    )
    await redis_client.delete_refresh_token(user_id)


async def verify_token(token: str) -> VerifyResponse:
    blacklisted = await redis_client.is_token_blacklisted(token)
    if blacklisted:
        return VerifyResponse(valid=False)

    try:
        payload = decode_token(token)
    except JWTError:
        return VerifyResponse(valid=False)

    if payload.get("type") != "access":
        return VerifyResponse(valid=False)

    user_id = payload.get("sub")
    username = payload.get("username")
    email = payload.get("email")

    if not user_id or not username:
        return VerifyResponse(valid=False)

    user_info = UserInfo(
        id=user_id,
        username=username,
        email=email or "",
    )
    return VerifyResponse(valid=True, user=user_info)
