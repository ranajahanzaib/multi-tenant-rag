#!/bin/sh
set -eu

: "${MIGRATOR_PASSWORD:?MIGRATOR_PASSWORD is required}"
: "${RUNTIME_PASSWORD:?RUNTIME_PASSWORD is required}"
: "${WORKER_PASSWORD:?WORKER_PASSWORD is required}"

psql --set=ON_ERROR_STOP=1 \
  --set=migrator_password="$MIGRATOR_PASSWORD" \
  --set=runtime_password="$RUNTIME_PASSWORD" \
  --set=worker_password="$WORKER_PASSWORD" <<'SQL'
CREATE ROLE tenantground_migrator LOGIN PASSWORD :'migrator_password' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE tenantground LOGIN PASSWORD :'runtime_password' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE tenantground_worker LOGIN PASSWORD :'worker_password' NOSUPERUSER NOBYPASSRLS;
GRANT tenantground TO tenantground_migrator;
GRANT tenantground_worker TO tenantground_migrator;
ALTER DATABASE multi_tenant_rag OWNER TO tenantground_migrator;
SQL
