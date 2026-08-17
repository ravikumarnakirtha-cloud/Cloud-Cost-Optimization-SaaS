# Week 3 — Analysis Engine & Recommendation Generation (Python FastAPI)

## Week Goal
Build and run the Analysis Engine — a Python FastAPI service that reads scanned resources from PostgreSQL, calculates total vs wasted cloud spend, and auto-generates prioritized cost-saving recommendations (delete, rightsizing, reserved instances, scheduling). By end of week running a scan + analysis produces a full set of actionable recommendations ranked by potential monthly savings.

---

## What's Inside

```
Week-03_Analysis-Engine/
├── docker-compose.yml              ← DB + Redis + Scanner + Analysis Engine
├── database/migrations/
├── datasets/
├── scanner-service/
└── analysis-engine/
    ├── Dockerfile
    ├── requirements.txt            ← FastAPI, asyncpg
    └── main.py                     ← Cost analysis + recommendation generation logic
```

---

## Quick Start

```bash
cd Week-03_Analysis-Engine
docker compose up -d --build
```

Verify both services:
```bash
docker compose logs scanner-service --tail=10
docker compose logs analysis-engine --tail=10
# Both: "started successfully"
```

---

## Testing the Analysis Engine

### Step 1: Trigger a Scan First
```bash
curl -s -X POST http://localhost:8001/scan \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "00000000-0000-0000-0000-000000000001"}' | python3 -m json.tool
```

### Step 2: Run Analysis to Generate Recommendations
```bash
curl -s -X POST http://localhost:8002/analyze \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "00000000-0000-0000-0000-000000000001"}' | python3 -m json.tool
```
Expected:
```json
{
  "totalResources": 45,
  "zombieResources": 18,
  "totalMonthlyCost": 8420.50,
  "wastedMonthlyCost": 4280.30,
  "potentialSavings": 3852.27,
  "recommendationsGenerated": 24
}
```

### 3. View top recommendations by savings
```bash
docker exec -it cco-db psql -U postgres -d cloudoptimizer \
  -c "SELECT category, priority, title, monthly_savings FROM recommendations ORDER BY monthly_savings DESC LIMIT 10;"
```

### 4. Count recommendations by priority
```bash
docker exec -it cco-db psql -U postgres -d cloudoptimizer \
  -c "SELECT priority, category, COUNT(*) FROM recommendations GROUP BY priority, category ORDER BY priority, category;"
```

### 5. Total potential annual savings
```bash
docker exec -it cco-db psql -U postgres -d cloudoptimizer \
  -c "SELECT SUM(monthly_savings) AS monthly, SUM(annual_savings) AS annual FROM recommendations WHERE status='open';"
```

### 6. Health check
```bash
curl http://localhost:8002/health | python3 -m json.tool
```

### 7. Run scan + analyze in one pipeline
```bash
TENANT="00000000-0000-0000-0000-000000000001"
curl -s -X POST http://localhost:8001/scan -H "Content-Type: application/json" \
  -d "{\"tenantId\": \"$TENANT\"}" > /dev/null

sleep 2

curl -s -X POST http://localhost:8002/analyze -H "Content-Type: application/json" \
  -d "{\"tenantId\": \"$TENANT\"}" | python3 -m json.tool
```

---

## Recommendation Categories

| Category | Trigger | Example |
|----------|---------|---------|
| **delete** | Zombie resource (unattached/idle/stopped) | "Delete unattached EBS volume — saves $40/month" |
| **rightsizing** | CPU utilization < 20% but > 5% | "Downsize m5.2xlarge → m5.large — saves $140/month" |
| **reserved** | Running on-demand > 6 months | "Switch to 1yr reserved pricing — saves $84/month (30%)" |
| **schedule** | Dev/test instances running 24/7 | "Auto-stop 8pm–8am M-F — saves $60/month (70% reduction)" |

---

## Priority Thresholds

| Priority | Monthly Savings | Action |
|----------|----------------|--------|
| `critical` | > $500/month | Immediate executive attention |
| `high` | > $200/month | Address this week |
| `medium` | > $50/month | Address this sprint |
| `low` | < $50/month | Address next quarter |

---

## Swagger UI
- Scanner: **http://localhost:8001/docs**
- Analysis Engine: **http://localhost:8002/docs**

---

## Teardown
```bash
docker compose down -v
```

---

## Learning Objectives
- Understand how cost waste analysis flows: zombie flag → wasted cost calculation → recommendation generation
- Learn the recommendation generation pattern: per-resource function dispatching (EC2, EBS, Azure VM...)
- Understand priority scoring: monthly_savings threshold → critical/high/medium/low
- Learn how rightsizing works: current instance type + CPU utilization → suggest next tier down
- Understand reserved instance savings math: on-demand price × 30% × 12 months = annual savings
- Read `analysis-engine/main.py` — focus on `generate_ec2_recommendations()` and `analyze()` endpoint
