# Week 4 — Scheduler Service (APScheduler Cron Jobs)

## Week Goal
Build and run the Scheduler Service — a Python service that uses APScheduler to automatically scan all connected cloud accounts every 6 hours, take daily cost snapshots for trend charts, and detect cost anomalies (>20% spikes). By end of week the platform runs completely autonomously — no manual curl commands needed.

---

## What's Inside

```
Week-04_Scheduler-Service/
├── docker-compose.yml              ← DB + Redis + Scanner + Analysis + Scheduler
├── database/migrations/
├── scanner-service/
├── analysis-engine/
└── scheduler-service/
    ├── Dockerfile
    ├── requirements.txt            ← FastAPI, APScheduler, asyncpg, httpx
    └── main.py                     ← Cron jobs: scan_all, cost_history, anomaly_check
```

---

## Quick Start

```bash
cd Week-04_Scheduler-Service
docker compose up -d --build
```

Watch the scheduler boot and register jobs:
```bash
docker compose logs scheduler-service --tail=20
# Look for: " Scheduler started", "scan_all job registered", "daily cost_history registered"
```

---

## Testing the Scheduler

### 1. Scheduler health check + active jobs list
```bash
curl http://localhost:8003/health | python3 -m json.tool
curl http://localhost:8003/jobs | python3 -m json.tool
```
Expected jobs:
```json
[
  {"id": "scan_all", "next_run": "2025-...", "trigger": "cron[hour=*/6]"},
  {"id": "cost_history", "next_run": "2025-...", "trigger": "cron[hour=0,minute=5]"},
  {"id": "anomaly_check", "next_run": "2025-...", "trigger": "cron[minute=30]"}
]
```

### 2. Manually trigger a full scan of all accounts (don't wait 6 hours!)
```bash
curl -s -X POST http://localhost:8003/trigger/scan | python3 -m json.tool
# Returns immediately; scan runs in background
```

Then watch it complete:
```bash
docker compose logs scheduler-service -f --tail=20
# →  Scheduled scan started | Triggered scan for AWS account | Triggered scan for Azure account
```

### 3. Manually trigger cost history snapshot
```bash
curl -s -X POST http://localhost:8003/trigger/cost-history | python3 -m json.tool
```

Then verify cost_history rows were inserted:
```bash
docker exec -it cco-db psql -U postgres -d cloudoptimizer \
  -c "SELECT snapshot_date, service, region, cost FROM cost_history ORDER BY created_at DESC LIMIT 10;"
```

### 4. Manually trigger anomaly detection
```bash
curl -s -X POST http://localhost:8003/trigger/anomaly-check | python3 -m json.tool
```

### 5. View scan job history
```bash
docker exec -it cco-db psql -U postgres -d cloudoptimizer \
  -c "SELECT status, triggered_by, resources_found, zombies_found, started_at, completed_at FROM scan_jobs ORDER BY created_at DESC LIMIT 5;"
```

### 6. Check any anomaly alerts created
```bash
docker exec -it cco-db psql -U postgres -d cloudoptimizer \
  -c "SELECT type, severity, title, message, created_at FROM alerts ORDER BY created_at DESC LIMIT 5;"
```

---

##  Scheduler Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| `scan_all` | Every 6 hours (00:00, 06:00, 12:00, 18:00) | Scans ALL active cloud accounts + triggers analysis |
| `cost_history` | Daily at 00:05 UTC | Snapshots per-service/region costs into `cost_history` table |
| `anomaly_check` | Every hour at :30 | Detects >20% cost spike vs 7-day average, creates alerts |

---

## Scheduler API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health + job count |
| GET | `/jobs` | List all registered jobs with next_run |
| POST | `/trigger/scan` | Immediately fire scan_all |
| POST | `/trigger/cost-history` | Immediately snapshot cost history |
| POST | `/trigger/anomaly-check` | Immediately run anomaly detection |

---

## Cron Configuration

Change scan frequency via environment variables:

```yaml
# In docker-compose.yml or .env:
SCAN_CRON_HOUR: "*/2"     # Every 2 hours
SCAN_CRON_MINUTE: "30"    # At :30 past the hour
```

---

## Teardown
```bash
docker compose down -v
```

---

## Learning Objectives
- Understand APScheduler: CronTrigger vs IntervalTrigger, AsyncIOScheduler
- Learn the trigger-endpoint pattern: scheduled job calls internal HTTP → scanner-service
- Understand cost anomaly detection: compare today's total vs 7-day rolling average
- Learn how to expose manual trigger endpoints for ops teams (no waiting for cron)
- Understand the scan_job audit table: every scan creates a row with status tracking
- Read `scheduler-service/main.py` — focus on `scan_all_accounts()` and `check_anomalies()`
