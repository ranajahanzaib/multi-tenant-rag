# Deployment notes

Docker Compose is a local development setup. Before production deployment, configure TLS termination, managed secrets, unique database credentials, restricted network access, database backups and restore drills, storage encryption and lifecycle cleanup, worker resource limits, monitoring, alerting, migration rollback plans, and tested incident response.

Use non-superuser runtime roles that do not own tenant tables and cannot bypass RLS. Keep migration credentials out of the API and worker containers. Inject unique JWT and database credentials from a secret manager. Restrict CORS to explicit trusted origins and use a CSRF token if cookie-authenticated cross-origin requests are introduced.

Persistent document storage needs a private object-store implementation and an explicit deletion retention policy before horizontal scaling. The current local volume is single-host only. Embedding model versions and dimensions must remain consistent; a model change requires reindexing rather than silently mixing vectors.
