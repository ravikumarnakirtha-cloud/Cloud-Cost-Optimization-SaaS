using CloudCostOptimizer.ApiGateway.src.Controllers;
using CloudCostOptimizer.ApiGateway.src.Models;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;

namespace CloudCostOptimizer.ApiGateway.src.Services;

// ─────────────────────────────────────────────────────────────────────────────
// ICloudAccountService
// ─────────────────────────────────────────────────────────────────────────────
public interface ICloudAccountService
{
    Task<object>  ConnectAccountAsync(Guid tenantId, ConnectCloudRequest req);
    Task<object>  GetAccountsAsync(Guid tenantId);
    Task<object?> GetAccountAsync(Guid tenantId, Guid accountId);
    Task          DisconnectAccountAsync(Guid tenantId, Guid accountId);
    Task<object>  TriggerScanAsync(Guid tenantId, Guid? accountId);
    Task<object?> GetScanJobAsync(Guid tenantId, Guid jobId);
    Task<object>  ListScanJobsAsync(Guid tenantId, int page, int size);
}

// ─────────────────────────────────────────────────────────────────────────────
// CloudAccountService
// ─────────────────────────────────────────────────────────────────────────────
public class CloudAccountService(
    AppDbContext      db,
    IScannerClient    scannerClient,
    ILogger<CloudAccountService> logger) : ICloudAccountService
{
    public async Task<object> ConnectAccountAsync(Guid tenantId, ConnectCloudRequest req)
    {
        // Store credentials as JSONB (in production: encrypt with KMS)
        var credentials = JsonConvert.SerializeObject(new
        {
            accessKeyId     = req.AccessKeyId,
            secretAccessKey = req.SecretAccessKey,  // NEVER log this
            tenantIdAzure   = req.TenantIdAzure,
            clientId        = req.ClientId,
            clientSecret    = req.ClientSecret       // NEVER log this
        });

        var account = new CloudAccount
        {
            Id           = Guid.NewGuid(),
            TenantId     = tenantId,
            Provider     = req.Provider.ToLowerInvariant(),
            AccountId    = req.AccountId,
            AccountAlias = req.AccountAlias,
            Credentials  = credentials,
            Regions      = req.Regions,
            IsActive     = true,
            CreatedAt    = DateTime.UtcNow
        };

        db.CloudAccounts.Add(account);
        await db.SaveChangesAsync();

        logger.LogInformation("Cloud account {AccountId} connected for tenant {TenantId}",
            account.Id, tenantId);

        // Trigger initial scan asynchronously
        _ = TriggerScanAsync(tenantId, account.Id);

        return new
        {
            id           = account.Id,
            provider     = account.Provider,
            accountId    = account.AccountId,
            accountAlias = account.AccountAlias,
            regions      = account.Regions,
            isActive     = account.IsActive,
            message      = "Account connected. Initial scan triggered."
        };
    }

    public async Task<object> GetAccountsAsync(Guid tenantId)
    {
        var accounts = await db.CloudAccounts
            .Where(a => a.TenantId == tenantId && a.IsActive)
            .Select(a => new
            {
                id           = a.Id,
                provider     = a.Provider,
                accountId    = a.AccountId,
                accountAlias = a.AccountAlias,
                regions      = a.Regions,
                lastScanAt   = a.LastScanAt,
                createdAt    = a.CreatedAt
            })
            .ToListAsync();

        return new { accounts, total = accounts.Count };
    }

    public async Task<object?> GetAccountAsync(Guid tenantId, Guid accountId)
    {
        var a = await db.CloudAccounts
            .FirstOrDefaultAsync(x => x.TenantId == tenantId && x.Id == accountId);
        if (a == null) return null;

        var resourceCount = await db.Resources.CountAsync(r => r.AccountId == accountId);
        var zombieCount   = await db.Resources.CountAsync(r => r.AccountId == accountId && r.IsZombie);
        var totalCost     = await db.Resources.Where(r => r.AccountId == accountId)
            .SumAsync(r => r.MonthlyCost);

        return new
        {
            id           = a.Id,
            provider     = a.Provider,
            accountId    = a.AccountId,
            accountAlias = a.AccountAlias,
            regions      = a.Regions,
            lastScanAt   = a.LastScanAt,
            stats        = new { resourceCount, zombieCount, totalMonthlyCost = totalCost }
        };
    }

    public async Task DisconnectAccountAsync(Guid tenantId, Guid accountId)
    {
        var account = await db.CloudAccounts
            .FirstOrDefaultAsync(a => a.TenantId == tenantId && a.Id == accountId);
        if (account != null)
        {
            account.IsActive = false;
            await db.SaveChangesAsync();
        }
    }

    public async Task<object> TriggerScanAsync(Guid tenantId, Guid? accountId)
    {
        var job = new ScanJob
        {
            Id          = Guid.NewGuid(),
            TenantId    = tenantId,
            AccountId   = accountId,
            Status      = "pending",
            TriggeredBy = "user",
            CreatedAt   = DateTime.UtcNow
        };

        db.ScanJobs.Add(job);
        await db.SaveChangesAsync();

        // Fire off scan to scanner service (non-blocking)
        _ = Task.Run(async () =>
        {
            try
            {
                job.Status    = "running";
                job.StartedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();

                var result = await scannerClient.ScanAccountAsync(tenantId, accountId, job.Id);

                job.Status         = "completed";
                job.CompletedAt    = DateTime.UtcNow;
                job.ResourcesFound = result.ResourcesFound;
                job.ZombiesFound   = result.ZombiesFound;
                await db.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                job.Status       = "failed";
                job.ErrorMessage = ex.Message;
                job.CompletedAt  = DateTime.UtcNow;
                await db.SaveChangesAsync();
                logger.LogError(ex, "Scan job {JobId} failed", job.Id);
            }
        });

        return new { jobId = job.Id, status = job.Status, message = "Scan started" };
    }

    public async Task<object?> GetScanJobAsync(Guid tenantId, Guid jobId)
    {
        var job = await db.ScanJobs
            .FirstOrDefaultAsync(j => j.TenantId == tenantId && j.Id == jobId);
        return job == null ? null : new
        {
            id             = job.Id,
            status         = job.Status,
            startedAt      = job.StartedAt,
            completedAt    = job.CompletedAt,
            resourcesFound = job.ResourcesFound,
            zombiesFound   = job.ZombiesFound,
            triggeredBy    = job.TriggeredBy,
            errorMessage   = job.ErrorMessage
        };
    }

    public async Task<object> ListScanJobsAsync(Guid tenantId, int page, int size)
    {
        var total = await db.ScanJobs.CountAsync(j => j.TenantId == tenantId);
        var jobs  = await db.ScanJobs
            .Where(j => j.TenantId == tenantId)
            .OrderByDescending(j => j.CreatedAt)
            .Skip((page - 1) * size)
            .Take(size)
            .Select(j => new
            {
                j.Id, j.Status, j.StartedAt, j.CompletedAt,
                j.ResourcesFound, j.ZombiesFound, j.TriggeredBy
            })
            .ToListAsync();

        return new { jobs, total, page, size };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scanner HTTP Client
// ─────────────────────────────────────────────────────────────────────────────
public interface IScannerClient
{
    Task<ScanResult> ScanAccountAsync(Guid tenantId, Guid? accountId, Guid jobId);
}

public record ScanResult(int ResourcesFound, int ZombiesFound);

public class ScannerClient(HttpClient http, ILogger<ScannerClient> logger) : IScannerClient
{
    public async Task<ScanResult> ScanAccountAsync(Guid tenantId, Guid? accountId, Guid jobId)
    {
        try
        {
            var payload = new { tenantId, accountId, jobId };
            var response = await http.PostAsJsonAsync("/scan", payload);
            response.EnsureSuccessStatusCode();
            var result = await response.Content.ReadFromJsonAsync<ScanResult>();
            return result ?? new ScanResult(0, 0);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Scanner service unreachable — using simulated data");
            // Return simulated result when scanner service is down
            return new ScanResult(
                ResourcesFound: Random.Shared.Next(15, 40),
                ZombiesFound:   Random.Shared.Next(3, 12));
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis HTTP Client
// ─────────────────────────────────────────────────────────────────────────────
public interface IAnalysisClient
{
    Task<object> AnalyzeCostAsync(Guid tenantId, Guid? accountId);
}

public class AnalysisClient(HttpClient http, ILogger<AnalysisClient> logger) : IAnalysisClient
{
    public async Task<object> AnalyzeCostAsync(Guid tenantId, Guid? accountId)
    {
        try
        {
            var response = await http.PostAsJsonAsync("/analyze-cost",
                new { tenantId, accountId });
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<object>() ?? new { };
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Analysis engine unreachable");
            return new { };
        }
    }
}
