# Week 7 — React Dashboard & Full-Stack Integration

## Week Goal
Run the complete Cloud Cost Optimizer — all 7 containers including the React frontend. Engineers can log in, see the dashboard with zombie resource counts and total waste, browse all resources filtered by provider/type/zombie status, view and apply recommendations ranked by savings, see 90-day cost trend charts, and connect new cloud accounts — all in a browser.

---

## What's Inside

```
Week-07_React-Frontend-and-Full-Integration/
├── docker-compose.yml               ← FULL STACK — all 7 containers
├── .env                             ← Environment variables (ready to use)
├── database/migrations/
├── datasets/
├── scripts/
│   ├── seed_demo_data.py            ← Populate realistic demo data
│   └── start.sh                     ← One-command automated setup
├── scanner-service/
├── analysis-engine/
├── scheduler-service/
├── api-gateway/
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json                 ← React 18, Vite, TailwindCSS, Recharts, Axios
    └── src/
        ├── App.jsx                  ← Router: Dashboard, Resources, Recommendations, Accounts, Cost Report
        ├── hooks/useAuth.jsx        ← JWT auth context
        ├── services/api.js          ← Axios client for all API calls
        ├── components/Layout.jsx   ← Sidebar navigation
        └── pages/
            ├── Dashboard.jsx        ← Overview: waste %, top zombies, cost breakdown chart
            ├── ResourcesPage.jsx    ← Filterable resource table with zombie badges
            ├── RecommendationsPage.jsx ← Savings opportunities with apply/dismiss actions
            ├── AccountsPage.jsx     ← Connect AWS/Azure accounts + trigger scans
            └── CostReportPage.jsx   ← 90-day trend chart + breakdown by service/region
```

---

## Quick Start — Option A (One-Command)

```bash
cd Week-07_React-Frontend-and-Full-Integration
chmod +x scripts/start.sh
./scripts/start.sh
```

The setup script builds all images, waits for readiness, seeds demo data, and opens the dashboard.

---

## Quick Start — Option B (Manual)

```bash
cd Week-07_React-Frontend-and-Full-Integration

# 1. Start all services
docker compose up -d --build

# 2. Wait for API Gateway (~90 seconds for .NET + React build)
docker compose ps
# All services: healthy or running

# 3. Seed demo data
pip install asyncpg
python3 scripts/seed_demo_data.py

# 4. Open browser
open http://localhost:3000
```

---

## Open the Dashboard

**http://localhost:3000**

| Credential | Value |
|-----------|-------|
| Email | `admin@democorp.com` |
| Password | `Admin@123` |

---

## Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **React Dashboard** | **http://localhost:3000** | SaaS frontend |
| API Gateway (Swagger) | http://localhost:8000/swagger | Interactive REST API docs |
| Scanner Service | http://localhost:8001/docs | Scanner Swagger |
| Analysis Engine | http://localhost:8002/docs | Analysis Swagger |
| Scheduler Service | http://localhost:8003/docs | Scheduler Swagger |

---

## Dashboard Walkthrough

### 1. Dashboard (Home)
- **Waste percentage ring chart** — what % of your cloud spend is wasted
- **Total cloud spend** vs **wasted spend** vs **potential savings** cards
- **Top 5 zombie resources** — most expensive idle resources
- **Cost trend line chart** — 30-day spend with waste overlay
- **Recommendations by category** — delete vs rightsizing vs reserved

### 2. Resources Page
- Filter by: Provider (AWS/Azure), Resource Type, Zombie Only, Region
- Each resource shows: name, type, monthly cost, status badge, zombie reason
- Sort by monthly cost (descending) — biggest wasters first

### 3. Recommendations Page
- Filter by: Priority (critical/high/medium/low), Category, Status
- Each recommendation shows: potential monthly savings, effort level, description
- **Apply** → marks as applied, updates stats
- **Dismiss** → removes from open queue

### 4. Cloud Accounts Page
- Connect new AWS or Azure account (simulated scan runs instantly)
- View all connected accounts with last scan time
- Trigger manual re-scan per account
- View scan job history with resource/zombie counts

### 5. Cost Report Page
- **90-day cost trend** chart (line chart per service: EC2, EBS, S3, Azure VM...)
- **Cost breakdown table** by service and region
- Date range selector

---

## Full End-to-End Test

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@democorp.com","password":"Admin@123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 2. Dashboard summary
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/resources/summary \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"Total: \${d.get('totalMonthlyCost',0):.0f}/mo | Waste: \${d.get('wastedMonthlyCost',0):.0f}/mo | Zombies: {d.get('zombieResources',0)}\")"

# 3. Critical recommendations
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/get-recommendations?priority=critical" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); [print(f\"  💀 {r['title'][:60]} → \${r['monthlySavings']:.0f}/mo\") for r in d.get('items', [])]"

# 4. Trigger fresh scan
curl -s -X POST http://localhost:8000/api/scan-resources \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"Scan: {d.get('status')} — {d.get('message','')}\")"

# 5. Savings summary
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/recommendations/savings-summary \
  | python3 -m json.tool
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Dashboard blank / 502 | `docker compose logs frontend` — nginx proxy config |
| "Cannot connect to API" | Wait 90s for .NET build; check `docker compose ps` |
| No data on dashboard | Run `python3 scripts/seed_demo_data.py` |
| Login fails | Verify DB seeded: `docker exec -it cco-db psql -U postgres -d cloudoptimizer -c "SELECT email FROM users;"` |

---

## Teardown
```bash
docker compose down        # keep data
docker compose down -v     # wipe everything
```

---

## Learning Objectives
- Understand the complete SaaS flow: React → .NET API Gateway → Python microservices → PostgreSQL
- Learn React multi-page routing: react-router-dom with authenticated route guards
- Understand JWT auth in React: localStorage token → Axios Authorization header interceptor
- Learn Recharts: line charts, pie charts, bar charts with real cost data
- See how TailwindCSS builds a professional SaaS UI with dark sidebar + badge components
- Understand how nginx serves React SPA and proxies `/api/*` to the .NET backend
- Learn the full DevOps pipeline: Docker build → nginx → React → JWT → .NET → Python → PostgreSQL
