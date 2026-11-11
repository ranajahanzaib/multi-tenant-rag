from datetime import date

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_env: str = "development"
    database_url: str = "postgresql+asyncpg://tenantground@localhost:5432/multi_tenant_rag"
    migration_database_url: str = (
        "postgresql+asyncpg://tenantground_migrator@localhost:5432/multi_tenant_rag"
    )
    jwt_secret: str = ""
    jwt_issuer: str = "tenantground"
    jwt_audience: str = "multi-tenant-rag-web"
    token_minutes: int = 30
    storage_path: str = "./var/private"
    max_upload_bytes: int = 20_000_000
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_enabled: bool = True
    llm_provider: str = "evidence"
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    demo_date: date | None = None
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @model_validator(mode="after")
    def validate_production_secret(self) -> "Settings":
        if len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET must be a unique random value of at least 32 characters")
        if self.llm_provider not in {"evidence", "ollama"}:
            raise ValueError("LLM_PROVIDER must be 'evidence' or 'ollama'")
        return self


settings = Settings()
