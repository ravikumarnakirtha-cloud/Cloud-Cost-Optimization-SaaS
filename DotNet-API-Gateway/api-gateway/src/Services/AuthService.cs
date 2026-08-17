using BCrypt.Net;
using CloudCostOptimizer.ApiGateway.src.Controllers;
using CloudCostOptimizer.ApiGateway.src.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace CloudCostOptimizer.ApiGateway.src.Services;

public interface IAuthService
{
    Task<object?> LoginAsync(string email, string password);
    Task<AuthResult> RegisterAsync(RegisterRequest req);
    Task<object?> GetUserProfileAsync(Guid userId);
    Task<string> RefreshTokenAsync(Guid userId);
}

public class AuthService(AppDbContext db, IConfiguration config) : IAuthService
{
    // ── Login ─────────────────────────────────────────────────────────────────
    public async Task<object?> LoginAsync(string email, string password)
    {
        var user = await db.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(u => u.Email == email && u.IsActive);

        if (user == null) return null;
        if (!BCrypt.Net.BCrypt.Verify(password, user.PasswordHash)) return null;

        var token = GenerateToken(user);
        return new
        {
            token,
            user = new
            {
                id       = user.Id,
                email    = user.Email,
                fullName = user.FullName,
                role     = user.Role,
                tenantId = user.TenantId,
                tenant   = user.Tenant?.Name
            }
        };
    }

    // ── Register ──────────────────────────────────────────────────────────────
    public async Task<AuthResult> RegisterAsync(RegisterRequest req)
    {
        if (await db.Users.AnyAsync(u => u.Email == req.Email))
            return new AuthResult(false, "Email already in use");

        Guid tenantId;

        if (req.TenantId.HasValue)
        {
            // Join existing tenant
            if (!await db.Tenants.AnyAsync(t => t.Id == req.TenantId.Value))
                return new AuthResult(false, "Tenant not found");
            tenantId = req.TenantId.Value;
        }
        else
        {
            // Create new tenant
            var tenant = new Tenant
            {
                Id        = Guid.NewGuid(),
                Name      = req.TenantName ?? $"{req.FullName}'s Org",
                Plan      = "free",
                CreatedAt = DateTime.UtcNow
            };
            db.Tenants.Add(tenant);
            tenantId = tenant.Id;
        }

        var user = new User
        {
            Id           = Guid.NewGuid(),
            Email        = req.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            FullName     = req.FullName,
            TenantId     = tenantId,
            Role         = "user",
            CreatedAt    = DateTime.UtcNow,
            UpdatedAt    = DateTime.UtcNow
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        var token = GenerateToken(user);
        return new AuthResult(true, "Registration successful", token,
            new { user.Id, user.Email, user.FullName, user.TenantId });
    }

    // ── Profile ───────────────────────────────────────────────────────────────
    public async Task<object?> GetUserProfileAsync(Guid userId)
    {
        var user = await db.Users.Include(u => u.Tenant)
            .FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null) return null;
        return new
        {
            id       = user.Id,
            email    = user.Email,
            fullName = user.FullName,
            role     = user.Role,
            tenantId = user.TenantId,
            tenant   = new { user.Tenant?.Id, user.Tenant?.Name, user.Tenant?.Plan },
            createdAt = user.CreatedAt
        };
    }

    // ── Refresh ───────────────────────────────────────────────────────────────
    public async Task<string> RefreshTokenAsync(Guid userId)
    {
        var user = await db.Users.FindAsync(userId)
            ?? throw new KeyNotFoundException("User not found");
        return GenerateToken(user);
    }

    // ── JWT Generation ────────────────────────────────────────────────────────
    private string GenerateToken(User user)
    {
        var key       = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Secret"]!));
        var creds     = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiryMin = int.Parse(config["Jwt:ExpiryMinutes"] ?? "1440");

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub,   user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim("tenant_id",                   user.TenantId.ToString()),
            new Claim(ClaimTypes.Role,               user.Role),
            new Claim(JwtRegisteredClaimNames.Jti,   Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer:             config["Jwt:Issuer"],
            audience:           config["Jwt:Audience"],
            claims:             claims,
            expires:            DateTime.UtcNow.AddMinutes(expiryMin),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
