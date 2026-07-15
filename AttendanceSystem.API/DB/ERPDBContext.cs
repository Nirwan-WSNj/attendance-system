using CECBERP.CMN.Business.Entities;
using CECBERP.CMN.Business.Entities.CMN;
using Microsoft.EntityFrameworkCore;

namespace AttendanceSystem.API.DB
{
    public class ERPDBContext : DbContext
    {
        public ERPDBContext(DbContextOptions<ERPDBContext> options) : base(options) { }

        public DbSet<EmployeeVersion> employeeVersions { get; set; }
        public DbSet<Designation> designations { get; set; }
        public DbSet<WorkSpace> workSpaces { get; set; }
        public DbSet<WorkSpaceType> WorkSpaceTypes { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
        }
    }
}
