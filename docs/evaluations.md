# Evaluations

No benchmark scores are published. The repository includes unit checks for chunk offsets, a PostgreSQL runtime-role RLS smoke test, and a three-case API smoke dataset covering the seeded lease answer, unsupported-question refusal, and cross-tenant request denial. The RLS test requires `TEST_DATABASE_URL` to point to a migrated and seeded database and is skipped otherwise. The API evaluation requires a running, migrated, seeded demo and writes `reports/evaluations/latest.json`.

```bash
make test
make test-integration
make eval
```

The Security Lab runs six database checks: runtime-role configuration, cross-tenant property denial, pooled-connection context reset, role-grant access, revoked user-grant denial, and soft-deleted document denial. This is a narrow smoke set, not a comprehensive adversarial suite. Three checks use seeded demo identities and run only for the seeded organizations. The smoke evaluation also checks the seeded lease answer/refusal, cross-tenant denial, and Security Lab results. Retrieval recall/precision datasets, broader answer-quality metrics, durable evaluation-run persistence, and an evaluation dashboard are outside the current implementation. Smoke results do not establish that every security acceptance condition has passed. Run these checks against a migrated PostgreSQL instance to verify database behavior.
