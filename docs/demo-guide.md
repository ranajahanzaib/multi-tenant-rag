# Demo guide

1. Run `make init-env` to generate private local credentials, then start Docker.
2. Run `make up`, then `make seed`.
3. Open `http://localhost:5173` and use `admin@northstar.example` with the generated `DEMO_PASSWORD` from `.env`.
4. Ask: “Which leases expire within the next 60 days and need renewal notices?” The seeded Northstar lease is expiring in 42 days and has a 60-day notice period.
5. Open Leases → Add lease and create a record for a property unit. The API validates the organization role and PostgreSQL checks that the selected unit belongs to a property in the active organization.
6. Upload a text, Markdown, or extractable PDF file. The worker displays its processing status and indexes chunks for authorized retrieval.
7. Sign in separately as `admin@summit.example` to see a second organization. Use `make eval` to confirm the seeded answer, unsupported-question refusal, and cross-tenant API denial.
8. Run `make test-security` after seeding to check the PostgreSQL runtime role, connection reuse, and tenant-aware foreign-key boundary.

The assistant is evidence-only and only supports the lease-renewal question family. It does not interpret legal terms or make tenant-wide business conclusions from document existence.
