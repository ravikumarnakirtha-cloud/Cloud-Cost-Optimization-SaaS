#!/usr/bin/env python3
"""
Cloud Cost Optimizer — Demo Data Seeder
Run this after the database is up to populate realistic demo data.

Usage:
  pip install asyncpg
  python scripts/seed_demo_data.py
"""

import asyncio
import json
import os
import uuid
import random
from datetime import datetime, date, timedelta

import asyncpg

DB_DSN = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres123@localhost:5432/cloudoptimizer"
)

TENANT_ID  = "00000000-0000-0000-0000-000000000001"
ADMIN_ID   = "00000000-0000-0000-0000-000000000002"

AWS_ACCOUNT_ID   = str(uuid.uuid4())
AZURE_ACCOUNT_ID = str(uuid.uuid4())


async def seed(conn: asyncpg.Connection):
    print("🌱 Seeding demo data...")

    # ── Cloud Accounts ─────────────────────────────────────────────────────
    await conn.execute("""
        INSERT INTO cloud_accounts (id, tenant_id, provider, account_id, account_alias, regions, is_active, last_scan_at)
        VALUES ($1, $2, 'aws',   '123456789012', 'my-aws-prod',   ARRAY['us-east-1','us-west-2'], TRUE, NOW() - INTERVAL '2 hours')
        ON CONFLICT DO NOTHING
    """, AWS_ACCOUNT_ID, TENANT_ID)

    await conn.execute("""
        INSERT INTO cloud_accounts (id, tenant_id, provider, account_id, account_alias, regions, is_active, last_scan_at)
        VALUES ($1, $2, 'azure', 'aaaa-bbbb-cccc', 'my-azure-prod', ARRAY['eastus','westeurope'],  TRUE, NOW() - INTERVAL '2 hours')
        ON CONFLICT DO NOTHING
    """, AZURE_ACCOUNT_ID, TENANT_ID)

    print("  ✅ Cloud accounts created")

    # ── Resources ──────────────────────────────────────────────────────────
    resources = [
        # ── AWS EC2 (zombies) ──────────────────────────────────────────────
        (AWS_ACCOUNT_ID, "aws", "ec2_instance", "i-0a1b2c3d001", "prod-web-server-idle",
         "us-east-1", 125.90, True,  "CPU 2.3% avg — idle for 7+ days",
         json.dumps({"instance_type":"t3.xlarge","state":"running"}),
         json.dumps({"cpu_utilization_avg_7d":2.3})),

        (AWS_ACCOUNT_ID, "aws", "ec2_instance", "i-0a1b2c3d002", "ml-training-abandoned",
         "us-east-1", 2448.00, True, "GPU instance p3.8xlarge at 3.1% CPU — 7 days idle",
         json.dumps({"instance_type":"p3.8xlarge","state":"running"}),
         json.dumps({"cpu_utilization_avg_7d":3.1})),

        (AWS_ACCOUNT_ID, "aws", "ec2_instance", "i-0a1b2c3d003", "dev-test-stopped",
         "us-west-2", 68.00, True, "Instance stopped 45+ days — EBS still billing",
         json.dumps({"instance_type":"c5.4xlarge","state":"stopped"}),
         json.dumps({"cpu_utilization_avg_7d":0.0})),

        # ── AWS EC2 (healthy) ──────────────────────────────────────────────
        (AWS_ACCOUNT_ID, "aws", "ec2_instance", "i-0a1b2c3d004", "prod-api-server",
         "us-east-1", 284.00, False, None,
         json.dumps({"instance_type":"m5.2xlarge","state":"running"}),
         json.dumps({"cpu_utilization_avg_7d":78.5})),

        (AWS_ACCOUNT_ID, "aws", "ec2_instance", "i-0a1b2c3d005", "prod-db-primary",
         "us-east-1", 365.00, False, None,
         json.dumps({"instance_type":"r5.2xlarge","state":"running"}),
         json.dumps({"cpu_utilization_avg_7d":42.7})),

        # ── AWS EBS (zombies) ─────────────────────────────────────────────
        (AWS_ACCOUNT_ID, "aws", "ebs_volume", "vol-orphan-001", "orphaned-data-500gb",
         "us-east-1", 50.00, True, "Unattached EBS volume for 45+ days",
         json.dumps({"volume_type":"gp2","size_gb":500,"attached":False,"days_unattached":45}),
         json.dumps({})),

        (AWS_ACCOUNT_ID, "aws", "ebs_volume", "vol-orphan-002", "old-io1-backup-1tb",
         "us-east-1", 125.00, True, "Unattached io1 volume — high cost",
         json.dumps({"volume_type":"io1","size_gb":1000,"attached":False,"days_unattached":60}),
         json.dumps({})),

        # ── AWS S3 (zombie) ───────────────────────────────────────────────
        (AWS_ACCOUNT_ID, "aws", "s3_bucket", "bucket-logs-archive-2022", "old-logs-archive-2022",
         "us-east-1", 55.20, True, "Bucket not accessed in 12+ months — consider Glacier",
         json.dumps({"size_gb":2400,"object_count":15000000,"days_since_access":365,"storage_class":"STANDARD"}),
         json.dumps({})),

        # ── Azure VMs (zombies) ───────────────────────────────────────────
        (AZURE_ACCOUNT_ID, "azure", "azure_vm", "/subscriptions/aaaa/vm-web-01", "vm-web-01",
         "eastus", 140.16, True, "CPU 1.8% avg — idle for 7+ days",
         json.dumps({"vm_size":"Standard_D4s_v3","power_state":"running","os_type":"Linux"}),
         json.dumps({"cpu_utilization_avg_7d":1.8})),

        (AZURE_ACCOUNT_ID, "azure", "azure_vm", "/subscriptions/aaaa/vm-dev-old", "vm-dev-old",
         "westeurope", 65.70, True, "Deallocated GPU VM — managed disk still billing",
         json.dumps({"vm_size":"Standard_NC6","power_state":"deallocated","os_type":"Linux"}),
         json.dumps({"cpu_utilization_avg_7d":0.0})),

        # ── Azure VMs (healthy) ───────────────────────────────────────────
        (AZURE_ACCOUNT_ID, "azure", "azure_vm", "/subscriptions/aaaa/vm-api-01", "vm-api-01",
         "eastus", 504.54, False, None,
         json.dumps({"vm_size":"Standard_E8s_v3","power_state":"running","os_type":"Linux"}),
         json.dumps({"cpu_utilization_avg_7d":65.3})),

        # ── Azure Managed Disks ───────────────────────────────────────────
        (AZURE_ACCOUNT_ID, "azure", "managed_disk", "/subscriptions/aaaa/disk-orphan-01", "disk-premium-orphan",
         "eastus", 69.63, True, "Unattached Premium managed disk for 60+ days",
         json.dumps({"disk_type":"Premium_LRS","size_gb":512,"attached":False}),
         json.dumps({})),

        (AZURE_ACCOUNT_ID, "azure", "storage_account", "/subscriptions/aaaa/storage/oldlogs2022", "oldlogstorage2022",
         "eastus", 128.00, True, "Storage account not accessed in 11+ months",
         json.dumps({"performance_tier":"Standard","size_gb":3200,"days_since_access":330}),
         json.dumps({})),
    ]

    for (acct_id, provider, rtype, rid, rname, region, cost, is_z, reason, config, metrics) in resources:
        await conn.execute("""
            INSERT INTO resources
                (id, tenant_id, account_id, provider, resource_type, resource_id,
                 resource_name, region, config, metrics, tags, monthly_cost,
                 status, is_zombie, zombie_reason, first_seen_at, last_seen_at, scanned_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'{}','$11','active',$12,$13,
                    NOW()-INTERVAL '30 days', NOW(), NOW())
            ON CONFLICT (resource_id, account_id) DO NOTHING
        """.replace("'$11'", "$11"),
            str(uuid.uuid4()), TENANT_ID, acct_id, provider, rtype, rid,
            rname, region, config, metrics, cost, is_z, reason
        )

    print(f"  ✅ {len(resources)} resources seeded")

    # ── Recommendations ────────────────────────────────────────────────────
    recs = [
        ("delete",    "critical", "Terminate idle GPU instance ml-training-abandoned",
         "p3.8xlarge GPU instance averaging 3.1% CPU for 7 days. Costs $2,448/month. "
         "Terminate immediately to save $2,448/mo.",
         2448.00, 0, 2448.00, "low"),

        ("delete",    "high", "Delete unattached io1 EBS volume old-io1-backup-1tb",
         "1TB io1 volume unattached for 60+ days. Delete to save $125/month.",
         125.00, 0, 125.00, "low"),

        ("rightsizing","high", "Rightsize idle EC2 instance prod-web-server-idle",
         "t3.xlarge with 2.3% CPU utilization. Downsize to t3.small to save ~$94/month (75% reduction).",
         125.90, 31.48, 94.42, "medium"),

        ("delete",    "high", "Terminate stopped dev-test-stopped instance",
         "Instance stopped 45+ days still incurring EBS charges. Terminate to save $68/month.",
         68.00, 0, 68.00, "low"),

        ("delete",    "high", "Delete unattached orphaned EBS volume",
         "500GB gp2 volume unattached 45+ days. Delete to save $50/month.",
         50.00, 0, 50.00, "low"),

        ("rightsizing","medium", "Migrate old-logs-archive-2022 S3 bucket to Glacier",
         "S3 bucket not accessed in 12 months. Migrate to Glacier Instant Retrieval "
         "to save ~$35.88/month (65% reduction).",
         55.20, 19.32, 35.88, "medium"),

        ("delete",    "high", "Delete unattached Azure Premium managed disk",
         "512GB Premium_LRS disk unattached for 60+ days. Delete to save $69.63/month.",
         69.63, 0, 69.63, "low"),

        ("delete",    "medium", "Clean up deallocated Azure VM vm-dev-old",
         "Deallocated NC6 GPU VM still incurring managed disk charges. Delete to save $65.70/month.",
         65.70, 0, 65.70, "low"),

        ("rightsizing","medium", "Rightsize idle Azure VM vm-web-01",
         "Standard_D4s_v3 with 1.8% CPU. Downsize to B2s to save ~$105/month.",
         140.16, 30.00, 110.16, "medium"),

        ("reserved",  "low", "Convert prod-api-server to Reserved Instance",
         "m5.2xlarge running at 78.5% CPU — stable workload. 1-yr Reserved Instance saves ~$113/month (40%).",
         284.00, 170.40, 113.60, "low"),

        ("delete",    "medium", "Archive or delete oldlogstorage2022 Azure Storage Account",
         "3.2TB storage account not accessed for 11 months. Archive or delete to save $128/month.",
         128.00, 0, 128.00, "medium"),
    ]

    for (cat, priority, title, desc, current, projected, savings, effort) in recs:
        await conn.execute("""
            INSERT INTO recommendations
                (id, tenant_id, account_id, category, priority, title, description,
                 current_cost, projected_cost, monthly_savings, annual_savings, effort, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open')
            ON CONFLICT DO NOTHING
        """,
            str(uuid.uuid4()), TENANT_ID, AWS_ACCOUNT_ID,
            cat, priority, title, desc,
            current, projected, savings, savings * 12, effort
        )

    print(f"  ✅ {len(recs)} recommendations seeded")

    # ── Cost History (30 days) ─────────────────────────────────────────────
    services = ["ec2_instance", "ebs_volume", "s3_bucket", "azure_vm", "managed_disk", "storage_account"]
    base_costs = {
        "ec2_instance": 3290.90, "ebs_volume": 183.00, "s3_bucket": 73.60,
        "azure_vm": 710.40, "managed_disk": 87.04, "storage_account": 140.00
    }

    for days_ago in range(30, 0, -1):
        snapshot_date = date.today() - timedelta(days=days_ago)
        for svc in services:
            # Add slight daily variance to make the trend chart look realistic
            jitter = 1 + (random.random() - 0.5) * 0.08
            cost   = base_costs[svc] * jitter
            await conn.execute("""
                INSERT INTO cost_history (id, tenant_id, account_id, snapshot_date, service, cost)
                VALUES ($1,$2,$3,$4,$5,$6)
                ON CONFLICT DO NOTHING
            """,
                str(uuid.uuid4()), TENANT_ID, AWS_ACCOUNT_ID,
                snapshot_date, svc, round(cost, 2)
            )

    print("  ✅ 30-day cost history seeded")

    # ── Alerts ─────────────────────────────────────────────────────────────
    await conn.execute("""
        INSERT INTO alerts (id, tenant_id, type, severity, title, message)
        VALUES
          ($1, $2, 'new_zombie',  'warning', '3 new zombie resources detected',
           'Latest scan found 3 new idle/orphaned resources wasting $2,621/month.'),
          ($3, $2, 'cost_spike',  'warning', 'ML cost spike detected: +127%',
           'ml-training-abandoned GPU instance costs $2,448/month with 3.1% CPU usage.'),
          ($4, $2, 'budget_info', 'info',    'Monthly cloud spend: $4,484',
           'Your estimated monthly spend is $4,484. Potential savings: $3,149 (70.2%).')
        ON CONFLICT DO NOTHING
    """, str(uuid.uuid4()), TENANT_ID, str(uuid.uuid4()), str(uuid.uuid4()))

    print("  ✅ Sample alerts seeded")
    print("\n✨ Demo data seeded successfully!")
    print("\n  Login:    admin@democorp.com")
    print("  Password: Admin@123")


async def main():
    print(f"Connecting to {DB_DSN.split('@')[1] if '@' in DB_DSN else DB_DSN}...")
    try:
        conn = await asyncpg.connect(DB_DSN)
        await seed(conn)
        await conn.close()
    except Exception as e:
        print(f"❌ Seeding failed: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
