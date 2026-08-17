// ─────────────────────────────────────────────────────────────────────────────
// AuthController.cs
// ─────────────────────────────────────────────────────────────────────────────
using CloudCostOptimizer.ApiGateway.src.Models;
using CloudCostOptimizer.ApiGateway.src.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CloudCostOptimizer.ApiGateway.src.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(IAuthService authService) : ControllerBase
{
    /// <summary>Login — returns JWT token</summary>
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var result = await authService.LoginAsync(req.Email, req.Password);
        if (result == null)
            return Unauthorized(new { message = "Invalid email or password" });
        return Ok(result);
    }

    /// <summary>Register new user under a tenant</summary>
    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        var result = await authService.RegisterAsync(req);
        if (!result.Success)
            return BadRequest(new { message = result.Message });
        return Ok(result);
    }

    /// <summary>Get current user profile</summary>
    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var userId = User.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        var user = await authService.GetUserProfileAsync(Guid.Parse(userId));
        return Ok(user);
    }

    /// <summary>Refresh token</summary>
    [Authorize]
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh()
    {
        var userId = User.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        var token = await authService.RefreshTokenAsync(Guid.Parse(userId));
        return Ok(new { token });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────
public record LoginRequest(string Email, string Password);

public record RegisterRequest(
    string Email,
    string Password,
    string FullName,
    string? TenantName = null,    // create new tenant
    Guid?   TenantId   = null);   // join existing tenant

public record AuthResult(
    bool   Success,
    string Message  = "",
    string Token    = "",
    object? User    = null);
