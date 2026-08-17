// ─────────────────────────────────────────────────────────────────────────────
// ResourcesController.cs
// ─────────────────────────────────────────────────────────────────────────────
using CloudCostOptimizer.ApiGateway.src.Models;
using CloudCostOptimizer.ApiGateway.src.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CloudCostOptimizer.ApiGateway.src.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class ResourcesController(IResourceService svc) : ControllerBase
{
    private Guid TenantId =>
        Guid.Parse(User.FindFirst("tenant_id")?.Value!);

    /// <summary>List all scanned resources (paginated + filtered)</summary>
    [HttpGet("resources")]
    public async Task<IActionResult> List(
        [FromQuery] string?  provider     = null,
        [FromQuery] string?  resourceType = null,
        [FromQuery] bool?    zombie       = null,
        [FromQuery] string?  region       = null,
        [FromQuery] int      page         = 1,
        [FromQuery] int      size         = 50)
    {
        var result = await svc.ListResourcesAsync(TenantId, provider, resourceType, zombie, region, page, size);
        return Ok(result);
    }

    /// <summary>Get a single resource detail</summary>
    [HttpGet("resources/{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var resource = await svc.GetResourceAsync(TenantId, id);
        return resource == null ? NotFound() : Ok(resource);
    }

    /// <summary>Summary stats for the tenant</summary>
    [HttpGet("resources/summary")]
    public async Task<IActionResult> Summary([FromQuery] Guid? accountId = null)
    {
        var summary = await svc.GetSummaryAsync(TenantId, accountId);
        return Ok(summary);
    }

    /// <summary>Get cost report</summary>
    [HttpGet("get-cost-report")]
    public async Task<IActionResult> GetCostReport(
        [FromQuery] Guid?    accountId  = null,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate   = null)
    {
        var report = await svc.GetCostReportAsync(TenantId, accountId, startDate, endDate);
        return Ok(report);
    }

    /// <summary>Cost trend history for charts</summary>
    [HttpGet("cost-history")]
    public async Task<IActionResult> CostHistory(
        [FromQuery] Guid? accountId = null,
        [FromQuery] int   days      = 30)
    {
        var history = await svc.GetCostHistoryAsync(TenantId, accountId, days);
        return Ok(history);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RecommendationsController.cs
// ─────────────────────────────────────────────────────────────────────────────
[ApiController]
[Route("api")]
[Authorize]
public class RecommendationsController(IRecommendationService svc) : ControllerBase
{
    private Guid TenantId =>
        Guid.Parse(User.FindFirst("tenant_id")?.Value!);

    /// <summary>Get all recommendations</summary>
    [HttpGet("get-recommendations")]
    public async Task<IActionResult> Get(
        [FromQuery] string? status   = null,
        [FromQuery] string? priority = null,
        [FromQuery] Guid?   accountId = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     size     = 50)
    {
        var recs = await svc.ListAsync(TenantId, status, priority, accountId, page, size);
        return Ok(recs);
    }

    /// <summary>Apply a recommendation (mark as done)</summary>
    [HttpPatch("recommendations/{id:guid}/apply")]
    public async Task<IActionResult> Apply(Guid id)
    {
        await svc.UpdateStatusAsync(TenantId, id, "applied");
        return Ok(new { message = "Recommendation marked as applied" });
    }

    /// <summary>Dismiss a recommendation</summary>
    [HttpPatch("recommendations/{id:guid}/dismiss")]
    public async Task<IActionResult> Dismiss(Guid id)
    {
        await svc.UpdateStatusAsync(TenantId, id, "dismissed");
        return Ok(new { message = "Recommendation dismissed" });
    }

    /// <summary>Savings summary across all open recommendations</summary>
    [HttpGet("recommendations/savings-summary")]
    public async Task<IActionResult> SavingsSummary()
    {
        var summary = await svc.GetSavingsSummaryAsync(TenantId);
        return Ok(summary);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AlertsController.cs
// ─────────────────────────────────────────────────────────────────────────────
[ApiController]
[Route("api/alerts")]
[Authorize]
public class AlertsController(AppDbContext db) : ControllerBase
{
    private Guid TenantId =>
        Guid.Parse(User.FindFirst("tenant_id")?.Value!);

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var alerts = await db.Alerts
            .Where(a => a.TenantId == TenantId)
            .OrderByDescending(a => a.CreatedAt)
            .Take(50)
            .Select(a => new { a.Id, a.Type, a.Severity, a.Title, a.Message, a.IsRead, a.CreatedAt })
            .ToListAsync();
        return Ok(new { alerts });
    }

    [HttpPatch("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        var alert = await db.Alerts.FirstOrDefaultAsync(a => a.TenantId == TenantId && a.Id == id);
        if (alert == null) return NotFound();
        alert.IsRead = true;
        await db.SaveChangesAsync();
        return Ok();
    }
}
