FROM python:3.14.7-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.13 /uv /uvx /bin/

# .venv/bin on PATH lets the release/run commands invoke alembic and uvicorn
# directly; no runtime `uv run` sync is needed (the image is already locked
# and complete). PYTHONUNBUFFERED keeps Heroku logs timely.
ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/code/.venv/bin:$PATH"

WORKDIR /code
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --locked

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
