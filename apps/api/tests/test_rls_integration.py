"""Run against a seeded database using the non-owner tenantground runtime role."""

import os
from datetime import date, timedelta

import pytest
from multi_tenant_rag.seed import (
    NORTHSTAR_PROPERTY_ID,
    ORG_ID,
    OTHER_ORG_ID,
    OTHER_USER_ID,
    SUMMIT_PROPERTY_ID,
    SUMMIT_UNIT_ID,
    USER_ID,
)
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


@pytest.mark.asyncio
async def test_rls_isolation_context_reuse_and_tenant_aware_foreign_keys() -> None:
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to a migrated, seeded PostgreSQL runtime-role database")
    engine = create_async_engine(url, pool_size=1, max_overflow=0)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with sessions() as session:
            async with session.begin():
                runtime = (
                    await session.execute(
                        text("""SELECT r.rolsuper,r.rolbypassrls,c.relowner=r.oid AS owns_table,
                          c.relrowsecurity,c.relforcerowsecurity
                          FROM pg_roles r JOIN pg_class c ON c.relname='properties'
                            AND c.relnamespace='public'::regnamespace AND c.relkind='r'
                          WHERE r.rolname=current_user""")
                    )
                ).one()
                assert runtime == (False, False, False, True, True)
                await session.execute(
                    text(
                        "SELECT set_config('app.tenant_id',:id,true),set_config('app.user_id',:user,true)"
                    ),
                    {"id": str(ORG_ID), "user": str(USER_ID)},
                )
                northstar = (
                    (
                        await session.execute(
                            text("SELECT id FROM properties WHERE id=:id"),
                            {"id": NORTHSTAR_PROPERTY_ID},
                        )
                    )
                    .scalars()
                    .all()
                )
                assert northstar == [NORTHSTAR_PROPERTY_ID]
                await session.execute(
                    text(
                        "SELECT set_config('app.tenant_id',:id,true),set_config('app.user_id',:user,true)"
                    ),
                    {"id": str(OTHER_ORG_ID), "user": str(OTHER_USER_ID)},
                )
                leaked = (
                    (
                        await session.execute(
                            text("SELECT id FROM properties WHERE id=:id"),
                            {"id": NORTHSTAR_PROPERTY_ID},
                        )
                    )
                    .scalars()
                    .all()
                )
                summit = (
                    (
                        await session.execute(
                            text("SELECT id FROM properties WHERE id=:id"),
                            {"id": SUMMIT_PROPERTY_ID},
                        )
                    )
                    .scalars()
                    .all()
                )
                assert leaked == []
                assert summit == [SUMMIT_PROPERTY_ID]

        # Reuse the one pooled connection after commit; transaction-local identity must be gone.
        async with sessions() as session:
            async with session.begin():
                visible = (await session.execute(text("SELECT id FROM properties"))).scalars().all()
                assert visible == []

        # A corrupted tenant_id/property/unit combination must fail at the composite FK boundary.
        async with sessions() as session:
            async with session.begin():
                await session.execute(
                    text(
                        "SELECT set_config('app.tenant_id',:id,true),set_config('app.user_id',:user,true)"
                    ),
                    {"id": str(ORG_ID), "user": str(USER_ID)},
                )
                with pytest.raises(IntegrityError):
                    async with session.begin_nested():
                        await session.execute(
                            text("""INSERT INTO leases(tenant_id,property_id,unit_id,reference,tenant_name,starts_on,expires_on)
                              VALUES(:tenant,:property,:foreign_unit,'INVALID-LINK','Example',:starts,:expires)"""),
                            {
                                "tenant": ORG_ID,
                                "property": NORTHSTAR_PROPERTY_ID,
                                "foreign_unit": SUMMIT_UNIT_ID,
                                "starts": date.today(),
                                "expires": date.today() + timedelta(days=30),
                            },
                        )
    finally:
        await engine.dispose()
