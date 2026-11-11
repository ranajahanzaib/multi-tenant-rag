"""PostgreSQL-backed ingestion worker. Run as `python -m multi_tenant_rag.worker`."""

import asyncio
import socket
from pathlib import Path
from typing import cast
from uuid import UUID

from sqlalchemy import text

from multi_tenant_rag.config import settings
from multi_tenant_rag.db import Session, engine, tenant_transaction


def extract(path: Path) -> list[tuple[int | None, str]]:
    if path.suffix.lower() == ".pdf":
        import fitz  # type: ignore[import-not-found]

        doc = fitz.open(path)
        return [
            (index + 1, page.get_text("text").strip())
            for index, page in enumerate(doc)
            if page.get_text("text").strip()
        ]
    return [(None, path.read_text(encoding="utf-8", errors="replace").strip())]


def chunks(
    pages: list[tuple[int | None, str]], size: int = 2400
) -> list[tuple[int | None, int, int, str]]:
    output = []
    offset = 0
    for page, text_value in pages:
        for start in range(0, len(text_value), size):
            value = text_value[start : start + size].strip()
            if value:
                output.append((page, offset + start, offset + start + len(value), value))
        offset += len(text_value)
    return output


async def embed(texts: list[str]) -> list[list[float]]:
    from sentence_transformers import SentenceTransformer  # type: ignore[import-not-found]

    model = SentenceTransformer(settings.embedding_model)
    vectors = await asyncio.to_thread(model.encode, texts, normalize_embeddings=True)
    return [[float(value) for value in vector] for vector in vectors.tolist()]


async def process_one(tenant_id: UUID, worker_id: str) -> bool:
    async with tenant_transaction(tenant_id, tenant_id, "admin", validate_membership=False) as tx:
        job = (
            (
                await tx.execute(
                    text("""WITH candidate AS (
          SELECT j.id FROM ingestion_jobs j JOIN documents d ON d.id=j.document_id
            JOIN document_versions v ON v.id=j.document_version_id AND v.document_id=d.id
          WHERE d.deleted_at IS NULL AND v.version_number=d.current_version AND
            ((j.status IN ('queued','retry') AND j.next_attempt_at <= now())
            OR (j.status='processing' AND j.locked_at < now() - interval '5 minutes'))
          ORDER BY j.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED)
          UPDATE ingestion_jobs j SET status='processing', locked_at=now(), locked_by=:worker,
            attempt_count=attempt_count+1, updated_at=now() FROM candidate c WHERE j.id=c.id
          RETURNING j.id,j.document_id,j.document_version_id,j.attempt_count"""),
                    {"worker": worker_id},
                )
            )
            .mappings()
            .one_or_none()
        )
        if job is None:
            return False
        doc = (
            (
                await tx.execute(
                    text("""SELECT v.storage_key,d.deleted_at FROM documents d
                      JOIN document_versions v ON v.document_id=d.id AND v.id=:version
                      WHERE d.id=:id"""),
                    {"id": job["document_id"], "version": job["document_version_id"]},
                )
            )
            .mappings()
            .one_or_none()
        )
        if doc is None or doc["deleted_at"] is not None:
            await tx.execute(
                text(
                    "UPDATE ingestion_jobs SET status='failed',error_code='document_unavailable' WHERE id=:id"
                ),
                {"id": job["id"]},
            )
            return True
        key = doc["storage_key"]
        document_id, version_id, job_id, attempt = (
            job["document_id"],
            job["document_version_id"],
            job["id"],
            job["attempt_count"],
        )
    try:
        path = Path(settings.storage_path) / key
        pages = extract(path)
        if not pages:
            async with tenant_transaction(
                tenant_id, tenant_id, "admin", validate_membership=False
            ) as tx:
                await tx.execute(
                    text("""UPDATE documents d SET processing_status='unsupported'
                      FROM document_versions v WHERE d.id=:id AND v.id=:version
                        AND v.document_id=d.id AND d.current_version=v.version_number"""),
                    {"id": document_id, "version": version_id},
                )
                await tx.execute(
                    text(
                        "UPDATE document_versions SET processing_status='unsupported' WHERE id=:id"
                    ),
                    {"id": version_id},
                )
                await tx.execute(
                    text(
                        "UPDATE ingestion_jobs SET status='failed',error_code='no_extractable_text' WHERE id=:id"
                    ),
                    {"id": job_id},
                )
            return True
        pieces = chunks(pages)
        async with tenant_transaction(
            tenant_id, tenant_id, "admin", validate_membership=False
        ) as tx:
            model_mismatch: bool = (
                await tx.execute(
                    text(
                        """SELECT EXISTS(SELECT 1 FROM document_chunks c JOIN documents d ON d.id=c.document_id
                          JOIN document_versions v ON v.id=c.document_version_id AND v.document_id=d.id
                          WHERE v.version_number=d.current_version AND c.embedding_model <> :model)"""
                    ),
                    {"model": settings.embedding_model},
                )
            ).scalar_one()
            if model_mismatch:
                await tx.execute(
                    text(
                        "UPDATE ingestion_jobs SET status='failed',error_code='embedding_model_mismatch' WHERE id=:id"
                    ),
                    {"id": job_id},
                )
                await tx.execute(
                    text("""UPDATE documents d SET processing_status='failed'
                      FROM document_versions v WHERE d.id=:id AND v.id=:version
                        AND v.document_id=d.id AND d.current_version=v.version_number"""),
                    {"id": document_id, "version": version_id},
                )
                await tx.execute(
                    text("UPDATE document_versions SET processing_status='failed' WHERE id=:id"),
                    {"id": version_id},
                )
                return True
        try:
            vectors = await embed([part[3] for part in pieces])
        except Exception as exc:
            # Keep documents searchable with PostgreSQL full-text when local model
            # weights are unavailable; embedding failures must not block indexing.
            vectors = None
            print(f"Embedding unavailable; indexing lexically ({type(exc).__name__})")
        async with tenant_transaction(
            tenant_id, tenant_id, "admin", validate_membership=False
        ) as tx:
            still_active = (
                await tx.execute(
                    text("""SELECT d.id FROM documents d JOIN document_versions v
                      ON v.document_id=d.id AND v.id=:version
                      WHERE d.id=:id AND d.deleted_at IS NULL AND d.current_version=v.version_number
                      FOR UPDATE OF d"""),
                    {"id": document_id, "version": version_id},
                )
            ).one_or_none()
            if still_active is None:
                await tx.execute(
                    text("""UPDATE ingestion_jobs SET status='failed',error_code='superseded',
                      locked_at=NULL,locked_by=NULL WHERE id=:id"""),
                    {"id": job_id},
                )
            else:
                await tx.execute(
                    text("DELETE FROM document_chunks WHERE document_version_id=:id"),
                    {"id": version_id},
                )
                for index, part in enumerate(pieces):
                    vector = vectors[index] if vectors is not None else None
                    await tx.execute(
                        text("""INSERT INTO document_chunks(tenant_id,document_id,document_version_id,chunk_index,content,page_number,source_start_offset,source_end_offset,token_count,embedding,embedding_model)
                      VALUES(:tenant,:doc,:version,:idx,:content,:page,:start,:end,:tokens,CAST(:embedding AS vector),:model)"""),
                        {
                            "tenant": tenant_id,
                            "doc": document_id,
                            "version": version_id,
                            "idx": index,
                            "content": part[3],
                            "page": part[0],
                            "start": part[1],
                            "end": part[2],
                            "tokens": max(1, len(part[3]) // 4),
                            "embedding": "[" + ",".join(map(str, vector)) + "]"
                            if vector is not None
                            else None,
                            "model": settings.embedding_model,
                        },
                    )
                await tx.execute(
                    text("UPDATE documents SET processing_status='ready' WHERE id=:id"),
                    {"id": document_id},
                )
                await tx.execute(
                    text("UPDATE document_versions SET processing_status='ready' WHERE id=:id"),
                    {"id": version_id},
                )
                await tx.execute(
                    text(
                        "UPDATE ingestion_jobs SET status='complete',locked_at=NULL,locked_by=NULL WHERE id=:id"
                    ),
                    {"id": job_id},
                )
        return True
    except Exception as exc:
        retry = attempt < 4
        async with tenant_transaction(
            tenant_id, tenant_id, "admin", validate_membership=False
        ) as tx:
            current_version = await tx.execute(
                text("""SELECT EXISTS(SELECT 1 FROM documents d JOIN document_versions v
                  ON v.document_id=d.id AND v.id=:version
                  WHERE d.id=:document AND d.deleted_at IS NULL
                    AND d.current_version=v.version_number)"""),
                {"document": document_id, "version": version_id},
            )
            is_current_version: bool = current_version.scalar_one()
            if not is_current_version:
                await tx.execute(
                    text("""UPDATE ingestion_jobs SET status='failed',error_code='superseded',
                      locked_at=NULL,locked_by=NULL WHERE id=:id"""),
                    {"id": job_id},
                )
            else:
                await tx.execute(
                    text(
                        "UPDATE ingestion_jobs SET status=:status,next_attempt_at=now() + (:delay * interval '1 minute'),locked_at=NULL,locked_by=NULL,error_code=:code WHERE id=:id"
                    ),
                    {
                        "status": "retry" if retry else "failed",
                        "delay": 2**attempt,
                        "code": "embedding_or_extraction_error",
                        "id": job_id,
                    },
                )
            if not retry and is_current_version:
                await tx.execute(
                    text("""UPDATE documents d SET processing_status='failed'
                      FROM document_versions v WHERE d.id=:id AND v.id=:version
                        AND v.document_id=d.id AND d.current_version=v.version_number"""),
                    {"id": document_id, "version": version_id},
                )
                await tx.execute(
                    text("UPDATE document_versions SET processing_status='failed' WHERE id=:id"),
                    {"id": version_id},
                )
        print(f"Ingestion job {job_id} failed ({type(exc).__name__})")
        return True


async def run() -> None:
    worker_id = f"{socket.gethostname()}:{id(asyncio.current_task())}"
    while True:
        # Tenant IDs are public organization identifiers; all queue reads remain tenant scoped.
        async with Session() as session:
            tenants = cast(
                list[UUID],
                (await session.execute(text("SELECT id FROM tenants ORDER BY id"))).scalars().all(),
            )
        did_work = False
        for tenant_id in tenants:
            if await process_one(tenant_id, worker_id):
                did_work = True
                break
        if not did_work:
            await asyncio.sleep(2)


if __name__ == "__main__":
    try:
        asyncio.run(run())
    finally:
        asyncio.run(engine.dispose())
