from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from fastapi import HTTPException, Request
from pwdlib import PasswordHash
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from multi_tenant_rag.config import settings

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def issue_token(user_id: UUID, auth_version: int) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": str(user_id),
            "ver": auth_version,
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "iat": now,
            "exp": now + timedelta(minutes=settings.token_minutes),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


async def current_user(request: Request, session: AsyncSession) -> dict[str, str]:
    token = request.cookies.get("tenantground_session")
    if not token:
        raise HTTPException(401, "Authentication required")
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
        user_id = UUID(claims["sub"])
    except (jwt.PyJWTError, ValueError, KeyError) as exc:
        raise HTTPException(401, "Invalid or expired session") from exc
    await session.execute(text("SELECT set_config('app.user_id', :id, true)"), {"id": str(user_id)})
    row = (
        (
            await session.execute(
                text("SELECT id, email, name, auth_version FROM users WHERE id=:id AND is_active"),
                {"id": user_id},
            )
        )
        .mappings()
        .one_or_none()
    )
    if row is None or claims.get("ver") != row["auth_version"]:
        raise HTTPException(401, "Account is inactive")
    return {key: str(row[key]) for key in ("id", "email", "name")}


async def active_membership(session: AsyncSession, user_id: UUID, tenant_id: UUID) -> str:
    result = await session.execute(
        text("""SELECT role FROM memberships WHERE user_id=:user AND tenant_id=:tenant
      AND status='active'"""),
        {"user": user_id, "tenant": tenant_id},
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(403, "Active organization membership required")
    return str(role)
