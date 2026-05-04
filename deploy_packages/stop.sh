#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "Stopping RT Connect services..."
docker compose down
echo "Stopped."
