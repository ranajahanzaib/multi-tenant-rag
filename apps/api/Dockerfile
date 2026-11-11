FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_LINK_MODE=copy
WORKDIR /app
COPY pyproject.toml uv.lock alembic.ini ./
COPY apps/api ./apps/api
COPY fixtures ./fixtures
RUN pip install --no-cache-dir uv && uv sync --frozen --no-dev --extra local-ai --extra documents
ENV PATH="/app/.venv/bin:$PATH" PYTHONPATH=/app/apps/api
EXPOSE 8000
