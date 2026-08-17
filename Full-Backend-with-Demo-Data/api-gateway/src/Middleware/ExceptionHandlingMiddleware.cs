using System.Net;
using System.Text.Json;

namespace CloudCostOptimizer.ApiGateway.src.Middleware;

// ─────────────────────────────────────────────────────────────────────────────
// Global Exception Handler
// ─────────────────────────────────────────────────────────────────────────────
public class ExceptionHandlingMiddleware(RequestDelegate next,
    ILogger<ExceptionHandlingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled exception: {Message}", ex.Message);
            await HandleExceptionAsync(context, ex);
        }
    }

    private static Task HandleExceptionAsync(HttpContext ctx, Exception ex)
    {
        var (status, message) = ex switch
        {
            KeyNotFoundException    => (HttpStatusCode.NotFound,            ex.Message),
            UnauthorizedAccessException => (HttpStatusCode.Unauthorized,   "Unauthorized"),
            ArgumentException       => (HttpStatusCode.BadRequest,          ex.Message),
            _                       => (HttpStatusCode.InternalServerError, "An unexpected error occurred")
        };

        ctx.Response.ContentType = "application/json";
        ctx.Response.StatusCode  = (int)status;

        return ctx.Response.WriteAsync(JsonSerializer.Serialize(new
        {
            error     = message,
            statusCode = (int)status,
            timestamp = DateTime.UtcNow
        }));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Request Logging Middleware
// ─────────────────────────────────────────────────────────────────────────────
public class RequestLoggingMiddleware(RequestDelegate next,
    ILogger<RequestLoggingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var start = DateTime.UtcNow;
        await next(context);
        var elapsed = (DateTime.UtcNow - start).TotalMilliseconds;

        logger.LogInformation("{Method} {Path} → {StatusCode} ({Elapsed:F0}ms)",
            context.Request.Method,
            context.Request.Path,
            context.Response.StatusCode,
            elapsed);
    }
}
