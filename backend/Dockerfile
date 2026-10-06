# syntax=docker/dockerfile:1
# Place in backend/Dockerfile. Build from the project root:
# docker build -t floor-shift-backend ./backend
# Pass DB settings at runtime with --env-file backend/.env.
# Initialize a new DB before starting the API:
# docker run --rm -it --env-file backend/.env floor-shift-backend python -m app.manage init
# On macOS, use PGHOST=host.docker.internal for PostgreSQL on the host.
# Set SHIFT_ALLOWED_ORIGINS to the browser URL (e.g. http://localhost:8080).
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt requirements.lock ./
RUN python -m pip install --only-binary=:all: -r requirements.txt
RUN groupadd --system app && useradd --system --gid app --home-dir /app app
# Copy only the application; local credentials are not copied.
COPY --chown=app:app app ./app
USER app
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
