# Week 1 — Database & Infrastructure Setup

## Week Goal
Boot PostgreSQL and Redis — the backbone of the Cloud Cost Optimizer. Apply the full multi-tenant schema with users, tenants, cloud accounts, resources, recommendations, cost history, and alerts. By end of week you will have a live database with the default Demo Corp tenant and admin user seeded — ready for all services to connect.

---

## What's Inside

```
Week-01_Database-and-Infrastructure/
├── docker-compose.yml           ← PostgreSQL 16 + Redis 7 only
├── database/
│   └── migrations/
│       ├── 001_init_schema.sql  ← Full schema: 9 tables, seed tenant + admin user
│       └── 002_indexes_constraints.sql  ← Performance indexes + triggers
├── datasets/
│   ├── aws_sample_resources.json     ← Reference AWS scan data format
│   └── azure_sample_resources.json   ← Reference Azure scan data format
└── configs/
    └── .env.example
```

---

## Quick Start

```bash
cd Week-01_Database-and-Infrastructure
docker compose up -d
```

PostgreSQL auto-runs both migration files on first boot (~10 seconds).

---

## Verify It's Working

### 1. Check containers are healthy
```bash
docker compose ps
# cco-db: healthy | cco-redis: running
```

### 2. List all tables
```bash
docker exec -it cco-db psql -U postgres -d cloudoptimizer -c "\dt"
```
Expected: `alerts`, `cloud_accounts`, `cost_history`, `cost_reports`, `recommendations`, `resources`, `scan_jobs`, `tenants`, `users`

### 3. Verify seed tenant and admin user
```bash
docker exec -it cco-db psql -U postgres -d cloudoptimizer \
  -c "SELECT t.name, t.plan, u.email, u.role FROM tenants t JOIN users u ON u.tenant_id = t.id;"
```
Expected:
```
   name    | plan |        email        | role
 Demo Corp | pro  | admin@democorp.com  | admin
```

### 4. Verify indexes exist
```bash
docker exec -it cco-db psql -U postgres -d cloudoptimizer \
  -c "SELECT indexname FROM pg_indexes WHERE tablename IN ('resources','recommendations') ORDER BY indexname;"
```

### 5. Ping Redis
```bash
docker exec -it cco-redis redis-cli -a redis123 ping
# → PONG
```

### 6. Inspect the schema (explore any table)
```bash
docker exec -it cco-db psql -U postgres -d cloudoptimizer -c "\d resources"

docker exec -it cco-db psql -U postgres -d cloudoptimizer -c "\d recommendations"
```

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `tenants` | Multi-tenant organizations (Demo Corp = plan `pro`) |
| `users` | Auth users with bcrypt passwords, role (admin/user), tenant scoping |
| `cloud_accounts` | Connected AWS/Azure accounts with credentials JSONB |
| `resources` | All discovered cloud resources with cost, status, zombie flag |
| `scan_jobs` | Audit log of every scan (status: pending → running → completed) |
| `recommendations` | Cost-saving actions per resource (rightsizing/delete/reserved/schedule) |
| `cost_history` | Daily cost snapshots per service/region for trend charts |
| `cost_reports` | Aggregated period reports with wasted vs total cost |
| `alerts` | Cost spike / new zombie / budget exceeded notifications |

---

## Default Credentials

| Field | Value |
|-------|-------|
| Email | `admin@democorp.com` |
| Password | `Admin@123` |
| Tenant | `Demo Corp` (UUID: `00000000-0000-0000-0000-000000000001`) |

---

## Connection Details

| Service | Host | Port | Credentials |
|---------|------|------|-------------|
| PostgreSQL | localhost | 5432 | `postgres / postgres123 / cloudoptimizer` |
| Redis | localhost | 6379 | password: `redis123` |

---

## Teardown
```bash
docker compose down        # stop, keep data
docker compose down -v     # wipe all volumes (full reset)
```

---

##  Learning Objectives
- Understand multi-tenant SaaS schema design: `tenant_id` on every table
- Learn why `resources` uses a unique constraint on `(resource_id, account_id)` — enables upsert on repeat scans
- Understand cost data model: resources → cost_history (daily) → cost_reports (aggregated)
- Read `001_init_schema.sql` — note how `is_zombie` and `zombie_reason` are tracked directly on the resource
- Learn the recommendation lifecycle: `open → applied → dismissed → snoozed`
