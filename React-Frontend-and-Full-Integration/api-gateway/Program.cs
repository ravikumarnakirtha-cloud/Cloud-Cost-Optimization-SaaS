using CloudCostOptimizer.ApiGateway.src.Middleware;
using CloudCostOptimizer.ApiGateway.src.Models;
using CloudCostOptimizer.ApiGateway.src.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using StackExchange.Redis;
using System.Text;

// ── Bootstrap Logger ──────────────────────────────────────────────────────────
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

var builder = WebApplication.CreateBuilder(args);

// ── Serilog ───────────────────────────────────────────────────────────────────
builder.Host.UseSerilog((ctx, lc) => lc
    .WriteTo.Console()
    .ReadFrom.Configuration(ctx.Configuration));

// ── Database (PostgreSQL + EF Core) ──────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(opts =>
    opts.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")).UseSnakeCaseNamingConvention());

// ── Redis Cache ───────────────────────────────────────────────────────────────
var redisConn = Environment.GetEnvironmentVariable("REDIS_URL")
    ?? builder.Configuration.GetConnectionString("Redis")
    ?? "localhost:6379";
if (!redisConn.Contains("abortConnect"))
    redisConn += ",abortConnect=false";
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect(redisConn));
builder.Services.AddStackExchangeRedisCache(opts => opts.Configuration = redisConn);

// ── JWT Auth ──────────────────────────────────────────────────────────────────
var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? throw new InvalidOperationException("JWT Secret not configured");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opts =>
    {
        opts.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer              = builder.Configuration["Jwt:Issuer"],
            ValidAudience            = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
    });

builder.Services.AddAuthorization();

// ── Application Services ──────────────────────────────────────────────────────
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ICloudAccountService, CloudAccountService>();
builder.Services.AddScoped<IResourceService, ResourceService>();
builder.Services.AddScoped<ICostReportService, CostReportService>();
builder.Services.AddScoped<IRecommendationService, RecommendationService>();
builder.Services.AddScoped<IScanJobService, ScanJobService>();
builder.Services.AddHttpClient<IScannerClient, ScannerClient>(c =>
    c.BaseAddress = new Uri(
        builder.Configuration["Services:ScannerServiceUrl"] ?? "http://scanner-service:8001"));
builder.Services.AddHttpClient<IAnalysisClient, AnalysisClient>(c =>
    c.BaseAddress = new Uri(
        builder.Configuration["Services:AnalysisEngineUrl"] ?? "http://analysis-engine:8002"));

// ── CORS ──────────────────────────────────────────────────────────────────────
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:3000"];

builder.Services.AddCors(opts =>
    opts.AddDefaultPolicy(p =>
        p.WithOrigins(allowedOrigins).AllowAnyMethod().AllowAnyHeader().AllowCredentials()));

// ── Swagger ───────────────────────────────────────────────────────────────────
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title   = "Cloud Cost Optimizer API",
        Version = "v1",
        Description = "Production-grade Cloud Cost Optimization SaaS Platform"
    });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type   = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        [new OpenApiSecurityScheme
        {
            Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
        }] = []
    });
});

builder.Services.AddControllers();
builder.Services.AddAutoMapper(typeof(Program));

// ──────────────────────────────────────────────────────────────────────────────
var app = builder.Build();

// ── Middleware Pipeline ───────────────────────────────────────────────────────
app.UseMiddleware<RequestLoggingMiddleware>();
app.UseMiddleware<ExceptionHandlingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "Cloud Cost Optimizer v1"));
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// ── Health check endpoint ─────────────────────────────────────────────────────
app.MapGet("/health", () => new { status = "healthy", timestamp = DateTime.UtcNow });

// ── Auto-migrate on startup ───────────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.Migrate();
        Log.Information("Database migration applied successfully");
    }
    catch (Exception ex)
    {
        Log.Warning(ex, "Database migration failed — make sure DB is running");
    }
}

Log.Information("Cloud Cost Optimizer API Gateway started on port 8000");
app.Run();
