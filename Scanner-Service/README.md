# Week 2 — Cloud Resource Scanner Service (Python FastAPI)

## Week Goal
Build and run the Scanner Service — a Python FastAPI microservice that simulates scanning AWS and Azure environments for zombie resources. It detects idle EC2 instances, unattached EBS volumes, stale S3 buckets, abandoned Azure VMs, and orphaned managed disks, then writes them directly to PostgreSQL. By end of week you can trigger a full scan via REST and see discovered resources in the database.

---

## What's Inside

```
Week-02_Scanner-Service/
├── docker-compose.yml              ← PostgreSQL + Redis + Scanner Service
├── database/migrations/
├── datasets/
│   ├── aws_sample_resources.json   ← Reference scan output format
│   └── azure_sample_resources.json
└── scanner-service/
    ├── Dockerfile
    ├── requirements.txt            ← FastAPI, asyncpg, httpx, boto3 (optional)
    └── main.py                     ← Simulated AWS + Azure scanning + zombie detection
```

---

## Quick Start

```bash
cd Week-02_Scanner-Service
docker compose up -d --build
```

Verify:
```bash
docker compose logs scanner-service --tail=20
# Look for: "Scanner service started successfully"
```

---

## Testing the Scanner

### 1. Health check
```bash
curl http://localhost:8001/health | python3 -m json.tool
```

### 2. Trigger a scan (using the seeded tenant + account IDs)
```bash
curl -s -X POST http://localhost:8001/scan \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "00000000-0000-0000-0000-000000000001",
    "accountId": null,
    "jobId": null
  }' | python3 -m json.tool
```
Expected:
```json
{
  "resourcesFound": 45,
  "zombiesFound": 18,
  "jobId": "...",
  "status": "completed"
}
```

### 3. Verify resources in the database
```bash
docker exec -it cco-db psql -U postgres -d cloudoptimizer \
  -c "SELECT provider, resource_type, COUNT(*), SUM(monthly_cost) FROM resources GROUP BY provider, resource_type ORDER BY 3 DESC;"
```

### 4. View zombie resources
```bash
docker exec -it cco-db psql -U postgres -d cloudoptimizer \
  -c "SELECT resource_name, resource_type, monthly_cost, zombie_reason FROM resources WHERE is_zombie=TRUE ORDER BY monthly_cost DESC LIMIT 10;"
```

### 5. Check the most expensive zombie (likely the abandoned GPU instance)
```bash
docker exec -it cco-db psql -U postgres -d cloudoptimizer \
  -c "SELECT resource_name, monthly_cost, zombie_reason FROM resources WHERE is_zombie=TRUE ORDER BY monthly_cost DESC LIMIT 1;"
# ml-training-abandoned: p3.8xlarge at $2,448/month → 3.1% CPU
```

### 6. Trigger another scan (note it upserts — no duplicate resources)
```bash
curl -s -X POST http://localhost:8001/scan \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "00000000-0000-0000-0000-000000000001"}' | python3 -m json.tool
```

---

## Zombie Detection Logic

| Resource Type | Detection Criteria | Typical Monthly Waste |
|---|---|---|
| EC2 Instance (running) | CPU < 5% avg for 7 days | $30–$2,448 |
| EC2 Instance (stopped) | Stopped for 30+ days (EBS charges) | $7–$125 |
| EBS Volume | Unattached for 30+ days | $5–$80 |
| S3 Bucket | No access for 180+ days | $0.10–$50 |
| Azure VM | CPU < 5% for 7 days OR deallocated | $20–$500 |
| Azure Managed Disk | Unattached for 30+ days | $5–$80 |
| Azure Storage Account | No access for 180+ days | $1–$30 |

---

## Scanner API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health check |
| POST | `/scan` | Trigger full cloud scan |
| GET | `/docs` | Swagger UI |

---

## Simulation vs Real Cloud

| Variable | Value | Effect |
|----------|-------|--------|
| `SIMULATE_CLOUD=true` | Default | Generates realistic synthetic data |
| `SIMULATE_CLOUD=false` | Requires AWS/Azure creds | Calls real boto3/azure-sdk |

To scan a real AWS account: set `SIMULATE_CLOUD=false` and add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` to environment.

---

## Swagger UI
Open: **http://localhost:8001/docs**

---

## Teardown
```bash
docker compose down -v
```

---

## Learning Objectives
- Understand zombie resource detection: CPU threshold, attachment status, last-access time
- Learn asyncpg for high-performance async PostgreSQL writes (upsert pattern)
- Understand the `ON CONFLICT DO UPDATE` SQL upsert — how repeat scans refresh data
- Learn how cloud provider APIs return resource data (simulated → real SDK call swap)
- Read `scanner-service/main.py` — focus on `scan_aws_simulated()`, `_is_zombie_ec2()`, and the DB upsert
