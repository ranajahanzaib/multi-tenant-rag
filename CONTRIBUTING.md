# Contributing

Thanks for helping improve Multi-Tenant RAG. Contributions that make authorization behavior easier to understand and independently verify are especially useful.

## Local development

1. Install Docker Compose, Python 3.12+, `uv`, Node.js 20+, and pnpm.
2. Run `make init-env` to create a private `.env` with fresh local credentials.
3. Start and seed the demo with `make up` and `make seed`.
4. Install the Python development dependencies with `uv sync --extra dev` and frontend dependencies with `cd apps/web && pnpm install`.
5. Run `make lint`, `make typecheck`, and `make test`. Run `make test-security` against a migrated, seeded PostgreSQL instance using the runtime role.
6. For browser checks, run `cd apps/web && pnpm exec playwright install chromium`, then `make test-e2e`.

## Change guidelines

- Preserve tenant and document authorization in SQL as well as API checks.
- Add PostgreSQL runtime-role integration coverage for authorization changes.
- Never use the migration role as evidence that RLS protects a request.
- Keep demo data fictional and evaluation reports reproducible.
- Update the architecture/security docs when trust boundaries change.
- Do not include credentials, customer records, local model caches, or generated private files.

Open a focused pull request with the reason for the change, tests run, and any remaining verification gap. See [SECURITY.md](SECURITY.md) for vulnerability reports and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations.
