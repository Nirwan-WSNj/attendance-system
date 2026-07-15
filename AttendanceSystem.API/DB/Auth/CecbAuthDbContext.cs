using Microsoft.EntityFrameworkCore;

namespace AttendanceSystem.API.DB.Auth
{
    public class CecbAuthDbContext : DbContext
    {
        public CecbAuthDbContext(DbContextOptions<CecbAuthDbContext> options) : base(options)
        {
        }

        public DbSet<CecbAuthUser> Users => Set<CecbAuthUser>();
        public DbSet<CecbAuthUserWorkUnit> UserWorkUnits => Set<CecbAuthUserWorkUnit>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<CecbAuthUser>(entity =>
            {
                entity.ToTable("User");
                entity.HasKey(x => x.UserId);
                entity.Property(x => x.EPFNo).HasMaxLength(10);
            });

            modelBuilder.Entity<CecbAuthUserWorkUnit>(entity =>
            {
                entity.ToTable("UserWorkUnit");
                entity.HasKey(x => x.UserWorkUnitId);
                entity.HasIndex(x => new { x.UserId, x.WorkUnitId });
            });
        }
    }
}
