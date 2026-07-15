using AttendanceSystem.API.DB.Models;
using Microsoft.EntityFrameworkCore;

namespace AttendanceSystem.API.DB
{
    // New standalone database - owns app users and operational diagnostics.
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<AppUser> Users { get; set; }
        public DbSet<AttendanceRuleSetting> AttendanceRuleSettings { get; set; }
        public DbSet<DataSourceHealth> DataSourceHealth { get; set; }
        public DbSet<EmployeeScheduleSnapshot> EmployeeScheduleSnapshots { get; set; }
        public DbSet<EmployeeUserMapping> EmployeeUserMappings { get; set; }
        public DbSet<EmployeeWorkspaceHistory> EmployeeWorkspaceHistories { get; set; }
        public DbSet<MonthlyAttendanceSnapshot> MonthlyAttendanceSnapshots { get; set; }
        public DbSet<MonthlyOTSummarySnapshot> MonthlyOTSummarySnapshots { get; set; }
        public DbSet<ReportGenerationAudit> ReportGenerationAudits { get; set; }
        public DbSet<AttendanceCorrectionSession> AttendanceCorrectionSessions { get; set; }
        public DbSet<AttendanceCorrection> AttendanceCorrections { get; set; }
        public DbSet<LeaveClerkAssignmentAudit> LeaveClerkAssignmentAudits { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.Entity<AppUser>(e =>
            {
                e.HasKey(u => u.Id);
                e.HasIndex(u => u.Username).IsUnique();
                e.HasIndex(u => u.EpfNo);
            });
            modelBuilder.Entity<AttendanceRuleSetting>(e =>
            {
                e.HasKey(r => r.Id);
                e.ToTable("AttendanceRuleSettings");
            });
            modelBuilder.Entity<DataSourceHealth>(e =>
            {
                e.HasKey(h => h.SourceName);
                e.ToTable("DataSourceHealth");
                e.Property(h => h.SourceName).HasMaxLength(50);
                e.Property(h => h.Status).HasMaxLength(30);
                e.Property(h => h.Message).HasMaxLength(500);
            });
            modelBuilder.Entity<EmployeeScheduleSnapshot>(e =>
            {
                e.HasKey(s => s.EmployeeId);
                e.ToTable("EmployeeScheduleSnapshots");
                e.HasIndex(s => s.EpfNo);
                e.Property(s => s.EpfNo).HasMaxLength(20);
                e.Property(s => s.NameWithInitial).HasMaxLength(200);
                e.Property(s => s.DesignationName).HasMaxLength(200);
                e.Property(s => s.AGMWorkSpaceName).HasMaxLength(200);
                e.Property(s => s.DGMWorkSpaceName).HasMaxLength(200);
                e.Property(s => s.ServiceUnitName).HasMaxLength(200);
                e.Property(s => s.ScheduleSource).HasMaxLength(50);
            });
            modelBuilder.Entity<EmployeeUserMapping>(e =>
            {
                e.HasKey(m => m.Id);
                e.ToTable("EmployeeUserMappings");
                e.HasIndex(m => m.UserId).IsUnique();
                e.HasIndex(m => m.EpfNo);
                e.Property(m => m.EpfNo).HasMaxLength(20);
                e.Property(m => m.Username).HasMaxLength(100);
                e.Property(m => m.FullName).HasMaxLength(200);
                e.Property(m => m.Role).HasMaxLength(30);
            });
            modelBuilder.Entity<EmployeeWorkspaceHistory>(e =>
            {
                e.HasKey(h => h.Id);
                e.ToTable("EmployeeWorkspaceHistory");
                e.HasIndex(h => new { h.EpfNo, h.EffectiveFrom });
                e.HasIndex(h => new { h.EmployeeId, h.EffectiveTo });
                e.Property(h => h.EpfNo).HasMaxLength(20);
                e.Property(h => h.EmployeeName).HasMaxLength(200);
                e.Property(h => h.DesignationName).HasMaxLength(200);
                e.Property(h => h.AGMWorkSpaceName).HasMaxLength(200);
                e.Property(h => h.DGMWorkSpaceName).HasMaxLength(200);
                e.Property(h => h.ServiceUnitName).HasMaxLength(200);
                e.Property(h => h.Source).HasMaxLength(50);
            });
            modelBuilder.Entity<MonthlyAttendanceSnapshot>(e =>
            {
                e.HasKey(s => s.Id);
                e.ToTable("MonthlyAttendanceSnapshots");
                e.HasIndex(s => new { s.Year, s.Month, s.EpfNo }).IsUnique();
                e.Property(s => s.EpfNo).HasMaxLength(20);
                e.Property(s => s.Name).HasMaxLength(200);
                e.Property(s => s.Designation).HasMaxLength(200);
                e.Property(s => s.AGMUnit).HasMaxLength(200);
                e.Property(s => s.DGMUnit).HasMaxLength(200);
                e.Property(s => s.ServiceUnit).HasMaxLength(200);
            });
            modelBuilder.Entity<MonthlyOTSummarySnapshot>(e =>
            {
                e.HasKey(s => s.Id);
                e.ToTable("MonthlyOTSummarySnapshots");
                e.HasIndex(s => new { s.Year, s.Month, s.EpfNo }).IsUnique();
                e.Property(s => s.EpfNo).HasMaxLength(20);
                e.Property(s => s.Name).HasMaxLength(200);
                e.Property(s => s.Designation).HasMaxLength(200);
                e.Property(s => s.Unit).HasMaxLength(200);
                e.Property(s => s.AGMUnit).HasMaxLength(200);
                e.Property(s => s.DGMUnit).HasMaxLength(200);
                e.Property(s => s.PayableOTRule).HasMaxLength(50);
            });
            modelBuilder.Entity<ReportGenerationAudit>(e =>
            {
                e.HasKey(a => a.Id);
                e.ToTable("ReportGenerationAudits");
                e.HasIndex(a => new { a.ReportType, a.GeneratedAt });
                e.Property(a => a.ReportType).HasMaxLength(80);
                e.Property(a => a.RequestedBy).HasMaxLength(100);
                e.Property(a => a.RequestedEpfNo).HasMaxLength(20);
                e.Property(a => a.FiltersJson).HasMaxLength(1000);
                e.Property(a => a.Status).HasMaxLength(30);
                e.Property(a => a.Message).HasMaxLength(500);
            });
            modelBuilder.Entity<AttendanceCorrectionSession>(e =>
            {
                e.HasKey(s => s.SessionId);
                e.ToTable("AttendanceCorrectionSessions");
                e.HasIndex(s => s.SessionNo).IsUnique();
                e.HasIndex(s => new { s.FromDate, s.ToDate, s.Status });
                e.Property(s => s.SessionNo).HasMaxLength(30);
                e.Property(s => s.Title).HasMaxLength(200);
                e.Property(s => s.Status).HasMaxLength(30);
                e.Property(s => s.Remarks).HasMaxLength(1000);
                e.Property(s => s.CreatedByUserId).HasMaxLength(80);
                e.Property(s => s.CreatedByName).HasMaxLength(200);
                e.Property(s => s.CreatedByEpfNo).HasMaxLength(20);
                e.Property(s => s.UpdatedByName).HasMaxLength(200);
            });
            modelBuilder.Entity<AttendanceCorrection>(e =>
            {
                e.HasKey(c => c.CorrectionId);
                e.ToTable("AttendanceCorrections");
                e.HasIndex(c => new { c.EpfNo, c.WorkDate, c.IsActive });
                e.HasIndex(c => new { c.EpfNo, c.WorkDate })
                    .IsUnique()
                    .HasFilter("[IsActive] = 1")
                    .HasDatabaseName("UX_AttendanceCorrections_ActiveEpfWorkDate");
                e.HasIndex(c => c.SessionId);
                e.Property(c => c.EpfNo).HasMaxLength(20);
                e.Property(c => c.EmployeeName).HasMaxLength(200);
                e.Property(c => c.OriginalCheckIn).HasMaxLength(20);
                e.Property(c => c.OriginalCheckOut).HasMaxLength(20);
                e.Property(c => c.CorrectedCheckIn).HasMaxLength(20);
                e.Property(c => c.CorrectedCheckOut).HasMaxLength(20);
                e.Property(c => c.ReasonType).HasMaxLength(50);
                e.Property(c => c.Location).HasMaxLength(200);
                e.Property(c => c.Remarks).HasMaxLength(1000);
                e.Property(c => c.Status).HasMaxLength(30);
                e.Property(c => c.CreatedByUserId).HasMaxLength(80);
                e.Property(c => c.CreatedByName).HasMaxLength(200);
                e.Property(c => c.CreatedByEpfNo).HasMaxLength(20);
                e.Property(c => c.UpdatedByName).HasMaxLength(200);
            });
            modelBuilder.Entity<LeaveClerkAssignmentAudit>(e =>
            {
                e.HasKey(a => a.Id);
                e.ToTable("LeaveClerkAssignmentAudits");
                e.HasIndex(a => new { a.EmployeeId, a.ChangedAt });
                e.HasIndex(a => new { a.NewClerkEmployeeId, a.ChangedAt });
                e.Property(a => a.Action).HasMaxLength(30);
                e.Property(a => a.EmployeeEpfNo).HasMaxLength(20);
                e.Property(a => a.PreviousClerkEpfNo).HasMaxLength(20);
                e.Property(a => a.NewClerkEpfNo).HasMaxLength(20);
                e.Property(a => a.ChangedByUserId).HasMaxLength(80);
                e.Property(a => a.ChangedByName).HasMaxLength(200);
                e.Property(a => a.ChangedByEpfNo).HasMaxLength(20);
                e.Property(a => a.Remarks).HasMaxLength(500);
            });
        }
    }
}
