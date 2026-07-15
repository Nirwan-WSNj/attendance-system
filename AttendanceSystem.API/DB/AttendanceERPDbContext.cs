using AttendanceSystem.API.DB.Models;
using Microsoft.EntityFrameworkCore;

namespace AttendanceSystem.API.DB
{
    public class AttendanceERPDbContext : DbContext
    {
        public AttendanceERPDbContext(DbContextOptions<AttendanceERPDbContext> options) : base(options) { }

        public DbSet<FPData> FPDataset { get; set; }
        public DbSet<FPuserList> FPuserlist { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.Entity<FPData>(e => { e.ToTable("FPDataset"); e.HasKey(x => x.Id); });
            modelBuilder.Entity<FPuserList>(e => { e.ToTable("FPuserlist"); e.HasKey(x => x.id); });
        }
    }
}
