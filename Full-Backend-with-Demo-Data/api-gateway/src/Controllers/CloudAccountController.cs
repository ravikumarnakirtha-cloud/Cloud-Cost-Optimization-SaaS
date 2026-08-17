// ─────────────────────────────────────────────────────────────────────────────
// CloudAccountController.cs
// ─────────────────────────────────────────────────────────────────────────────
using CloudCostOptimizer.ApiGateway.src.Models;
using CloudCostOptimizer.ApiGateway.src.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace CloudCostOptimizer.ApiGateway.src.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class CloudAccountController(ICloudAccountService svc) : ControllerBase
{
    private Guid TenantId =>
        Guid.Parse(User.FindFirst("tenant_id")?.Value ?? throw new UnauthorizedAccessException());

    /// <summary>Connect a new cloud account (AWS or Azure)</summary>
    [HttpPost("connect-cloud")]
    public async Task<IActionResult> ConnectCloud([FromBody] ConnectCloudRequest req)
    {
        var result = await svc.ConnectAccountAsync(TenantId, req);
        return Ok(result);
    }

    /// <summary>List all cloud accounts for the tenant</summary>
    [HttpGet("cloud-accounts")]
    public async Task<IActionResult> GetAccounts()
    {
        var accounts = await svc.GetAccountsAsync(TenantId);
        return Ok(accounts);
    }

    /// <summary>Get single account details</summary>
    [HttpGet("cloud-accounts/{id:guid}")]
    public async Task<IActionResult> GetAccount(Guid id)
    {
        var account = await svc.GetAccountAsync(TenantId, id);
        return account == null ? NotFound() : Ok(account);
    }

    /// <summary>Disconnect (deactivate) a cloud account</summary>
    [HttpDelete("cloud-accounts/{id:guid}")]
    public async Task<IActionResult> DeleteAccount(Guid id)
    {
        await svc.DisconnectAccountAsync(TenantId, id);
        return NoContent();
    }

    /// <summary>Trigger a manual resource scan for an account</summary>
    [HttpPost("scan-resources")]
    public async Task<IActionResult> ScanResources([FromBody] ScanRequest req)
    {
        var job = await svc.TriggerScanAsync(TenantId, req.AccountId);
        return Accepted(job);
    }

    /// <summary>Get scan job status</summary>
    [HttpGet("scan-jobs/{jobId:guid}")]
    public async Task<IActionResult> GetScanJob(Guid jobId)
    {
        var job = await svc.GetScanJobAsync(TenantId, jobId);
        return job == null ? NotFound() : Ok(job);
    }

    /// <summary>List recent scan jobs</summary>
    [HttpGet("scan-jobs")]
    public async Task<IActionResult> ListScanJobs([FromQuery] int page = 1, [FromQuery] int size = 20)
    {
        var jobs = await svc.ListScanJobsAsync(TenantId, page, size);
        return Ok(jobs);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────
public record ConnectCloudRequest(
    string   Provider,        // aws | azure
    string   AccountId,       // AWS account ID or Azure subscription ID
    string?  AccountAlias,
    string[] Regions,
    string?  AccessKeyId,     // AWS
    string?  SecretAccessKey, // AWS
    string?  TenantIdAzure,   // Azure tenant ID
    string?  ClientId,        // Azure service principal
    string?  ClientSecret);   // Azure service principal secret

public record ScanRequest(Guid? AccountId);
