"""Seed deterministic local-only demo data."""

import asyncio
import hashlib
import os
from datetime import date, timedelta
from pathlib import Path
from uuid import NAMESPACE_DNS, UUID, uuid5

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from multi_tenant_rag.config import settings
from multi_tenant_rag.db import engine, tenant_transaction
from multi_tenant_rag.security import hash_password

load_dotenv()
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD")
ORG_ID = uuid5(NAMESPACE_DNS, "tenantground.example:northstar")
USER_ID = uuid5(NAMESPACE_DNS, "tenantground.example:admin")
OTHER_ORG_ID = uuid5(NAMESPACE_DNS, "tenantground.example:summit")
OTHER_USER_ID = uuid5(NAMESPACE_DNS, "tenantground.example:summit-admin")
SHARED_USER_ID = uuid5(NAMESPACE_DNS, "tenantground.example:regional-operator")
NORTHSTAR_PROPERTY_ID = uuid5(NAMESPACE_DNS, "tenantground.example:northstar:prop")
NORTHSTAR_SECONDARY_PROPERTY_ID = uuid5(
    NAMESPACE_DNS, "tenantground.example:northstar:prop:secondary"
)
NORTHSTAR_UNIT_ID = uuid5(NAMESPACE_DNS, "tenantground.example:northstar:unit")
SUMMIT_PROPERTY_ID = uuid5(NAMESPACE_DNS, "tenantground.example:summit:property")
SUMMIT_SECONDARY_PROPERTY_ID = uuid5(
    NAMESPACE_DNS, "tenantground.example:summit:property:secondary"
)
SUMMIT_UNIT_ID = uuid5(NAMESPACE_DNS, "tenantground.example:summit:unit")
HARBOR_DELETED_DOC_ID = uuid5(
    NAMESPACE_DNS, "tenantground.example:document:harbor_deleted_archive.md"
)
HARBOR_GRANTED_DOC_ID = uuid5(NAMESPACE_DNS, "tenantground.example:document:harbor_inspection.md")
CEDAR_REVOKED_DOC_ID = uuid5(NAMESPACE_DNS, "tenantground.example:document:cedar_financial.md")

HARBOR_DOCS = (
    "harbor_residential_lease.md",
    "harbor_renewal_policy.md",
    "harbor_lease_addendum.md",
    "harbor_building_handbook.md",
    "harbor_inspection.md",
    "harbor_prompt_injection.md",
    "harbor_deleted_archive.md",
)
CEDAR_DOCS = (
    "cedar_commercial_lease.md",
    "cedar_water_report.md",
    "cedar_maintenance_policy.md",
    "cedar_financial.md",
    "cedar_internal_memo.md",
    "cedar_policy_conflict.md",
)


async def seed_documents(
    tx: AsyncSession, tenant_id: UUID, owner_id: UUID, filenames: tuple[str, ...]
) -> None:
    fixture_dir = Path(__file__).resolve().parents[3] / "fixtures" / "documents"
    for filename in filenames:
        source = fixture_dir / filename
        content = source.read_bytes()
        document_id = uuid5(NAMESPACE_DNS, f"tenantground.example:document:{filename}")
        checksum = hashlib.sha256(content).hexdigest()
        storage_key = f"{tenant_id}/{document_id}.md"
        stored_path = Path(settings.storage_path) / storage_key
        stored_path.parent.mkdir(parents=True, exist_ok=True)
        stored_path.write_bytes(content)
        visibility = (
            "restricted" if filename in {"harbor_inspection.md", "cedar_financial.md"} else "tenant"
        )
        deleted_at_val = "now()" if filename == "harbor_deleted_archive.md" else "NULL"
        processing_status_val = "failed" if filename == "harbor_deleted_archive.md" else "queued"
        await tx.execute(
            text(f"""INSERT INTO documents(id,tenant_id,uploaded_by,title,original_filename,content_type,
              storage_key,visibility,processing_status,current_version,checksum,deleted_at)
              VALUES(:id,:tenant,:owner,:title,:filename,'text/markdown',:key,:visibility,'{processing_status_val}',1,:checksum,{deleted_at_val})
              ON CONFLICT(id) DO NOTHING"""),
            {
                "id": document_id,
                "tenant": tenant_id,
                "owner": owner_id,
                "title": source.stem.replace("_", " ").title(),
                "filename": filename,
                "key": storage_key,
                "visibility": visibility,
                "checksum": checksum,
            },
        )
        version_id = uuid5(document_id, "version:1")
        version_status = "failed" if filename == "harbor_deleted_archive.md" else "queued"
        await tx.execute(
            text(f"""INSERT INTO document_versions(id,tenant_id,document_id,version_number,checksum,storage_key,processing_status)
              VALUES(:id,:tenant,:document,1,:checksum,:key,'{version_status}') ON CONFLICT(document_id,version_number) DO NOTHING"""),
            {
                "id": version_id,
                "tenant": tenant_id,
                "document": document_id,
                "checksum": checksum,
                "key": storage_key,
            },
        )
        job_status = "failed" if filename == "harbor_deleted_archive.md" else "queued"
        job_error = "'document_deleted'" if filename == "harbor_deleted_archive.md" else "NULL"
        await tx.execute(
            text(f"""INSERT INTO ingestion_jobs(tenant_id,document_id,document_version_id,status,error_code)
              VALUES(:tenant,:document,:version,'{job_status}',{job_error}) ON CONFLICT(document_version_id) DO NOTHING"""),
            {"tenant": tenant_id, "document": document_id, "version": version_id},
        )
        if filename == "harbor_inspection.md":
            principal_type, principal_id, effect = "role", "manager", "allow"
        elif filename == "cedar_financial.md":
            principal_type, principal_id, effect = "user", str(SHARED_USER_ID), "allow"
        else:
            continue
        await tx.execute(
            text("""INSERT INTO document_grants(tenant_id,document_id,principal_type,principal_id,permission,effect,revoked_at)
              SELECT :tenant,:document,:type,:principal,'read',:effect,
                CASE WHEN :effect='allow' AND :type='user' THEN now() ELSE NULL END
              WHERE NOT EXISTS (SELECT 1 FROM document_grants WHERE document_id=:document
                AND principal_type=:type AND principal_id=:principal AND permission='read' AND effect=:effect)"""),
            {
                "tenant": tenant_id,
                "document": document_id,
                "type": principal_type,
                "principal": principal_id,
                "effect": effect,
            },
        )


async def seed() -> None:
    if settings.app_env == "production" or os.getenv("DEMO_MODE", "true").lower() != "true":
        raise RuntimeError("Demo seed is disabled outside explicit non-production DEMO_MODE")
    if not DEMO_PASSWORD:
        raise RuntimeError("Set DEMO_PASSWORD to a private local password before seeding")
    seed_engine = create_async_engine(settings.migration_database_url)
    seed_session = async_sessionmaker(seed_engine, expire_on_commit=False)
    async with seed_session() as session:
        for tenant_id, name, slug in (
            (ORG_ID, "Harbor Property Group", "northstar"),
            (OTHER_ORG_ID, "Cedar Estates", "summit"),
        ):
            await session.execute(
                text(
                    "INSERT INTO tenants(id,name,slug) VALUES(:id,:name,:slug) ON CONFLICT(slug) DO NOTHING"
                ),
                {"id": tenant_id, "name": name, "slug": slug},
            )
        for user_id, email, name in (
            (USER_ID, "admin@northstar.example", "Morgan Lee"),
            (OTHER_USER_ID, "admin@summit.example", "Taylor Kim"),
            (SHARED_USER_ID, "regional@tenantground.example", "Casey Jordan"),
        ):
            await session.execute(
                text("SELECT set_config('app.user_id',:user,false)"), {"user": str(user_id)}
            )
            await session.execute(
                text("""INSERT INTO users(id,email,name,password_hash)
                  VALUES(:id,:email,:name,:hash) ON CONFLICT(email) DO NOTHING"""),
                {"id": user_id, "email": email, "name": name, "hash": hash_password(DEMO_PASSWORD)},
            )
        await session.commit()
    await seed_engine.dispose()

    async with tenant_transaction(ORG_ID, USER_ID, "admin", validate_membership=False) as tx:
        await tx.execute(
            text(
                "INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(:tenant,:user,'admin','active') ON CONFLICT(tenant_id,user_id) DO UPDATE SET status='active',role='admin'"
            ),
            {"tenant": ORG_ID, "user": USER_ID},
        )
        await tx.execute(
            text("""INSERT INTO memberships(tenant_id,user_id,role,status)
              VALUES(:tenant,:user,'manager','active') ON CONFLICT(tenant_id,user_id)
              DO UPDATE SET status='active',role='manager'"""),
            {"tenant": ORG_ID, "user": SHARED_USER_ID},
        )
        await seed_documents(tx, ORG_ID, USER_ID, HARBOR_DOCS)
        await tx.execute(
            text(
                "INSERT INTO properties(id,tenant_id,name,address,timezone) VALUES(:id,:tenant,'Cedar Court','18 Willow Road','Asia/Karachi') ON CONFLICT(id) DO NOTHING"
            ),
            {"id": NORTHSTAR_PROPERTY_ID, "tenant": ORG_ID},
        )
        await tx.execute(
            text("""INSERT INTO properties(id,tenant_id,name,address,timezone)
              VALUES(:id,:tenant,'Harbor View Apartments','25 Bay Street','Asia/Karachi')
              ON CONFLICT(id) DO NOTHING"""),
            {"id": NORTHSTAR_SECONDARY_PROPERTY_ID, "tenant": ORG_ID},
        )
        await tx.execute(
            text(
                "INSERT INTO units(id,tenant_id,property_id,unit_number) VALUES(:id,:tenant,:property,'4B') ON CONFLICT(id) DO NOTHING"
            ),
            {"id": NORTHSTAR_UNIT_ID, "tenant": ORG_ID, "property": NORTHSTAR_PROPERTY_ID},
        )
        demo_today = settings.demo_date or date.today()
        expires = demo_today + timedelta(days=42)
        await tx.execute(
            text("""INSERT INTO leases(tenant_id,property_id,unit_id,reference,tenant_name,starts_on,expires_on,renewal_notice_required,renewal_notice_days)
              VALUES(:tenant,:property,:unit,'NC-2048','Alex Morgan',:starts,:expires,true,60)
              ON CONFLICT(tenant_id,reference) DO UPDATE SET starts_on=excluded.starts_on,expires_on=excluded.expires_on,
                renewal_notice_required=excluded.renewal_notice_required,renewal_notice_days=excluded.renewal_notice_days"""),
            {
                "tenant": ORG_ID,
                "property": NORTHSTAR_PROPERTY_ID,
                "unit": NORTHSTAR_UNIT_ID,
                "starts": expires - timedelta(days=365),
                "expires": expires,
            },
        )
        for index, (offset, required, notice_days) in enumerate(
            ((10, True, 30), (30, True, 60), (45, None, None), (60, True, 45), (-5, False, 0)),
            start=2,
        ):
            unit_id = uuid5(NAMESPACE_DNS, f"tenantground.example:northstar:unit:{index}")
            lease_expires = demo_today + timedelta(days=offset)
            await tx.execute(
                text("""INSERT INTO units(id,tenant_id,property_id,unit_number)
                  VALUES(:id,:tenant,:property,:number) ON CONFLICT(id) DO NOTHING"""),
                {
                    "id": unit_id,
                    "tenant": ORG_ID,
                    "property": NORTHSTAR_PROPERTY_ID,
                    "number": f"{index}A",
                },
            )
            await tx.execute(
                text("""INSERT INTO leases(tenant_id,property_id,unit_id,reference,tenant_name,starts_on,expires_on,renewal_notice_required,renewal_notice_days)
                  VALUES(:tenant,:property,:unit,:reference,:name,:starts,:expires,:required,:days)
                  ON CONFLICT(tenant_id,reference) DO UPDATE SET unit_id=excluded.unit_id,starts_on=excluded.starts_on,
                    expires_on=excluded.expires_on,renewal_notice_required=excluded.renewal_notice_required,
                    renewal_notice_days=excluded.renewal_notice_days"""),
                {
                    "tenant": ORG_ID,
                    "property": NORTHSTAR_PROPERTY_ID,
                    "unit": unit_id,
                    "reference": f"NC-20{index}0",
                    "name": f"Resident {index} Example",
                    "starts": lease_expires - timedelta(days=365),
                    "expires": lease_expires,
                    "required": required,
                    "days": notice_days,
                },
            )

    async with tenant_transaction(
        OTHER_ORG_ID, OTHER_USER_ID, "admin", validate_membership=False
    ) as tx:
        await tx.execute(
            text(
                "INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(:tenant,:user,'admin','active') ON CONFLICT(tenant_id,user_id) DO UPDATE SET status='active',role='admin'"
            ),
            {"tenant": OTHER_ORG_ID, "user": OTHER_USER_ID},
        )
        await tx.execute(
            text("""INSERT INTO memberships(tenant_id,user_id,role,status)
              VALUES(:tenant,:user,'viewer','active') ON CONFLICT(tenant_id,user_id)
              DO UPDATE SET status='active',role='viewer'"""),
            {"tenant": OTHER_ORG_ID, "user": SHARED_USER_ID},
        )
        await seed_documents(tx, OTHER_ORG_ID, OTHER_USER_ID, CEDAR_DOCS)
        await tx.execute(
            text(
                "INSERT INTO properties(id,tenant_id,name,address,timezone) VALUES(:id,:tenant,'Summit House','77 Harbor Lane','Asia/Karachi') ON CONFLICT(id) DO NOTHING"
            ),
            {"id": SUMMIT_PROPERTY_ID, "tenant": OTHER_ORG_ID},
        )
        await tx.execute(
            text("""INSERT INTO properties(id,tenant_id,name,address,timezone)
              VALUES(:id,:tenant,'Maple Junction','6 Orchard Avenue','Asia/Karachi')
              ON CONFLICT(id) DO NOTHING"""),
            {"id": SUMMIT_SECONDARY_PROPERTY_ID, "tenant": OTHER_ORG_ID},
        )
        await tx.execute(
            text(
                "INSERT INTO units(id,tenant_id,property_id,unit_number) VALUES(:id,:tenant,:property,'9C') ON CONFLICT(id) DO NOTHING"
            ),
            {"id": SUMMIT_UNIT_ID, "tenant": OTHER_ORG_ID, "property": SUMMIT_PROPERTY_ID},
        )
        demo_today = settings.demo_date or date.today()
        expires = demo_today + timedelta(days=34)
        await tx.execute(
            text("""INSERT INTO leases(tenant_id,property_id,unit_id,reference,tenant_name,starts_on,expires_on,renewal_notice_required,renewal_notice_days)
              VALUES(:tenant,:property,:unit,'SP-731','Jamie Rivera',:starts,:expires,true,30)
              ON CONFLICT(tenant_id,reference) DO UPDATE SET starts_on=excluded.starts_on,expires_on=excluded.expires_on,
                renewal_notice_required=excluded.renewal_notice_required,renewal_notice_days=excluded.renewal_notice_days"""),
            {
                "tenant": OTHER_ORG_ID,
                "property": SUMMIT_PROPERTY_ID,
                "unit": SUMMIT_UNIT_ID,
                "starts": expires - timedelta(days=365),
                "expires": expires,
            },
        )
        for index, (offset, required, notice_days) in enumerate(
            ((10, True, 30), (30, True, 60), (45, False, 0), (60, True, 45), (90, True, 60)),
            start=2,
        ):
            unit_id = uuid5(NAMESPACE_DNS, f"tenantground.example:summit:unit:{index}")
            lease_expires = demo_today + timedelta(days=offset)
            await tx.execute(
                text("""INSERT INTO units(id,tenant_id,property_id,unit_number)
                  VALUES(:id,:tenant,:property,:number) ON CONFLICT(id) DO NOTHING"""),
                {
                    "id": unit_id,
                    "tenant": OTHER_ORG_ID,
                    "property": SUMMIT_PROPERTY_ID,
                    "number": f"{index}C",
                },
            )
            await tx.execute(
                text("""INSERT INTO leases(tenant_id,property_id,unit_id,reference,tenant_name,starts_on,expires_on,renewal_notice_required,renewal_notice_days)
                  VALUES(:tenant,:property,:unit,:reference,:name,:starts,:expires,:required,:days)
                  ON CONFLICT(tenant_id,reference) DO UPDATE SET unit_id=excluded.unit_id,starts_on=excluded.starts_on,
                    expires_on=excluded.expires_on,renewal_notice_required=excluded.renewal_notice_required,
                    renewal_notice_days=excluded.renewal_notice_days"""),
                {
                    "tenant": OTHER_ORG_ID,
                    "property": SUMMIT_PROPERTY_ID,
                    "unit": unit_id,
                    "reference": f"SP-7{index}1",
                    "name": f"Resident {index} Sample",
                    "starts": lease_expires - timedelta(days=365),
                    "expires": lease_expires,
                    "required": required,
                    "days": notice_days,
                },
            )


if __name__ == "__main__":
    asyncio.run(seed())
    asyncio.run(engine.dispose())
