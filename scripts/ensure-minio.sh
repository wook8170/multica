#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

S3_ENDPOINT="${S3_ENDPOINT:-}"
if [ -z "$S3_ENDPOINT" ]; then
  echo "==> S3_ENDPOINT not set, skipping MinIO startup"
  exit 0
fi

MINIO_DATA_DIR="${MINIO_DATA_DIR:-./data/minio}"
mkdir -p "$MINIO_DATA_DIR"

echo "==> Ensuring MinIO container is running on $S3_ENDPOINT..."
docker compose up -d minio

echo "==> Waiting for MinIO to be healthy..."
max_attempts=30
attempt=0
until [ $attempt -ge $max_attempts ]; do
  if docker compose ps --format json minio 2>/dev/null | grep -q '"Health":"healthy"'; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 2
done

if [ $attempt -ge $max_attempts ]; then
  echo "⚠ MinIO did not become healthy, but continuing..."
fi

echo "==> Initializing MinIO bucket..."
docker compose run --rm minio-init 2>/dev/null || true

echo "✓ MinIO ready at $S3_ENDPOINT, bucket: ${S3_BUCKET:-multica-files}"
echo "   Console: http://localhost:${MINIO_CONSOLE_PORT:-9001} (user: ${MINIO_ROOT_USER:-minioadmin})"
