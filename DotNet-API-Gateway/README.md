# Week 5 — .NET 8 API Gateway (ASP.NET Core + JWT + EF Core)

## Week Goal
Build and run the .NET API Gateway — the central authenticated REST API that all clients use. It handles JWT login/registration, proxies scan triggers to the scanner service, serves resources and recommendations from PostgreSQL via EF Core, caches hot data in Redis, and exposes interactive Swagger UI. By end of week the entire backend is available through a single authenticated API.

---

## What's Inside

```
Week-05_DotNet-API-Gateway/
├── docker-compose.yml              ← DB + Redis + Python services + API Gateway
├── database/migrations/
├── scanner-service/
├── analysis-engine/
├── scheduler-service/
└── api-gateway/
    ├── Dockerfile
    ├── appsettings.json            ← DB connection string, JWT config, service URLs
    ├── Program.cs                  ← DI container, middleware pipeline, Swagger
    ├── CloudCostOptimizer.ApiGateway.csproj
    └── src/
        ├── Controllers/
        │   ├── AuthController.cs         ← POST /api/auth/login, register, GET /me
        │   ├── CloudAccountController.cs ← CRUD cloud accounts + trigger scans
        │   └── ResourcesController.cs    ← Resources, recommendations, cost reports
        ├── Services/
        │   ├── AuthService.cs            ← JWT generation + bcrypt password verification
        │   ├── CloudAccountService.cs    ← Account CRUD + scanner HTTP client
        │   └── ResourceService.cs        ← EF Core queries + Redis caching
        ├── Models/
        │   └── AppDbContext.cs           ← EF Core entities for all 9 tables
        └── Middleware/
            └── ExceptionHandlingMiddleware.cs
```

---

## Quick Start

```bash
cd Week-05_DotNet-API-Gateway
docker compose up -d --build
```

> .NET build takes ~3–5 minutes on first run (NuGet restore).

Verify:
```bash
docker compose logs api-gateway --tail=20
# Look for: "Now listening on: http://[::]:8000"
```

---

## Testing the API Gateway

### 1. Login and capture JWT token
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@democorp.com","password":"Admin@123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token: ${TOKEN:0:50}..."
```

### 2. Get current user profile
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/auth/me | python3 -m json.tool
```

### 3. Connect a cloud account (simulated AWS)
```bash
curl -s -X POST http://localhost:8000/api/connect-cloud \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "aws",
    "accountId": "123456789012",
    "accountAlias": "my-aws-prod",
    "regions": ["us-east-1", "us-west-2"],
    "credentials": {"accessKey": "simulated", "secretKey": "simulated"}
  }' | python3 -m json.tool
```

### 4. List all cloud accounts
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/cloud-accounts | python3 -m json.tool
```

### 5. Trigger a scan via gateway
```bash
curl -s -X POST http://localhost:8000/api/scan-resources \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool
```

### 6. List resources (filtered to zombies)
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/resources?zombie=true&page=1&size=10" \
  | python3 -m json.tool
```

### 7. Get resource summary
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/resources/summary | python3 -m json.tool
```

### 8. Get recommendations (critical priority)
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/get-recommendations?priority=critical&status=open" \
  | python3 -m json.tool
```

### 9. Get cost report
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/get-cost-report | python3 -m json.tool
```

### 10. Test unauthorized access (expect 401)
```bash
curl -v http://localhost:8000/api/resources
```

---

## Full API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login → JWT token |
| POST | `/api/auth/register` | Create new user |
| GET | `/api/auth/me` | Current user profile |
| POST | `/api/connect-cloud` | Connect AWS or Azure account |
| GET | `/api/cloud-accounts` | List all accounts |
| DELETE | `/api/cloud-accounts/{id}` | Remove account |
| POST | `/api/scan-resources` | Trigger cloud scan |
| GET | `/api/scan-jobs` | Scan history |
| GET | `/api/resources` | Resources (filterable) |
| GET | `/api/resources/summary` | Cost + zombie stats |
| GET | `/api/get-cost-report` | Full cost breakdown |
| GET | `/api/cost-history` | Trend data (30 days) |
| GET | `/api/get-recommendations` | Recommendations |
| PATCH | `/api/recommendations/{id}/apply` | Mark applied |
| PATCH | `/api/recommendations/{id}/dismiss` | Dismiss |
| GET | `/api/recommendations/savings-summary` | Total savings potential |

---

## Swagger UI (Interactive)
Open: **http://localhost:8000/swagger**

---

## Security

| Feature | Implementation |
|---------|---------------|
| Password hashing | bcrypt (12 rounds) |
| Tokens | JWT HS256, 1440-minute (24h) expiry |
| Tenant isolation | `tenant_id` from JWT claim on every DB query |
| Redis caching | Hot data (summary, recommendations) cached 5 minutes |

---

## Teardown
```bash
docker compose down -v
```

---

## Learning Objectives
- Understand ASP.NET Core dependency injection: `AddScoped`, `AddHttpClient`
- Learn EF Core with PostgreSQL: `UseNpgsql`, snake_case naming, LINQ queries
- Understand JWT middleware: `ValidateIssuer`, `ValidateAudience`, claim extraction
- Learn Redis distributed caching in .NET: `IDistributedCache.GetStringAsync`
- Understand the Tenant isolation pattern: every service method filters by `tenantId` from JWT
- Read `Program.cs` for the full DI setup, then `ResourceService.cs` for the caching pattern
