#!/bin/bash
set -euo pipefail

if [[ -z "${MONGO_REPLICA_KEY:-}" ]]; then
  echo "MONGO_REPLICA_KEY must be configured." >&2
  exit 1
fi

printf '%s\n' "$MONGO_REPLICA_KEY" > /tmp/mongo-keyfile
chown mongodb:mongodb /tmp/mongo-keyfile
chmod 400 /tmp/mongo-keyfile

exec /usr/local/bin/docker-entrypoint.sh mongod \
  --replSet rs0 \
  --bind_ip_all \
  --keyFile /tmp/mongo-keyfile
