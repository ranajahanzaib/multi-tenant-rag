.PHONY: init-env up down logs migrate seed reset-demo lint typecheck test test-integration test-security test-e2e eval

init-env:
	python3 scripts/init_env.py

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

migrate:
	docker compose exec api alembic upgrade head

seed:
	docker compose exec api python -m multi_tenant_rag.seed

reset-demo:
	docker compose down -v
	docker compose up --build -d
	docker compose exec api python -m multi_tenant_rag.seed

lint:
	uv run --locked --extra dev ruff format --check apps/api scripts
	uv run --locked --extra dev ruff check apps/api scripts

typecheck:
	uv run --locked --extra dev mypy apps/api/multi_tenant_rag scripts/evaluate.py
	cd apps/web && pnpm run typecheck

test:
	set -a; . ./.env; set +a; uv run --locked --extra dev pytest -q

test-integration:
	set -a; . ./.env; set +a; TEST_DATABASE_URL="postgresql+asyncpg://tenantground:$$RUNTIME_PASSWORD@localhost:5432/multi_tenant_rag" uv run --locked --extra dev pytest -q apps/api/tests/test_rls_integration.py

test-security: test-integration

test-e2e:
	set -a; . ./.env; set +a; cd apps/web && pnpm run test:e2e

eval:
	uv run python scripts/evaluate.py
