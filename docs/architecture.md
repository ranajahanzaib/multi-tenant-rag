# Architecture

## Components

- **React + Vite** provides the organization workspace and calls the JSON API with an HTTP-only session cookie.
- **FastAPI** owns authentication, membership validation, uploads, structured lease queries, and evidence-only response assembly.
- **PostgreSQL 16 + pgvector** stores identity, tenancy, business records, document metadata, full-text indexes, vectors, and durable worker jobs.
- **API runtime role** handles requests under forced RLS. **Worker role** processes ingestion work under a tenant transaction. **Migration role** owns the schema and is not used by API requests.
- **Private volume** stores uploads under generated tenant/document keys. The browser only receives authenticated download endpoints.

## Request lifecycle

1. The API verifies the signed token's algorithm, issuer, audience, expiry, and subject.
2. It reads the current active user and membership from PostgreSQL. JWT role claims are not used.
3. The selected organization identifier is treated as a selector only; current membership is required.
4. A new transaction sets `app.tenant_id`, `app.user_id`, and `app.role` with transaction-local settings.
5. SQL runs through the runtime role, which does not own tenant tables and cannot bypass RLS.
6. Commit or rollback clears transaction-local context before the pooled connection can serve another request.

## Ingestion flow

Upload validates size, extension, and basic file signature, stores the file privately, and commits document, version, and job rows. A worker atomically claims an eligible job with `FOR UPDATE SKIP LOCKED`, extracts PDF/TXT/Markdown text, splits it into bounded chunks, computes local 384-dimensional vectors, and writes chunks under the same tenant context. Jobs retry with bounded exponential delays. A document with no extractable text is marked unsupported.

## Retrieval flow

The current assistant supports the lease-renewal intent. It queries structured lease rows due in 60 days, then retrieves authorized chunks using PostgreSQL full-text ranking and, when local embeddings load, vector similarity. Reciprocal-rank fusion combines the two lists. RLS filters chunks and their parent documents before results are returned. The evidence-only response prints structured lease facts and document excerpts with source IDs.

This is not a general-purpose intent router, natural-language SQL system, or generated LLM answer. The supported intent is deliberately narrow.

## Local deployment

Docker Compose runs PostgreSQL, API, worker, and Vite. The database initializes separate login roles on an empty volume. Alembic runs as the schema migration role before API startup. The worker shares only the private file and embedding-cache volumes with the API process environment. Local Compose settings are for development, not a production deployment.
