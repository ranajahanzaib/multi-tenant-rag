"""Create a private local .env with fresh random development credentials."""

import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
TEMPLATE = ROOT / ".env.example"


def main() -> None:
    if ENV_FILE.exists():
        raise SystemExit(
            ".env already exists; remove it explicitly before generating new credentials"
        )

    credentials = {
        name: secrets.token_hex(32)
        for name in (
            "POSTGRES_PASSWORD",
            "MIGRATOR_PASSWORD",
            "RUNTIME_PASSWORD",
            "WORKER_PASSWORD",
            "JWT_SECRET",
            "DEMO_PASSWORD",
        )
    }
    credentials.update(
        {
            "DATABASE_URL": f"postgresql+asyncpg://tenantground:{credentials['RUNTIME_PASSWORD']}@localhost:5432/multi_tenant_rag",
            "MIGRATION_DATABASE_URL": f"postgresql+asyncpg://tenantground_migrator:{credentials['MIGRATOR_PASSWORD']}@localhost:5432/multi_tenant_rag",
        }
    )
    lines = []
    for line in TEMPLATE.read_text(encoding="utf-8").splitlines():
        key, separator, _ = line.partition("=")
        if separator and key in credentials:
            line = f"{key}={credentials[key]}"
        lines.append(line)
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    ENV_FILE.chmod(0o600)
    print("Created .env with fresh local credentials. Keep it private; it is excluded from Git.")


if __name__ == "__main__":
    main()
