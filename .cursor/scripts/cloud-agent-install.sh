#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> Installing frontend dependencies"
cd frontend
npm ci

echo "==> Installing backend dependencies"
cd "$REPO_ROOT/backend"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

echo "==> Pre-pulling infrastructure Docker images"
docker compose -f "$REPO_ROOT/.cursor/docker-compose.infra.yml" pull

echo "==> Install complete"
