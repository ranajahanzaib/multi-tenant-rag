# Threat model

## Assets and trust boundaries

Assets include tenant records, lease details, uploaded files, extracted text, embeddings, citations, login credentials, and organization membership state. Trust boundaries are the browser/API boundary, API/database boundary, worker/database boundary, and private-volume boundary.

## Mitigations present in this slice

- **Cross-tenant caller:** current membership validation plus forced row-level policies and tenant-aware foreign keys.
- **Stale role or removed membership:** protected requests re-read current membership rather than trusting role claims in the token.
- **Copied session after logout:** logout increments the account auth version, making previously issued tokens fail the next request.
- **Revocation during an in-flight answer:** new reads recheck current document access, but an answer that already loaded evidence may complete with that in-memory evidence.
- **Unauthorized document reader:** document reads and derived chunks check current document policy in PostgreSQL.
- **Connection reuse:** identity settings are transaction-local and scoped work uses a separate transaction.
- **Unsafe file path:** generated storage keys use UUIDs and tenant IDs; caller filename is metadata only.
- **Prompt injection:** no free-form LLM is enabled; document passages are returned as evidence and are not executable instructions.
- **Malformed/unsupported uploads:** size and basic type checks exist; unsupported types are rejected.

## Accepted limitations

- A compromised API or migration process can access or forge application context.
- A database administrator can read all tenant data.
- There is no malware scanning, OCR, robust content-type parser, encryption-at-rest key management, or verified physical purge workflow.
- Login rate limiting is in-process and per-IP, so it does not coordinate multiple API replicas or survive a restart.
- The adversarial suite does not cover every API surface; the existing RLS test is a smoke test, not proof of the whole application.
- Citation excerpts may contain sensitive data for an authorized user and must be handled as private information.

## Security review status

The migration and policy definitions have not been applied to a live PostgreSQL instance in this environment because Docker is unavailable. Treat database security as implemented in source but unverified until the integration suite passes against the runtime role.
