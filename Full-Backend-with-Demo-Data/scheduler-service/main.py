"""
Cloud Cost Optimizer - Scheduler Service
Periodically triggers scans across all active cloud accounts.
Uses APScheduler for cron-style job scheduling.
"""

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime
from typing import Optional

import asyncpg
import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s")
log = logging.getLogger("scheduler-service")

app = FastAPI(title="Cloud Cost Optimizer — Scheduler Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Config ────────────────────────────────────────────────────────────────────
DB_DSN              = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/cloudoptimizer")
SCANNER_SERVICE_URL = os.getenv("SCANNER_SERVICE_URL", "http://scanner-service:8001")
SCAN_CRON_HOUR      = os.getenv("SCAN_CRON_HOUR", "*/6")   # every 6 hours by default
SCAN_CRON_MINUTE    = os.getenv("SCAN_CRON_MINUTE", "0")

_pool: Optional[asyncpg.Pool] = None

async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DB_DSN, min_size=1, max_size=5)
    return _pool

# ─────────────────────────────────────────────────────────────────────────────
# Core Scheduler Logic
# ─────────────────────────────────────────────────────────────────────────────
async def scan_all_accounts():
    """
    Fetch all active cloud accounts and trigger scans.
    Runs on the cron schedule defined above.
    """
    log.info("⏰ Scheduled scan started at %s", datetime.utcnow().isoformat())
    pool = await get_pool()

    async with pool.acquire() as conn:
        accounts = await conn.fetch("""
            SELECT id, tenant_id, provider, account_id, regions
            FROM cloud_accounts
            WHERE is_active = TRUE
        """)

    if not accounts:
        log.info("No active cloud accounts found, skipping scan")
        return

    log.info("Found %d active accounts to scan", len(accounts))

    async with httpx.AsyncClient(timeout=60) as client:
        for account in accounts:
            try:
                job_id = str(uuid.uuid4())

                # Register the scan job in DB
                async with pool.acquire() as conn:
                    await conn.execute("""
                        INSERT INTO scan_jobs
                            (id, tenant_id, account_id, status, triggered_by, created_at)
                        VALUES ($1, $2, $3, 'running', 'scheduler', NOW())
                    """, job_id, str(account["tenant_id"]), str(account["id"]))

                # Call scanner service
                resp = await client.post(f"{SCANNER_SERVICE_URL}/scan", json={
                    "tenantId":  str(account["tenant_id"]),
                    "accountId": str(account["id"]),
                    "jobId":     job_id
                })

                result = resp.json()

                # Update job status
                async with pool.acquire() as conn:
                    await conn.execute("""
                        UPDATE scan_jobs
                        SET status = 'completed',
                            completed_at    = NOW(),
                            resources_found = $2,
                            zombies_found   = $3
                        WHERE id = $1
                    """, job_id,
                        result.get("resourcesFound", 0),
                        result.get("zombiesFound", 0))

                log.info(
                    "✅ Account %s scanned — %d resources, %d zombies",
                    account["account_id"],
                    result.get("resourcesFound", 0),
                    result.get("zombiesFound", 0)
                )

            except Exception as e:
                log.error("❌ Scan failed for account %s: %s", account["id"], e)
                async with pool.acquire() as conn:
                    await conn.execute("""
                        UPDATE scan_jobs
                        SET status = 'failed', completed_at = NOW(), error_message = $2
                        WHERE id = $1
                    """, job_id, str(e))

    log.info("⏰ Scheduled scan completed at %s", datetime.utcnow().isoformat())


async def generate_cost_history_snapshots():
    """
    Daily job: ensure cost history rows exist for today.
    Fills in any gaps for trend charts.
    """
    log.info("📊 Generating daily cost history snapshots")
    pool = await get_pool()

    async with pool.acquire() as conn:
        # Aggregate current resource costs into cost_history
        await conn.execute("""
            INSERT INTO cost_history (id, tenant_id, account_id, snapshot_date, service, cost)
            SELECT
                gen_random_uuid(),
                tenant_id,
                account_id,
                CURRENT_DATE,
                resource_type,
                SUM(monthly_cost)
            FROM resources
            GROUP BY tenant_id, account_id, resource_type
            ON CONFLICT DO NOTHING
        """)

    log.info("📊 Cost history snapshots generated")


async def check_cost_anomalies():
    """
    Detect sudden cost spikes and create alerts.
    Compares today's cost to the 7-day average.
    """
    log.info("🔔 Checking for cost anomalies")
    pool = await get_pool()

    async with pool.acquire() as conn:
        # Find tenants with >20% cost increase vs 7-day average
        spikes = await conn.fetch("""
            WITH today AS (
                SELECT tenant_id, SUM(cost) AS today_cost
                FROM cost_history
                WHERE snapshot_date = CURRENT_DATE
                GROUP BY tenant_id
            ),
            avg7 AS (
                SELECT tenant_id, AVG(daily_cost) AS avg_cost
                FROM (
                    SELECT tenant_id, snapshot_date, SUM(cost) AS daily_cost
                    FROM cost_history
                    WHERE snapshot_date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE - 1
                    GROUP BY tenant_id, snapshot_date
                ) sub
                GROUP BY tenant_id
            )
            SELECT t.tenant_id, t.today_cost, a.avg_cost,
                   ((t.today_cost - a.avg_cost) / NULLIF(a.avg_cost, 0) * 100) AS pct_change
            FROM today t
            JOIN avg7 a ON a.tenant_id = t.tenant_id
            WHERE ((t.today_cost - a.avg_cost) / NULLIF(a.avg_cost, 0)) > 0.20
        """)

        for spike in spikes:
            await conn.execute("""
                INSERT INTO alerts (id, tenant_id, type, severity, title, message)
                VALUES ($1, $2, 'cost_spike', 'warning', $3, $4)
            """,
                str(uuid.uuid4()),
                str(spike["tenant_id"]),
                f"Cost spike detected: +{spike['pct_change']:.1f}%",
                f"Your cloud spend today (${spike['today_cost']:.2f}) is "
                f"{spike['pct_change']:.1f}% above your 7-day average "
                f"(${spike['avg_cost']:.2f})."
            )

    log.info("🔔 Anomaly check complete, found %d spikes", len(spikes))

# ─────────────────────────────────────────────────────────────────────────────
# APScheduler Setup
# ─────────────────────────────────────────────────────────────────────────────
scheduler = AsyncIOScheduler(timezone="UTC")

@app.on_event("startup")
async def startup():
    # Scan all accounts every 6 hours
    scheduler.add_job(
        scan_all_accounts,
        CronTrigger(hour=SCAN_CRON_HOUR, minute=SCAN_CRON_MINUTE),
        id="scan_all",
        replace_existing=True,
        misfire_grace_time=300
    )

    # Daily cost history snapshots at midnight
    scheduler.add_job(
        generate_cost_history_snapshots,
        CronTrigger(hour="0", minute="5"),
        id="cost_history",
        replace_existing=True
    )

    # Cost anomaly detection every hour
    scheduler.add_job(
        check_cost_anomalies,
        CronTrigger(minute="30"),
        id="anomaly_check",
        replace_existing=True
    )

    scheduler.start()
    log.info("✅ Scheduler started with %d jobs", len(scheduler.get_jobs()))

    # Run initial scan on startup (after a short delay)
    await asyncio.sleep(10)
    asyncio.create_task(scan_all_accounts())


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown()
    log.info("Scheduler stopped")

# ─────────────────────────────────────────────────────────────────────────────
# API Endpoints
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    jobs = [{"id": j.id, "next_run": str(j.next_run_time)} for j in scheduler.get_jobs()]
    return {"status": "healthy", "service": "scheduler", "jobs": jobs}


@app.post("/trigger-scan")
async def trigger_scan(account_id: Optional[str] = None):
    """Manually trigger an immediate scan"""
    asyncio.create_task(scan_all_accounts())
    return {"message": "Scan triggered", "timestamp": datetime.utcnow()}


@app.get("/jobs")
def list_jobs():
    return {
        "jobs": [
            {
                "id":       j.id,
                "name":     j.name,
                "next_run": str(j.next_run_time),
                "trigger":  str(j.trigger)
            }
            for j in scheduler.get_jobs()
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8003, reload=False)
