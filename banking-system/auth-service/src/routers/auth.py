from fastapi import APIRouter, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse

from src.models.schemas import LoginRequest, RefreshRequest, TokenResponse, VerifyResponse
from src.services import auth_service

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, body: LoginRequest) -> TokenResponse:
    try:
        token_response = await auth_service.login(body)
    except ValueError:
        client_ip = request.client.host if request.client else "unknown"
        # Attempt audit even if user not found (no user_id available for failed attempts)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token_response


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest) -> TokenResponse:
    try:
        token_response = await auth_service.refresh_tokens(body.refresh_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token_response


@router.post("/logout")
async def logout(
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.removeprefix("Bearer ")

    from src.core.security import decode_token
    from jose import JWTError

    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub", "")
    await auth_service.logout(token, user_id)
    return JSONResponse(content={"message": "logged out"})


@router.get("/verify", response_model=VerifyResponse)
async def verify(
    authorization: str | None = Header(default=None),
) -> VerifyResponse:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.removeprefix("Bearer ")
    result = await auth_service.verify_token(token)
    return result
