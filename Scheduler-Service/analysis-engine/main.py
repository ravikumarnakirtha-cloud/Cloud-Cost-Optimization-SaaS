"""
Cloud Cost Optimizer - Analysis Engine
Analyzes scanned resources, calculates cost waste,
and generates actionable recommendations.
"""

import json
import os
import uuid
from datetime import datetime, date, timedelta
from typing import Optional

import asyncpg
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s")
log = logging.getLogger("analysis-engine")

app = FastAPI(title="Cloud Cost Optimizer — Analysis Engine", version="1.0.0")

app.add_middleware(CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB_DSN = os.getenv("DATABASE_URL",
    "postgresql://postgres:postgres@db:5432/cloudoptimizer")

_pool: Optional[asyncpg.Pool] = None

async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DB_DSN, min_size=2, max_size=10)
    return _pool

# ─────────────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────────────
class AnalysisRequest(BaseModel):
    tenantId:  str
    accountId: Optional[str] = None

class AnalysisResult(BaseModel):
    totalResources:    int
    zombieResources:   int
    totalMonthlyCost:  float
    wastedMonthlyCost: float
    potentialSavings:  float
    recommendationsGenerated: int

# ─────────────────────────────────────────────────────────────────────────────
# Recommendation Generation Logic
# ─────────────────────────────────────────────────────────────────────────────
PRIORITY_THRESHOLDS = {
    "critical": 500,   # > $500/month waste
    "high":     200,   # > $200/month
    "medium":   50,    # > $50/month
    "low":      0
}

def get_priority(monthly_savings: float) -> str:
    for priority, threshold in PRIORITY_THRESHOLDS.items():
        if monthly_savings > threshold:
            return priority
    return "low"


def generate_ec2_recommendations(resource: dict) -> list[dict]:
    """Generate rightsizing or termination recommendations for EC2"""
    recs = []
    config  = json.loads(resource["config"] or "{}")
    metrics = json.loads(resource["metrics"] or "{}")
    cost    = float(resource["monthly_cost"])
    cpu     = float(metrics.get("cpu_utilization_avg_7d", 0))
    state   = config.get("state", "running")
    itype   = config.get("instance_type", "")

    if state == "stopped":
        recs.append({
            "category":       "delete",
            "title":          f"Terminate stopped instance {resource['resource_name']}",
            "description":    (
                f"Instance {resource['resource_id']} has been stopped for 30+ days "
                f"but is still accruing EBS storage costs. Terminate to save ${cost:.2f}/month."
            ),
            "current_cost":   cost,
            "projected_cost": 0,
            "monthly_savings": cost,
            "effort":         "low"
        })
    elif cpu < 5.0 and "p3" in itype.lower():
        # GPU instance — very expensive, strong recommendation
        recs.append({
            "category":       "delete",
            "title":          f"Terminate idle GPU instance {resource['resource_name']}",
            "description":    (
                f"GPU instance {itype} showing {cpu}% CPU for 7 days. "
                f"This costs ${cost:.2f}/month. "
                "Stop or terminate if training jobs are complete."
            ),
            "current_cost":   cost,
            "projected_cost": 0,
            "monthly_savings": cost,
            "effort":         "low"
        })
    elif cpu < 5.0:
        # Suggest downsizing or stopping
        projected = cost * 0.25  # assume 4x smaller instance
        savings   = cost - projected
        recs.append({
            "category":       "rightsizing",
            "title":          f"Rightsize underutilized instance {resource['resource_name']}",
            "description":    (
                f"Instance {itype} averaging {cpu}% CPU. "
                f"Downsize to save ~${savings:.2f}/month (75% reduction)."
            ),
            "current_cost":   cost,
            "projected_cost": projected,
            "monthly_savings": savings,
            "effort":         "medium"
        })
    elif cpu < 20.0:
        # Suggest reserved instances or scheduling
        savings = cost * 0.40  # reserved instance discount
        recs.append({
            "category":       "reserved",
            "title":          f"Use Reserved Instance for {resource['resource_name']}",
            "description":    (
                f"Convert {itype} to 1-year Reserved Instance to save ~40% "
                f"(${savings:.2f}/month)."
            ),
            "current_cost":   cost,
            "projected_cost": cost * 0.60,
            "monthly_savings": savings,
            "effort":         "low"
        })

    return recs


def generate_volume_recommendations(resource: dict) -> list[dict]:
    """Generate recommendations for unattached volumes"""
    recs = []
    config = json.loads(resource["config"] or "{}")
    cost   = float(resource["monthly_cost"])
    if not config.get("attached", True):
        days = config.get("days_unattached", 0)
        recs.append({
            "category":       "delete",
            "title":          f"Delete unattached volume {resource['resource_name']}",
            "description":    (
                f"Volume unattached for {days} days. "
                f"Delete to save ${cost:.2f}/month."
            ),
            "current_cost":   cost,
            "projected_cost": 0,
            "monthly_savings": cost,
            "effort":         "low"
        })
    return recs


def generate_s3_recommendations(resource: dict) -> list[dict]:
    recs = []
    config = json.loads(resource["config"] or "{}")
    cost   = float(resource["monthly_cost"])
    days   = config.get("days_since_access", 0)

    if days > 180:
        savings = cost * 0.65   # Glacier is ~77% cheaper
        recs.append({
            "category":       "rightsizing",
            "title":          f"Move {resource['resource_name']} to Glacier",
            "description":    (
                f"S3 bucket not accessed in {days} days. "
                f"Migrate to Glacier Instant Retrieval to save ${savings:.2f}/month."
            ),
            "current_cost":   cost,
            "projected_cost": cost * 0.35,
            "monthly_savings": savings,
            "effort":         "medium"
        })

    return recs


def generate_azure_vm_recommendations(resource: dict) -> list[dict]:
    recs = []
    config  = json.loads(resource["config"] or "{}")
    metrics = json.loads(resource["metrics"] or "{}")
    cost    = float(resource["monthly_cost"])
    cpu     = float(metrics.get("cpu_utilization_avg_7d", 0))
    state   = config.get("power_state", "running")

    if state == "deallocated":
        recs.append({
            "category":       "delete",
            "title":          f"Clean up deallocated VM {resource['resource_name']}",
            "description":    (
                f"VM is deallocated but managed disk is still billing ${cost:.2f}/month. "
                "Delete VM and disks if no longer needed."
            ),
            "current_cost":   cost,
            "projected_cost": 0,
            "monthly_savings": cost,
            "effort":         "low"
        })
    elif cpu < 5.0:
        savings = cost * 0.75
        recs.append({
            "category":       "rightsizing",
            "title":          f"Rightsize Azure VM {resource['resource_name']}",
            "description":    (
                f"VM averaging {cpu}% CPU. Downsize to save ~${savings:.2f}/month."
            ),
            "current_cost":   cost,
            "projected_cost": cost * 0.25,
            "monthly_savings": savings,
            "effort":         "medium"
        })

    return recs


RECOMMENDATION_GENERATORS = {
    "ec2_instance":  generate_ec2_recommendations,
    "ebs_volume":    generate_volume_recommendations,
    "s3_bucket":     generate_s3_recommendations,
    "azure_vm":      generate_azure_vm_recommendations,
    "managed_disk":  generate_volume_recommendations,
}

# ─────────────────────────────────────────────────────────────────────────────
# Core Analysis
# ─────────────────────────────────────────────────────────────────────────────
async def run_analysis(tenant_id: str, account_id: Optional[str]) -> AnalysisResult:
    pool = await get_pool()

    async with pool.acquire() as conn:
        # Fetch all resources for this tenant
        q_filter = "WHERE r.tenant_id = $1"
        params   = [tenant_id]
        if account_id:
            q_filter += " AND r.account_id = $2"
            params.append(account_id)

        resources = await conn.fetch(f"""
            SELECT id, tenant_id, account_id, provider, resource_type,
                   resource_id, resource_name, region, config, metrics,
                   tags, monthly_cost, is_zombie, zombie_reason, status
            FROM resources r {q_filter}
        """, *params)

        if not resources:
            return AnalysisResult(
                totalResources=0, zombieResources=0,
                totalMonthlyCost=0, wastedMonthlyCost=0,
                potentialSavings=0, recommendationsGenerated=0
            )

        total_cost  = sum(float(r["monthly_cost"]) for r in resources)
        zombie_cost = sum(float(r["monthly_cost"]) for r in resources if r["is_zombie"])

        # Generate recommendations
        all_recs = []
        for resource in resources:
            resource_dict = dict(resource)
            generator = RECOMMENDATION_GENERATORS.get(resource["resource_type"])
            if generator:
                recs = generator(resource_dict)
                for rec in recs:
                    priority = get_priority(rec["monthly_savings"])
                    all_recs.append({
                        "id":              str(uuid.uuid4()),
                        "tenant_id":       tenant_id,
                        "account_id":      str(resource["account_id"]),
                        "resource_id":     str(resource["id"]),
                        "category":        rec["category"],
                        "priority":        priority,
                        "title":           rec["title"],
                        "description":     rec["description"],
                        "current_cost":    rec["current_cost"],
                        "projected_cost":  rec["projected_cost"],
                        "monthly_savings": rec["monthly_savings"],
                        "annual_savings":  rec["monthly_savings"] * 12,
                        "effort":          rec["effort"],
                        "status":          "open",
                        "metadata":        json.dumps({"resource_type": resource["resource_type"]})
                    })

        # Wipe old open recommendations for this tenant/account, then insert new
        if account_id:
            await conn.execute("""
                DELETE FROM recommendations
                WHERE tenant_id = $1 AND account_id = $2 AND status = 'open'
            """, tenant_id, account_id)
        else:
            await conn.execute("""
                DELETE FROM recommendations WHERE tenant_id = $1 AND status = 'open'
            """, tenant_id)

        # Bulk insert recommendations
        if all_recs:
            await conn.executemany("""
                INSERT INTO recommendations
                    (id, tenant_id, account_id, resource_id, category, priority,
                     title, description, current_cost, projected_cost,
                     monthly_savings, annual_savings, effort, status, metadata)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            """, [(
                r["id"], r["tenant_id"], r["account_id"], r["resource_id"],
                r["category"], r["priority"], r["title"], r["description"],
                r["current_cost"], r["projected_cost"], r["monthly_savings"],
                r["annual_savings"], r["effort"], r["status"], r["metadata"]
            ) for r in all_recs])

        # Store cost history snapshot for today
        today = date.today()
        by_service: dict[str, float] = {}
        for r in resources:
            by_service[r["resource_type"]] = (
                by_service.get(r["resource_type"], 0) + float(r["monthly_cost"])
            )

        # Upsert cost history
        for service, cost in by_service.items():
            await conn.execute("""
                INSERT INTO cost_history (id, tenant_id, account_id, snapshot_date, service, cost)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT DO NOTHING
            """, str(uuid.uuid4()), tenant_id,
                account_id, today, service, cost)

        log.info(
            f"Analysis complete — {len(resources)} resources, "
            f"{len(all_recs)} recommendations, ${total_cost:.2f}/mo total, "
            f"${zombie_cost:.2f}/mo wasted"
        )

        return AnalysisResult(
            totalResources=len(resources),
            zombieResources=sum(1 for r in resources if r["is_zombie"]),
            totalMonthlyCost=round(total_cost, 2),
            wastedMonthlyCost=round(zombie_cost, 2),
            potentialSavings=round(zombie_cost, 2),
            recommendationsGenerated=len(all_recs)
        )

# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "healthy", "service": "analysis-engine", "timestamp": datetime.utcnow()}


@app.post("/analyze-cost", response_model=AnalysisResult)
async def analyze_cost(req: AnalysisRequest):
    """
    Run cost analysis and generate recommendations.
    Called automatically after each scan, or manually via API.
    """
    try:
        return await run_analysis(req.tenantId, req.accountId)
    except Exception as e:
        log.error(f"Analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/cost-summary/{tenant_id}")
async def cost_summary(tenant_id: str, account_id: Optional[str] = None):
    """Quick cost summary without regenerating recommendations"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        params = [tenant_id]
        extra  = ""
        if account_id:
            extra = " AND account_id = $2"
            params.append(account_id)

        row = await conn.fetchrow(f"""
            SELECT
                COUNT(*)                              AS total_resources,
                SUM(CASE WHEN is_zombie THEN 1 ELSE 0 END) AS zombie_resources,
                COALESCE(SUM(monthly_cost), 0)        AS total_cost,
                COALESCE(SUM(CASE WHEN is_zombie THEN monthly_cost ELSE 0 END), 0) AS wasted_cost
            FROM resources WHERE tenant_id = $1 {extra}
        """, *params)

    return {
        "totalResources":    row["total_resources"],
        "zombieResources":   row["zombie_resources"],
        "totalMonthlyCost":  float(row["total_cost"]),
        "wastedMonthlyCost": float(row["wasted_cost"]),
        "annualWaste":       float(row["wasted_cost"]) * 12
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
