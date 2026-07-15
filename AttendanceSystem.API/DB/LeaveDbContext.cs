using AttendanceSystem.API.DB.Models;
using Microsoft.EntityFrameworkCore;

namespace AttendanceSystem.API.DB
{
    public class LeaveDbContext : DbContext
    {
        public LeaveDbContext(DbContextOptions<LeaveDbContext> options) : base(options) { }

        public DbSet<LeaveInOutTime> InOutTimes { get; set; }
        public DbSet<AssignedEmployee> AssignedEmployees { get; set; }
        public DbSet<LeaveUser> Users { get; set; }
        public DbSet<LeaveRole> Roles { get; set; }
        public DbSet<LeaveUserRole> UserRoles { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.Entity<LeaveInOutTime>(e => { e.ToTable("InOutTimes"); e.HasKey(x => x.InOutId); });
            modelBuilder.Entity<AssignedEmployee>(e =>
            {
                e.ToTable("AssignedEmployee");
                e.HasKey(x => x.AssignedId);
                e.HasIndex(x => x.EmployeeId);
                e.HasIndex(x => x.ApproverId);
                e.HasIndex(x => x.RecommenderId);
                e.HasIndex(x => x.LeaveClerkEmployeeId);
            });
            modelBuilder.Entity<LeaveUser>(e =>
            {
                e.ToTable("User");
                e.HasKey(x => x.UserId);
                e.HasIndex(x => x.EmployeeId);
                e.HasIndex(x => x.EPFNo);
                e.Property(x => x.EPFNo).HasMaxLength(50);
            });
            modelBuilder.Entity<LeaveRole>(e =>
            {
                e.ToTable("Role");
                e.HasKey(x => x.RoleId);
                e.Property(x => x.RoleName).HasMaxLength(100);
            });
            modelBuilder.Entity<LeaveUserRole>(e =>
            {
                e.ToTable("UserRole");
                e.HasKey(x => x.UserRoleId);
                e.HasIndex(x => new { x.UserId, x.RoleId });
            });
        }
    }
}
