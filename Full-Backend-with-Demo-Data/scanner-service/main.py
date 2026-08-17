"""
Cloud Cost Optimizer - Scanner Service
FastAPI application that scans AWS and Azure resources.
Supports both real SDK connections and simulated data for demo/dev.
"""

import json
import os
import random
import uuid
from datetime import datetime, timedelta
from typing import Optional

import asyncpg
import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s")
log = logging.getLogger("scanner-service")

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Cloud Cost Optimizer — Scanner Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config ────────────────────────────────────────────────────────────────────
DB_DSN = os.getenv("DATABASE_URL",
    "postgresql://postgres:postgres@db:5432/cloudoptimizer")
ANALYSIS_ENGINE_URL = os.getenv("ANALYSIS_ENGINE_URL",
    "http://analysis-engine:8002")
SIMULATE_CLOUD = os.getenv("SIMULATE_CLOUD", "true").lower() == "true"

# ── DB Pool ───────────────────────────────────────────────────────────────────
_pool: Optional[asyncpg.Pool] = None

async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DB_DSN, min_size=2, max_size=10)
    return _pool

# ── Models ────────────────────────────────────────────────────────────────────
class ScanRequest(BaseModel):
    tenantId:  str
    accountId: Optional[str] = None
    jobId:     Optional[str] = None

class ScanResult(BaseModel):
    resourcesFound: int
    zombiesFound:   int
    jobId:          str
    status:         str = "completed"

# ── Helpers ───────────────────────────────────────────────────────────────────
def _random_cpu():
    """Simulate CPU utilization — skewed towards low to make interesting demo"""
    r = random.random()
    if r < 0.35:   return round(random.uniform(0.5, 4.9), 1)   # idle
    if r < 0.55:   return round(random.uniform(5.0, 20.0), 1)  # low
    return round(random.uniform(20.0, 95.0), 1)                 # healthy

def _is_zombie_ec2(cpu: float, state: str) -> tuple[bool, str | None]:
    if state == "stopped":
        return True, "Instance stopped for 30+ days, still incurring EBS charges"
    if cpu < 5.0:
        return True, f"CPU utilization {cpu}% — below 5% threshold for 7 days"
    return False, None

def _is_zombie_volume(attached: bool, days_unattached: int) -> tuple[bool, str | None]:
    if not attached and days_unattached > 30:
        return True, f"Unattached EBS volume for {days_unattached}+ days"
    return False, None

# ── Simulated AWS Scanner ─────────────────────────────────────────────────────
async def scan_aws_simulated(account_id: str, regions: list[str]) -> list[dict]:
    """
    Returns simulated AWS resource list.
    In production: replace with boto3 calls to EC2, EBS, S3, RDS etc.
    """
    resources = []

    instance_types   = ["t3.micro", "t3.medium", "t3.large", "t3.xlarge",
                         "m5.large", "m5.xlarge", "m5.2xlarge", "c5.2xlarge",
                         "p3.2xlarge", "r5.xlarge"]
    cost_map_ec2     = {
        "t3.micro": 7.59, "t3.medium": 30.37, "t3.large": 60.74,
        "t3.xlarge": 121.47, "m5.large": 70.08, "m5.xlarge": 140.16,
        "m5.2xlarge": 280.32, "c5.2xlarge": 246.24,
        "p3.2xlarge": 918.00, "r5.xlarge": 182.00
    }

    for region in regions:
        # EC2 Instances (5-10 per region)
        for i in range(random.randint(5, 10)):
            itype = random.choice(instance_types)
            cpu   = _random_cpu()
            state = random.choice(["running"] * 8 + ["stopped"] * 2)
            is_z, reason = _is_zombie_ec2(cpu, state)

            resources.append({
                "resource_id":   f"i-{uuid.uuid4().hex[:17]}",
                "resource_name": f"{random.choice(['web','api','db','ml','batch'])}-{region[-2:]}-{i+1:02d}",
                "resource_type": "ec2_instance",
                "provider":      "aws",
                "region":        region,
                "config": json.dumps({
                    "instance_type":  itype,
                    "state":          state,
                    "launch_time":    (datetime.utcnow() - timedelta(days=random.randint(10, 400))).isoformat()
                }),
                "metrics": json.dumps({
                    "cpu_utilization_avg_7d":    cpu,
                    "network_in_avg_7d_mbps":    round(random.uniform(0.01, 200), 2),
                    "network_out_avg_7d_mbps":   round(random.uniform(0.01, 150), 2)
                }),
                "tags":         json.dumps({"env": random.choice(["prod", "dev", "staging"]),
                                            "team": random.choice(["backend", "frontend", "data", "ops"])}),
                "monthly_cost": cost_map_ec2.get(itype, 50.0),
                "is_zombie":    is_z,
                "zombie_reason": reason,
                "status":       state if state == "stopped" else "active"
            })

        # EBS Volumes (3-6 per region)
        for i in range(random.randint(3, 6)):
            size_gb    = random.choice([50, 100, 200, 500, 1000])
            vtype      = random.choice(["gp2", "gp3", "io1"])
            attached   = random.random() > 0.4
            days_un    = random.randint(0, 90)
            cost_per_gb = {"gp2": 0.10, "gp3": 0.08, "io1": 0.125}.get(vtype, 0.10)
            is_z, reason = _is_zombie_volume(attached, days_un)

            resources.append({
                "resource_id":   f"vol-{uuid.uuid4().hex[:17]}",
                "resource_name": f"vol-{vtype}-{i+1:02d}",
                "resource_type": "ebs_volume",
                "provider":      "aws",
                "region":        region,
                "config": json.dumps({
                    "volume_type":  vtype,
                    "size_gb":      size_gb,
                    "attached":     attached,
                    "days_unattached": 0 if attached else days_un
                }),
                "metrics": json.dumps({}),
                "tags":    json.dumps({}),
                "monthly_cost": round(size_gb * cost_per_gb, 2),
                "is_zombie":    is_z,
                "zombie_reason": reason,
                "status": "in-use" if attached else "available"
            })

        # S3 Buckets (2-4 total — not per-region)
        if region == regions[0]:
            for i in range(random.randint(2, 4)):
                size_gb = random.randint(100, 5000)
                days_since_access = random.randint(0, 365)
                is_z = days_since_access > 180
                reason = f"Bucket not accessed for {days_since_access} days" if is_z else None

                resources.append({
                    "resource_id":   f"s3-{uuid.uuid4().hex[:8]}",
                    "resource_name": f"bucket-{random.choice(['logs','backup','data','media'])}-{uuid.uuid4().hex[:6]}",
                    "resource_type": "s3_bucket",
                    "provider":      "aws",
                    "region":        region,
                    "config": json.dumps({
                        "size_gb":             size_gb,
                        "object_count":        random.randint(1000, 20000000),
                        "days_since_access":   days_since_access,
                        "storage_class":       random.choice(["STANDARD", "STANDARD_IA"])
                    }),
                    "metrics": json.dumps({}),
                    "tags":    json.dumps({"purpose": random.choice(["logs", "backup", "media"])}),
                    "monthly_cost": round(size_gb * 0.023, 2),
                    "is_zombie":    is_z,
                    "zombie_reason": reason,
                    "status": "active"
                })

    return resources

# ── Simulated Azure Scanner ───────────────────────────────────────────────────
async def scan_azure_simulated(subscription_id: str, regions: list[str]) -> list[dict]:
    """
    Returns simulated Azure resource list.
    In production: replace with azure-sdk calls to Compute, Storage etc.
    """
    resources = []
    vm_sizes  = ["Standard_B2s", "Standard_D2s_v3", "Standard_D4s_v3",
                 "Standard_E4s_v3", "Standard_NC6", "Standard_F8s_v2"]
    cost_map  = {
        "Standard_B2s": 30.0, "Standard_D2s_v3": 70.08,
        "Standard_D4s_v3": 140.16, "Standard_E4s_v3": 252.0,
        "Standard_NC6": 657.0, "Standard_F8s_v2": 268.8
    }

    for region in regions:
        for i in range(random.randint(4, 8)):
            size  = random.choice(vm_sizes)
            cpu   = _random_cpu()
            state = random.choice(["running"] * 7 + ["deallocated"] * 3)
            is_z  = cpu < 5.0 or state == "deallocated"
            reason = (
                "Deallocated VM still incurring managed disk charges" if state == "deallocated"
                else f"CPU {cpu}% below 5% threshold" if cpu < 5.0
                else None
            )

            resources.append({
                "resource_id":   f"/subscriptions/{subscription_id[:8]}/rg-{region}/vm-{i}",
                "resource_name": f"vm-{random.choice(['web','app','db'])}-{region[:2]}-{i+1:02d}",
                "resource_type": "azure_vm",
                "provider":      "azure",
                "region":        region,
                "config": json.dumps({
                    "vm_size":      size,
                    "power_state":  state,
                    "os_type":      random.choice(["Linux", "Windows"])
                }),
                "metrics": json.dumps({
                    "cpu_utilization_avg_7d":  cpu,
                    "network_in_avg_7d_mbps":  round(random.uniform(0.01, 150), 2)
                }),
                "tags":    json.dumps({"env": random.choice(["prod", "dev"])}),
                "monthly_cost": cost_map.get(size, 100.0),
                "is_zombie":    is_z,
                "zombie_reason": reason,
                "status": state
            })

        # Managed Disks
        for i in range(random.randint(2, 5)):
            attached  = random.random() > 0.35
            days_un   = random.randint(0, 90)
            size_gb   = random.choice([64, 128, 256, 512, 1024])
            disk_type = random.choice(["Standard_LRS", "Premium_LRS", "UltraSSD_LRS"])
            price_map = {"Standard_LRS": 0.04, "Premium_LRS": 0.135, "UltraSSD_LRS": 0.29}

            is_z   = not attached and days_un > 30
            reason = f"Unattached {disk_type} disk for {days_un}+ days" if is_z else None

            resources.append({
                "resource_id":   f"/subscriptions/{subscription_id[:8]}/rg-{region}/disk-{i}",
                "resource_name": f"disk-{disk_type.lower()[:4]}-{i+1:02d}",
                "resource_type": "managed_disk",
                "provider":      "azure",
                "region":        region,
                "config": json.dumps({
                    "disk_type":  disk_type,
                    "size_gb":    size_gb,
                    "attached":   attached
                }),
                "metrics": json.dumps({}),
                "tags":    json.dumps({}),
                "monthly_cost": round(size_gb * price_map.get(disk_type, 0.05), 2),
                "is_zombie":    is_z,
                "zombie_reason": reason,
                "status": "Attached" if attached else "Unattached"
            })

    return resources

# ── DB Persistence ────────────────────────────────────────────────────────────
async def persist_resources(
    pool: asyncpg.Pool,
    tenant_id: str,
    account_id: str,
    resources: list[dict]
) -> int:
    """Upsert resources into the database"""
    async with pool.acquire() as conn:
        inserted = 0
        for r in resources:
            try:
                await conn.execute("""
                    INSERT INTO resources
                        (id, tenant_id, account_id, provider, resource_type, resource_id,
                         resource_name, region, tags, config, metrics, monthly_cost,
                         status, is_zombie, zombie_reason, scanned_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
                    ON CONFLICT (resource_id, account_id) DO UPDATE SET
                        metrics      = EXCLUDED.metrics,
                        monthly_cost = EXCLUDED.monthly_cost,
                        status       = EXCLUDED.status,
                        is_zombie    = EXCLUDED.is_zombie,
                        zombie_reason = EXCLUDED.zombie_reason,
                        last_seen_at = NOW(),
                        scanned_at   = NOW()
                """,
                    str(uuid.uuid4()), tenant_id, account_id,
                    r["provider"], r["resource_type"], r["resource_id"],
                    r.get("resource_name"), r.get("region"),
                    r.get("tags", "{}"), r.get("config", "{}"),
                    r.get("metrics", "{}"),
                    float(r.get("monthly_cost", 0)),
                    r.get("status", "active"),
                    bool(r.get("is_zombie", False)),
                    r.get("zombie_reason")
                )
                inserted += 1
            except Exception as e:
                log.warning(f"Failed to persist resource {r['resource_id']}: {e}")
        return inserted

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "healthy", "service": "scanner", "timestamp": datetime.utcnow()}

@app.post("/scan", response_model=ScanResult)
async def scan(req: ScanRequest, background_tasks: BackgroundTasks):
    """
    Trigger a resource scan for a cloud account.
    Stores results in PostgreSQL and notifies the analysis engine.
    """
    log.info(f"Starting scan — tenant={req.tenantId} account={req.accountId}")

    try:
        pool = await get_pool()

        # Fetch account config from DB
        async with pool.acquire() as conn:
            account = await conn.fetchrow(
                "SELECT * FROM cloud_accounts WHERE id = $1",
                req.accountId
            )

        if account is None and req.accountId:
            # Demo mode — use sample data
            provider = "aws"
            account_id_str = str(req.accountId)
            regions = ["us-east-1", "us-west-2"]
        else:
            provider = account["provider"] if account else "aws"
            account_id_str = str(req.accountId or uuid.uuid4())
            regions = list(account["regions"]) if account else ["us-east-1"]

        # Run scanner (simulated or real)
        if SIMULATE_CLOUD or not account:
            if provider == "aws":
                resources = await scan_aws_simulated(account_id_str, regions)
            else:
                resources = await scan_azure_simulated(account_id_str, regions)
        else:
            # Real SDK scanning (requires credentials in account["credentials"])
            # TODO: implement boto3/azure-sdk calls here
            resources = await scan_aws_simulated(account_id_str, regions)

        # Persist to database
        saved = await persist_resources(pool, req.tenantId, account_id_str, resources)

        zombie_count = sum(1 for r in resources if r.get("is_zombie"))

        # Update account last_scan_at
        if req.accountId:
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE cloud_accounts SET last_scan_at = NOW() WHERE id = $1",
                    req.accountId
                )

        # Notify analysis engine to generate recommendations
        background_tasks.add_task(
            notify_analysis_engine, req.tenantId, req.accountId
        )

        log.info(f"Scan complete — {saved} resources, {zombie_count} zombies")

        return ScanResult(
            resourcesFound=saved,
            zombiesFound=zombie_count,
            jobId=req.jobId or str(uuid.uuid4())
        )

    except Exception as e:
        log.error(f"Scan failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/scan-status/{job_id}")
async def scan_status(job_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        job = await conn.fetchrow(
            "SELECT * FROM scan_jobs WHERE id = $1", job_id
        )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return dict(job)


async def notify_analysis_engine(tenant_id: str, account_id: Optional[str]):
    """Ping the analysis engine to generate fresh recommendations"""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            await client.post(f"{ANALYSIS_ENGINE_URL}/analyze-cost",
                json={"tenantId": tenant_id, "accountId": account_id})
    except Exception as e:
        log.warning(f"Could not notify analysis engine: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
