using CloudCostOptimizer.ApiGateway.src.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Newtonsoft.Json;

namespace CloudCostOptimizer.ApiGateway.src.Services;

// ─────────────────────────────────────────────────────────────────────────────
// IResourceService
// ─────────────────────────────────────────────────────────────────────────────
public interface IResourceService
{
    Task<object> ListResourcesAsync(Guid tenantId, string? provider, string? type,
        bool? zombie, string? region, int page, int size);
    Task<object?> GetResourceAsync(Guid tenantId, Guid resourceId);
    Task<object>  GetSummaryAsync(Guid tenantId, Guid? accountId);
    Task<object>  GetCostReportAsync(Guid tenantId, Guid? accountId,
        DateTime? start, DateTime? end);
    Task<object>  GetCostHistoryAsync(Guid tenantId, Guid? accountId, int days);
}

// ─────────────────────────────────────────────────────────────────────────────
// ResourceService
// ─────────────────────────────────────────────────────────────────────────────
public class ResourceService(AppDbContext db, IDistributedCache cache) : IResourceService
{
    public async Task<object> ListResourcesAsync(Guid tenantId, string? provider,
        string? type, bool? zombie, string? region, int page, int size)
    {
        var q = db.Resources.Where(r => r.TenantId == tenantId);

        if (!string.IsNullOrEmpty(provider))
            q = q.Where(r => r.Provider == provider.ToLower());
        if (!string.IsNullOrEmpty(type))
            q = q.Where(r => r.ResourceType == type);
        if (zombie.HasValue)
            q = q.Where(r => r.IsZombie == zombie.Value);
        if (!string.IsNullOrEmpty(region))
            q = q.Where(r => r.Region == region);

        var total = await q.CountAsync();
        var items = await q
            .OrderByDescending(r => r.MonthlyCost)
            .Skip((page - 1) * size)
            .Take(size)
            .Select(r => new
            {
                r.Id, r.Provider, r.ResourceType, r.ResourceId, r.ResourceName,
                r.Region, r.MonthlyCost, r.Status, r.IsZombie, r.ZombieReason,
                r.ScannedAt
            })
            .ToListAsync();

        return new { items, total, page, size };
    }

    public async Task<object?> GetResourceAsync(Guid tenantId, Guid resourceId)
    {
        var r = await db.Resources
            .Include(x => x.CloudAccount)
            .FirstOrDefaultAsync(x => x.TenantId == tenantId && x.Id == resourceId);
        if (r == null) return null;

        return new
        {
            r.Id, r.Provider, r.ResourceType, r.ResourceId, r.ResourceName,
            r.Region, r.MonthlyCost, r.Status, r.IsZombie, r.ZombieReason,
            tags    = r.Tags    != null ? JsonConvert.DeserializeObject(r.Tags)    : null,
            config  = r.Config  != null ? JsonConvert.DeserializeObject(r.Config)  : null,
            metrics = r.Metrics != null ? JsonConvert.DeserializeObject(r.Metrics) : null,
            account = new { r.CloudAccount.AccountAlias, r.CloudAccount.Provider },
            r.FirstSeenAt, r.LastSeenAt, r.ScannedAt
        };
    }

    public async Task<object> GetSummaryAsync(Guid tenantId, Guid? accountId)
    {
        var cacheKey = $"summary:{tenantId}:{accountId}";
        var cached   = await cache.GetStringAsync(cacheKey);
        if (cached != null) return JsonConvert.DeserializeObject<object>(cached)!;

        var q = db.Resources.Where(r => r.TenantId == tenantId);
        if (accountId.HasValue) q = q.Where(r => r.AccountId == accountId.Value);

        var totalResources  = await q.CountAsync();
        var zombieResources = await q.CountAsync(r => r.IsZombie);
        var totalCost       = await q.SumAsync(r => r.MonthlyCost);
        var wastedCost      = await q.Where(r => r.IsZombie).SumAsync(r => r.MonthlyCost);

        var byType = await q.GroupBy(r => r.ResourceType)
            .Select(g => new { type = g.Key, count = g.Count(), cost = g.Sum(r => r.MonthlyCost) })
            .ToListAsync();

        var byProvider = await q.GroupBy(r => r.Provider)
            .Select(g => new { provider = g.Key, count = g.Count(), cost = g.Sum(r => r.MonthlyCost) })
            .ToListAsync();

        var result = new
        {
            totalResources, zombieResources,
            totalMonthlyCost  = Math.Round(totalCost, 2),
            wastedMonthlyCost = Math.Round(wastedCost, 2),
            potentialSavingsPct = totalCost > 0
                ? Math.Round((double)wastedCost / (double)totalCost * 100, 1) : 0.0,
            byType, byProvider
        };

        await cache.SetStringAsync(cacheKey,
            JsonConvert.SerializeObject(result),
            new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5) });

        return result;
    }

    public async Task<object> GetCostReportAsync(Guid tenantId, Guid? accountId,
        DateTime? startDate, DateTime? endDate)
    {
        var start = startDate ?? DateTime.UtcNow.AddMonths(-1);
        var end   = endDate   ?? DateTime.UtcNow;

        var q = db.Resources.Where(r => r.TenantId == tenantId);
        if (accountId.HasValue) q = q.Where(r => r.AccountId == accountId.Value);

        var totalCost  = await q.SumAsync(r => r.MonthlyCost);
        var wastedCost = await q.Where(r => r.IsZombie).SumAsync(r => r.MonthlyCost);

        var byService = await q
            .GroupBy(r => r.ResourceType)
            .Select(g => new
            {
                service        = g.Key,
                resourceCount  = g.Count(),
                totalCost      = g.Sum(r => r.MonthlyCost),
                wastedCost     = g.Where(r => r.IsZombie).Sum(r => r.MonthlyCost)
            })
            .OrderByDescending(x => x.totalCost)
            .ToListAsync();

        var byRegion = await q
            .Where(r => r.Region != null)
            .GroupBy(r => r.Region!)
            .Select(g => new { region = g.Key, cost = g.Sum(r => r.MonthlyCost) })
            .OrderByDescending(x => x.cost)
            .ToListAsync();

        return new
        {
            reportPeriod    = new { start, end },
            totalCost       = Math.Round(totalCost, 2),
            wastedCost      = Math.Round(wastedCost, 2),
            potentialSavings = Math.Round(wastedCost, 2),
            annualProjection = Math.Round(totalCost * 12, 2),
            annualSavings    = Math.Round(wastedCost * 12, 2),
            byService, byRegion
        };
    }

    public async Task<object> GetCostHistoryAsync(Guid tenantId, Guid? accountId, int days)
    {
        var from = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-days));
        var q    = db.CostHistory.Where(h => h.TenantId == tenantId && h.SnapshotDate >= from);
        if (accountId.HasValue) q = q.Where(h => h.AccountId == accountId.Value);

        var history = await q
            .GroupBy(h => h.SnapshotDate)
            .Select(g => new
            {
                date      = g.Key,
                totalCost = g.Sum(h => h.Cost)
            })
            .OrderBy(x => x.date)
            .ToListAsync();

        return new { history, days };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// IRecommendationService
// ─────────────────────────────────────────────────────────────────────────────
public interface IRecommendationService
{
    Task<object> ListAsync(Guid tenantId, string? status, string? priority,
        Guid? accountId, int page, int size);
    Task UpdateStatusAsync(Guid tenantId, Guid id, string status);
    Task<object> GetSavingsSummaryAsync(Guid tenantId);
}

public class RecommendationService(AppDbContext db) : IRecommendationService
{
    public async Task<object> ListAsync(Guid tenantId, string? status, string? priority,
        Guid? accountId, int page, int size)
    {
        var q = db.Recommendations.Where(r => r.TenantId == tenantId);

        if (!string.IsNullOrEmpty(status))   q = q.Where(r => r.Status   == status);
        if (!string.IsNullOrEmpty(priority)) q = q.Where(r => r.Priority == priority);
        if (accountId.HasValue)              q = q.Where(r => r.AccountId == accountId);

        var total = await q.CountAsync();
        var items = await q
            .OrderByDescending(r => r.MonthlySavings)
            .Skip((page - 1) * size)
            .Take(size)
            .Select(r => new
            {
                r.Id, r.Category, r.Priority, r.Title, r.Description,
                r.CurrentCost, r.ProjectedCost, r.MonthlySavings, r.AnnualSavings,
                r.Effort, r.Status, r.ResourceId, r.CreatedAt
            })
            .ToListAsync();

        return new { items, total, page, size };
    }

    public async Task UpdateStatusAsync(Guid tenantId, Guid id, string status)
    {
        var rec = await db.Recommendations
            .FirstOrDefaultAsync(r => r.TenantId == tenantId && r.Id == id);
        if (rec != null)
        {
            rec.Status    = status;
            rec.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
    }

    public async Task<object> GetSavingsSummaryAsync(Guid tenantId)
    {
        var openRecs  = db.Recommendations
            .Where(r => r.TenantId == tenantId && r.Status == "open");

        var total         = await openRecs.CountAsync();
        var monthly       = await openRecs.SumAsync(r => r.MonthlySavings);
        var annual        = await openRecs.SumAsync(r => r.AnnualSavings);
        var byCategory    = await openRecs
            .GroupBy(r => r.Category)
            .Select(g => new
            {
                category       = g.Key,
                count          = g.Count(),
                monthlySavings = g.Sum(r => r.MonthlySavings)
            })
            .OrderByDescending(x => x.monthlySavings)
            .ToListAsync();
        var byPriority    = await openRecs
            .GroupBy(r => r.Priority)
            .Select(g => new { priority = g.Key, count = g.Count() })
            .ToListAsync();

        return new
        {
            totalRecommendations = total,
            totalMonthlySavings  = Math.Round(monthly, 2),
            totalAnnualSavings   = Math.Round(annual, 2),
            byCategory,
            byPriority
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// IScanJobService
// ─────────────────────────────────────────────────────────────────────────────
public interface IScanJobService { }
public class ScanJobService : IScanJobService { }

// ─────────────────────────────────────────────────────────────────────────────
// ICostReportService
// ─────────────────────────────────────────────────────────────────────────────
public interface ICostReportService { }
public class CostReportService : ICostReportService { }
