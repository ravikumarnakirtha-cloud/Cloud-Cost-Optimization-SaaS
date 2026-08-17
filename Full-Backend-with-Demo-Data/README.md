# Week 6 — Full Backend with Realistic Demo Data

## Week Goal
Run the complete backend stack and seed it with realistic demo data — 2 cloud accounts (AWS + Azure), 40+ resources across multiple regions, 24+ cost-saving recommendations, 90 days of cost history for trend charts, and anomaly alerts. By end of week every API endpoint returns meaningful data that resembles a real enterprise with $8,000+/month cloud spend and $3,800+/month in identified waste.

---

## What's Inside

```
Week-06_Full-Backend-with-Demo-Data/
├── docker-compose.yml              ← All 5 backend services + DB + Redis
├── database/migrations/
├── datasets/
├── scripts/
│   └── seed_demo_data.py          ← Populates realistic multi-service cost data
├── scanner-service/
├── analysis-engine/
├── scheduler-service/
└── api-gateway/
```

---

## Quick Start

```bash
cd Week-06_Full-Backend-with-Demo-Data

# 1. Start all services
docker compose up -d --build

# 2. Wait for API Gateway to be ready (~60 seconds for .NET build)
docker compose ps
# api-gateway must show: healthy

# 3. Run the demo data seeder
pip install asyncpg   # if not installed
python3 scripts/seed_demo_data.py
```

---

## Full API Test Suite

### 1. Login
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@democorp.com","password":"Admin@123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Logged in"
```

### 2. Resource Summary Dashboard
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/resources/summary | python3 -m json.tool
```
Expected:
```json
{
  "totalResources": 42,
  "zombieResources": 18,
  "totalMonthlyCost": 8420.50,
  "wastedMonthlyCost": 4280.30,
  "potentialMonthlySavings": 3852.27,
  "zombiePercentage": 42.8
}
```

### 3. List all zombie resources (the "waste map")
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/resources?zombie=true&size=20" \
  | python3 -m json.tool
```

### 4. Top critical recommendations
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/get-recommendations?priority=critical&status=open" \
  | python3 -m json.tool
```

### 5. Savings summary
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/recommendations/savings-summary | python3 -m json.tool
```
Expected:
```json
{
  "totalMonthly": 3852.27,
  "totalAnnual": 46227.24,
  "critical": 2448.00,
  "high": 980.40,
  "medium": 340.87,
  "low": 83.00
}
```

### 6. Cost report (full breakdown by service + region)
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/get-cost-report | python3 -m json.tool
```

### 7. Cost trend (90 days)
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/cost-history?days=90" | python3 -m json.tool
```

### 8. Apply a recommendation (mark as actioned)
```bash
REC_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/get-recommendations?priority=critical&status=open" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['id'])" 2>/dev/null)
echo "Applying: $REC_ID"

curl -s -X PATCH -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/recommendations/$REC_ID/apply" | python3 -m json.tool
```

### 9. Scan all accounts (fresh scan)
```bash
curl -s -X POST http://localhost:8000/api/scan-resources \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool
```

### 10. Check scan job history
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/scan-jobs | python3 -m json.tool
```

---

## Seeded Demo Data Summary

| Data | Count | Details |
|------|-------|---------|
| Cloud Accounts | 2 | AWS `us-east-1, us-west-2` + Azure `eastus, westeurope` |
| Resources | 42 | EC2, EBS, S3, Azure VMs, managed disks, storage accounts |
| Zombie Resources | 18 | ~43% of total — realistic enterprise waste level |
| Recommendations | 24+ | Across all categories and priority levels |
| Cost History | 90 days | Daily snapshots per service/region for trend chart |
| Alerts | 3 | Cost spike + new zombie notifications |

---

## Demo Waste Highlights

| Resource | Type | Monthly Cost | Waste Reason |
|----------|------|-------------|-------------|
| ml-training-abandoned | p3.8xlarge EC2 | $2,448 | CPU 3.1%, 7 days idle |
| prod-web-server-idle | t3.xlarge EC2 | $125.90 | CPU 2.3%, 7 days idle |
| old-dev-volume-1 (x3) | EBS gp2 | $40 each | Unattached 45+ days |
| archive-bucket-2018 | S3 | $12/mo | 0 access in 180+ days |
| azure-vm-idle-prod | Standard_D4s_v3 | $280 | CPU 1.8%, deallocated |

---

## Teardown
```bash
docker compose down -v
```

---

## Learning Objectives
- Understand how realistic demo data is structured to simulate enterprise cloud waste
- Learn the seed pattern: idempotent `ON CONFLICT DO NOTHING` inserts
- Understand cost history data model: daily per-service snapshots → trend chart data
- See the full pipeline: seeded resources → API → JSON responses
- Understand how savings-summary aggregates across priority tiers
- Learn the recommendation lifecycle: `open → applied` (track what was actioned)
