from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from multi_tenant_rag.config import settings

engine = create_async_engine(
    settings.database_url, pool_pre_ping=True, pool_size=10, max_overflow=10
)
Session = async_sessionmaker(engine, expire_on_commit=False)


@asynccontextmanager
async def tenant_transaction(
    tenant_id: UUID, user_id: UUID, role: str, *, validate_membership: bool = True
) -> AsyncIterator[AsyncSession]:
    """Set transaction-local identity. Context is discarded on commit/rollback before reuse."""
    async with Session() as session:
        async with session.begin():
            await session.execute(
                text(
                    "SELECT set_config('app.tenant_id', :tenant, true), set_config('app.user_id', :user, true), set_config('app.role', :role, true), set_config('app.demo_date', :demo_date, true)"
                ),
                {
                    "tenant": str(tenant_id),
                    "user": str(user_id),
                    "role": role,
                    "demo_date": settings.demo_date.isoformat() if settings.demo_date else "",
                },
            )
            if validate_membership:
                membership = await session.execute(
                    text("""SELECT role FROM memberships WHERE tenant_id=:tenant AND user_id=:user
                      AND status='active'"""),
                    {"tenant": tenant_id, "user": user_id},
                )
                current_role = membership.scalar_one_or_none()
                if current_role is None or current_role != role:
                    raise HTTPException(403, "Organization membership changed; retry the request")
            yield session


async def get_session() -> AsyncIterator[AsyncSession]:
    async with Session() as session:
        yield session
