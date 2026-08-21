#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Ensure dockerd is running (nested Cloud Agent VM)
if ! docker info >/dev/null 2>&1; then
  echo "==> Starting Docker daemon"
  sudo mkdir -p /etc/docker
  if [ ! -f /etc/docker/daemon.json ]; then
    echo '{"iptables": true, "storage-driver": "fuse-overlayfs"}' | sudo tee /etc/docker/daemon.json >/dev/null
  fi
  sudo update-alternatives --set iptables /usr/sbin/iptables-legacy 2>/dev/null || true
  sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy 2>/dev/null || true
  sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null
  sudo dockerd >/tmp/dockerd.log 2>&1 &
  for _ in $(seq 1 30); do
  if docker info >/dev/null 2>&1; then break; fi
    sleep 1
  done
  sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
fi

# Map backend hostname for Vite proxy when running frontend natively
if ! grep -q "backend" /etc/hosts 2>/dev/null; then
  echo "127.0.0.1 backend" | sudo tee -a /etc/hosts >/dev/null
fi

echo "==> Starting infrastructure services (PostgreSQL + Ollama)"
docker compose -f "$REPO_ROOT/.cursor/docker-compose.infra.yml" pull
docker compose -f "$REPO_ROOT/.cursor/docker-compose.infra.yml" up -d

echo "==> Waiting for PostgreSQL"
for _ in $(seq 1 30); do
  if docker compose -f "$REPO_ROOT/.cursor/docker-compose.infra.yml" exec -T db pg_isready -U postgres -d finance_db >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Enabling pgvector extension"
docker compose -f "$REPO_ROOT/.cursor/docker-compose.infra.yml" exec -T db \
  psql -U postgres -d finance_db -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null

echo "==> Pulling Ollama models (idempotent)"
for model in nomic-embed-text qwen2.5:3b; do
  if ! docker exec finance_ollama ollama list 2>/dev/null | grep -q "$model"; then
    echo "Pulling $model..."
    docker exec finance_ollama ollama pull "$model" || true
  fi
done

echo "==> Start complete"
