#!/usr/bin/env bash
set -euo pipefail

backup_dir="${1:-./backups}"
mkdir -p "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-govector}" \
  -d "${POSTGRES_DB:-govector}" \
  -Fc > "$backup_dir/govector-db-$stamp.dump"

docker compose exec -T app tar -C /app/uploads -czf - technician_media \
  > "$backup_dir/govector-media-$stamp.tar.gz"

sha256sum "$backup_dir/govector-db-$stamp.dump" \
  "$backup_dir/govector-media-$stamp.tar.gz" \
  > "$backup_dir/govector-$stamp.sha256"

printf 'Sauvegarde créée dans %s\n' "$backup_dir"
