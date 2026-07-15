using AttendanceSystem.API.DB.Models;
using Microsoft.EntityFrameworkCore;

namespace AttendanceSystem.API.DB
{
    public class TimeNetDbContext : DbContext
    {
        public TimeNetDbContext(DbContextOptions<TimeNetDbContext> options) : base(options) { }

        public DbSet<TimeNetPunch> att_punches { get; set; }
        public DbSet<TimeNetEmployee> hr_employee { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.Entity<TimeNetPunch>(e => { e.ToTable("att_punches"); e.HasKey(x => x.id); });
            modelBuilder.Entity<TimeNetEmployee>(e => { e.ToTable("hr_employee"); e.HasKey(x => x.id); });
        }
    }
}
