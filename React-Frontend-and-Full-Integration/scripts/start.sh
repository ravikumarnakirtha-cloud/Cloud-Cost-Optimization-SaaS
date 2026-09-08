#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# Cloud Cost Optimizer — Quick Start Script
# Run:  chmod +x scripts/start.sh && ./scripts/start.sh
# ══════════════════════════════════════════════════════════════════════════════
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
cat << 'EOF'
  ██████╗ ██╗      ██████╗ ██╗   ██╗██████╗      ██████╗ ██████╗ ████████╗
 ██╔════╝ ██║     ██╔═══██╗██║   ██║██╔══██╗    ██╔═══██╗██╔══██╗╚══██╔══╝
 ██║      ██║     ██║   ██║██║   ██║██║  ██║    ██║   ██║██████╔╝   ██║   
 ██║      ██║     ██║   ██║██║   ██║██║  ██║    ██║   ██║██╔═══╝    ██║   
 ╚██████╗ ███████╗╚██████╔╝╚██████╔╝██████╔╝    ╚██████╔╝██║        ██║   
  ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝ ╚═════╝      ╚═════╝ ╚═╝        ╚═╝   
                    Cloud Cost Optimizer — SaaS Platform
EOF
echo -e "${NC}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ── 1. Prerequisites check ────────────────────────────────────────────────────
echo -e "${YELLOW}[1/6] Checking prerequisites...${NC}"

command -v docker      >/dev/null 2>&1 || { echo -e "${RED}❌ Docker is required but not installed.${NC}"; exit 1; }
command -v docker-compose >/dev/null 2>&1 || \
  docker compose version >/dev/null 2>&1 || { echo -e "${RED}❌ Docker Compose is required.${NC}"; exit 1; }

echo -e "${GREEN}✅ Docker $(docker --version | awk '{print $3}' | tr -d ',') found${NC}"

# ── 2. Environment setup ──────────────────────────────────────────────────────
echo -e "${YELLOW}[2/6] Setting up environment...${NC}"

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo -e "${GREEN}✅ .env created from .env.example${NC}"
  echo -e "${YELLOW}   ⚠  Review .env and update secrets before production deployment${NC}"
else
  echo -e "${GREEN}✅ .env already exists${NC}"
fi

# ── 3. Pull base images ───────────────────────────────────────────────────────
echo -e "${YELLOW}[3/6] Pulling base images (this may take a few minutes)...${NC}"
docker pull postgres:16-alpine  --quiet &
docker pull redis:7-alpine      --quiet &
docker pull python:3.11-slim    --quiet &
docker pull node:20-alpine      --quiet &
docker pull mcr.microsoft.com/dotnet/sdk:8.0     --quiet &
docker pull mcr.microsoft.com/dotnet/aspnet:8.0  --quiet &
wait
echo -e "${GREEN}✅ Base images ready${NC}"

# ── 4. Build all services ─────────────────────────────────────────────────────
echo -e "${YELLOW}[4/6] Building all services...${NC}"
docker compose build --parallel
echo -e "${GREEN}✅ All services built${NC}"

# ── 5. Start services ─────────────────────────────────────────────────────────
echo -e "${YELLOW}[5/6] Starting services...${NC}"
docker compose up -d

echo -e "${YELLOW}   Waiting for database to be healthy...${NC}"
timeout 60 bash -c 'until docker compose exec -T db pg_isready -U postgres -d cloudoptimizer 2>/dev/null; do sleep 2; done'
echo -e "${GREEN}✅ Database ready${NC}"

echo -e "${YELLOW}   Waiting for API Gateway...${NC}"
timeout 90 bash -c 'until curl -sf http://localhost:8000/health > /dev/null 2>&1; do sleep 3; done'
echo -e "${GREEN}✅ API Gateway ready${NC}"

# ── 6. Seed demo data ─────────────────────────────────────────────────────────
echo -e "${YELLOW}[6/6] Triggering initial demo scan...${NC}"
sleep 5  # Let scheduler service warm up

# Trigger a scan via the scheduler
curl -sf -X POST http://localhost:8003/trigger-scan > /dev/null 2>&1 && \
  echo -e "${GREEN}✅ Initial scan triggered${NC}" || \
  echo -e "${YELLOW}   ⚠  Could not trigger initial scan — scheduler may still be starting${NC}"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🚀 Cloud Cost Optimizer is running!                       ${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Frontend Dashboard:${NC}  http://localhost:3000"
echo -e "  ${CYAN}API Gateway:${NC}         http://localhost:8000"
echo -e "  ${CYAN}Swagger UI:${NC}          http://localhost:8000/swagger"
echo -e "  ${CYAN}Scanner Service:${NC}     http://localhost:8001"
echo -e "  ${CYAN}Analysis Engine:${NC}     http://localhost:8002"
echo -e "  ${CYAN}Scheduler Service:${NC}   http://localhost:8003"
echo ""
echo -e "  ${YELLOW}Demo Credentials:${NC}"
echo -e "  Email:    admin@democorp.com"
echo -e "  Password: Admin@123"
echo ""
echo -e "  ${YELLOW}To view logs:${NC}   docker compose logs -f"
echo -e "  ${YELLOW}To stop:${NC}        docker compose down"
echo -e "  ${YELLOW}To reset data:${NC}  docker compose down -v"
echo ""
