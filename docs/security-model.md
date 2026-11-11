# Security model

## Identity and organization context

Authentication uses Argon2 password hashes and short-lived HS256 JWTs in HTTP-only, SameSite=Lax cookies. Each request validates the issuer, audience, expiry, auth version, and active database user. Logout increments the user's auth version, invalidating issued tokens. The API reads current membership and role on each protected request, so membership removal and role changes do not wait for token expiry. JWT role claims are not used. Login failures are rate-limited by client IP in the API process; this limit is not distributed across multiple API replicas. The organization header selects an organization but does not grant access.

For public requests the API validates current membership and role, then sets transaction-local `app.tenant_id`, `app.user_id`, and `app.role` values. The request transaction checks membership again before querying protected rows; assistant responses make a final membership and source check before return. The internal ingestion worker and guarded local seed path use a separate trusted service context. Tenant rows use `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`; missing context evaluates to no matching rows. Composite foreign keys prevent cross-tenant property/unit/document links.

## Database roles

- `tenantground_migrator` owns the schema and applies Alembic migrations. It must remain separate from API credentials.
- `tenantground` is the request runtime role. It is not a superuser, table owner, or `BYPASSRLS` role.
- `tenantground_worker` is the background process role and uses tenant-scoped queue claims.

`make init-env` generates separate random passwords for the local database roles. The generated values are stored in the ignored `.env` file. Production deployments must inject unique database credentials through a secret manager.

## Document access

The current SQL read policy grants administrators organization-wide access, permits organization-visible documents, and permits restricted documents to their uploader or a current explicit user/role grant. A current explicit deny overrides uploader/grant access for nonadministrators. Deleted documents are excluded. Chunks, versions, and jobs have restrictive policies that require a currently readable parent document. Grant changes are visible on the next query.

Administrator endpoints and document controls can create and revoke user or role grants; individual grants require the active organization member's UUID. Soft deletion is available and immediately makes a document unreadable to subsequent reads. An already-running request that has loaded source text may finish with its in-memory result. The application does not include physical storage or derived-data purging, and its negative integration coverage is limited.

## Citation behavior

The assistant only creates citations from database rows returned in the current authorized retrieval transaction. Download endpoints resolve a document ID under current RLS on every request and return 404 for inaccessible IDs. Search result excerpts are not durable access tokens.

## Assumptions and residual risks

The API process is trusted to set GUC context correctly. PostgreSQL custom settings are not cryptographically protected from a compromised application credential. Database administrators and migration credentials can access all tenant data. The current demo has no distributed login throttling, CSRF token, malware scanner, immutable audit guarantee, cache layer, or remote LLM. Do not expose it to untrusted production traffic without implementing and reviewing those controls.
