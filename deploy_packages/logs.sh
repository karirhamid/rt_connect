#!/usr/bin/env bash
cd "$(dirname "$0")"
# Usage: ./logs.sh            tail all services
#        ./logs.sh backend    tail one service
docker compose logs -f --tail 200 "$@"
