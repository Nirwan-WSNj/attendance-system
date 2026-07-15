using AttendanceSystem.API.Repository;

namespace AttendanceSystem.API.Services
{
    public class CacheWarmupService : BackgroundService
    {
        private readonly IServiceProvider _services;
        private readonly ILogger<CacheWarmupService> _logger;

        public CacheWarmupService(IServiceProvider services, ILogger<CacheWarmupService> logger)
        {
            _services = services;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Small delay so the app is fully ready before we hit the databases
            await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);

            _logger.LogInformation("Cache warmup: loading employee list...");
            var sw = System.Diagnostics.Stopwatch.StartNew();

            try
            {
                using var scope = _services.CreateScope();
                var repo = scope.ServiceProvider.GetRequiredService<AttendanceRepository>();
                await repo.GetEmployeesAsync();
                sw.Stop();
                _logger.LogInformation("Cache warmup done in {ElapsedMs}ms.", sw.ElapsedMilliseconds);
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Cache warmup failed: {Message}", ex.Message);
            }
        }
    }
}
