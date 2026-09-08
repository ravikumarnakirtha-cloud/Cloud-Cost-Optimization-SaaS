using Microsoft.EntityFrameworkCore;

namespace CloudCostOptimizer.ApiGateway.src.Models;

// ─────────────────────────────────────────────────────────────────────────────
// EF Core DbContext
// ─────────────────────────────────────────────────────────────────────────────
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Tenant>         Tenants         { get; set; }
    public DbSet<User>           Users           { get; set; }
    public DbSet<CloudAccount>   CloudAccounts   { get; set; }
    public DbSet<Resource>       Resources       { get; set; }
    public DbSet<ScanJob>        ScanJobs        { get; set; }
    public DbSet<CostReport>     CostReports     { get; set; }
    public DbSet<Recommendation> Recommendations { get; set; }
    public DbSet<CostHistory>    CostHistory     { get; set; }
    public DbSet<Alert>          Alerts          { get; set; }

    protected override void OnModelCreating(ModelBuilder mb)
    {
        base.OnModelCreating(mb);

        // snake_case table names (matches SQL schema)
        mb.Entity<Tenant>().ToTable("tenants");
        mb.Entity<User>().ToTable("users");
        mb.Entity<CloudAccount>().ToTable("cloud_accounts");
        mb.Entity<Resource>().ToTable("resources");
        mb.Entity<ScanJob>().ToTable("scan_jobs");
        mb.Entity<CostReport>().ToTable("cost_reports");
        mb.Entity<Recommendation>().ToTable("recommendations");
        mb.Entity<CostHistory>().ToTable("cost_history");
        mb.Entity<Alert>().ToTable("alerts");

        // JSONB columns mapped as strings
        mb.Entity<CloudAccount>()
            .Property(e => e.Credentials).HasColumnType("jsonb");
        mb.Entity<Resource>()
            .Property(e => e.Tags).HasColumnType("jsonb");
        mb.Entity<Resource>()
            .Property(e => e.Config).HasColumnType("jsonb");
        mb.Entity<Resource>()
            .Property(e => e.Metrics).HasColumnType("jsonb");
        mb.Entity<Recommendation>()
            .Property(e => e.Metadata).HasColumnType("jsonb");
        mb.Entity<CostReport>()
            .Property(e => e.CostBreakdown).HasColumnType("jsonb");

        // Relationships
        mb.Entity<User>()
            .HasOne(u => u.Tenant)
            .WithMany(t => t.Users)
            .HasForeignKey(u => u.TenantId);

        mb.Entity<CloudAccount>()
            .HasOne(ca => ca.Tenant)
            .WithMany(t => t.CloudAccounts)
            .HasForeignKey(ca => ca.TenantId);

        mb.Entity<Resource>()
            .HasOne(r => r.CloudAccount)
            .WithMany(ca => ca.Resources)
            .HasForeignKey(r => r.AccountId);

        mb.Entity<Recommendation>()
            .HasOne(r => r.Resource)
            .WithMany()
            .HasForeignKey(r => r.ResourceId)
            .IsRequired(false);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity Models
// ─────────────────────────────────────────────────────────────────────────────
public class Tenant
{
    public Guid     Id        { get; set; }
    public string   Name      { get; set; } = "";
    public string   Plan      { get; set; } = "free";
    public DateTime CreatedAt { get; set; }
    public ICollection<User>         Users        { get; set; } = [];
    public ICollection<CloudAccount> CloudAccounts{ get; set; } = [];
}

public class User
{
    public Guid     Id           { get; set; }
    public string   Email        { get; set; } = "";
    public string   PasswordHash { get; set; } = "";
    public string?  FullName     { get; set; }
    public string   Role         { get; set; } = "user";
    public Guid     TenantId     { get; set; }
    public bool     IsActive     { get; set; } = true;
    public DateTime CreatedAt    { get; set; }
    public DateTime UpdatedAt    { get; set; }
    public Tenant   Tenant       { get; set; } = null!;
}

public class CloudAccount
{
    public Guid      Id           { get; set; }
    public Guid      TenantId     { get; set; }
    public string    Provider     { get; set; } = "";  // aws | azure
    public string?   AccountAlias { get; set; }
    public string    AccountId    { get; set; } = "";
    public string?   Credentials  { get; set; }         // JSONB
    public string[]  Regions      { get; set; } = [];
    public bool      IsActive     { get; set; } = true;
    public DateTime? LastScanAt   { get; set; }
    public DateTime  CreatedAt    { get; set; }
    public Tenant    Tenant       { get; set; } = null!;
    public ICollection<Resource> Resources { get; set; } = [];
}

public class Resource
{
    public Guid     Id           { get; set; }
    public Guid     TenantId     { get; set; }
    public Guid     AccountId    { get; set; }
    public string   Provider     { get; set; } = "";
    public string   ResourceType { get; set; } = "";
    public string   ResourceId   { get; set; } = "";
    public string?  ResourceName { get; set; }
    public string?  Region       { get; set; }
    public string?  Tags         { get; set; }     // JSONB
    public string?  Config       { get; set; }     // JSONB
    public string?  Metrics      { get; set; }     // JSONB
    public decimal  MonthlyCost  { get; set; }
    public string   Status       { get; set; } = "active";
    public bool     IsZombie     { get; set; }
    public string?  ZombieReason { get; set; }
    public DateTime FirstSeenAt  { get; set; }
    public DateTime LastSeenAt   { get; set; }
    public DateTime ScannedAt    { get; set; }
    public CloudAccount CloudAccount { get; set; } = null!;
}

public class ScanJob
{
    public Guid      Id             { get; set; }
    public Guid      TenantId       { get; set; }
    public Guid?     AccountId      { get; set; }
    public string    Status         { get; set; } = "pending";
    public DateTime? StartedAt      { get; set; }
    public DateTime? CompletedAt    { get; set; }
    public int       ResourcesFound { get; set; }
    public int       ZombiesFound   { get; set; }
    public string?   ErrorMessage   { get; set; }
    public string    TriggeredBy    { get; set; } = "scheduler";
    public DateTime  CreatedAt      { get; set; }
}

public class CostReport
{
    public Guid     Id                { get; set; }
    public Guid     TenantId          { get; set; }
    public Guid?    AccountId         { get; set; }
    public DateOnly ReportPeriodStart { get; set; }
    public DateOnly ReportPeriodEnd   { get; set; }
    public decimal  TotalCost         { get; set; }
    public decimal  WastedCost        { get; set; }
    public decimal  PotentialSavings  { get; set; }
    public string?  CostBreakdown     { get; set; }  // JSONB
    public DateTime GeneratedAt       { get; set; }
}

public class Recommendation
{
    public Guid     Id             { get; set; }
    public Guid     TenantId       { get; set; }
    public Guid?    ResourceId     { get; set; }
    public Guid?    AccountId      { get; set; }
    public string   Category       { get; set; } = "";
    public string   Priority       { get; set; } = "medium";
    public string   Title          { get; set; } = "";
    public string?  Description    { get; set; }
    public decimal  CurrentCost    { get; set; }
    public decimal  ProjectedCost  { get; set; }
    public decimal  MonthlySavings { get; set; }
    public decimal  AnnualSavings  { get; set; }
    public string   Effort         { get; set; } = "low";
    public string   Status         { get; set; } = "open";
    public string?  Metadata       { get; set; }  // JSONB
    public DateTime CreatedAt      { get; set; }
    public DateTime UpdatedAt      { get; set; }
    public Resource? Resource      { get; set; }
}

public class CostHistory
{
    public Guid     Id           { get; set; }
    public Guid     TenantId     { get; set; }
    public Guid?    AccountId    { get; set; }
    public DateOnly SnapshotDate { get; set; }
    public string?  Service      { get; set; }
    public string?  Region       { get; set; }
    public decimal  Cost         { get; set; }
    public DateTime CreatedAt    { get; set; }
}

public class Alert
{
    public Guid     Id        { get; set; }
    public Guid     TenantId  { get; set; }
    public string   Type      { get; set; } = "";
    public string   Severity  { get; set; } = "info";
    public string?  Title     { get; set; }
    public string?  Message   { get; set; }
    public string?  Metadata  { get; set; }
    public bool     IsRead    { get; set; }
    public DateTime CreatedAt { get; set; }
}
