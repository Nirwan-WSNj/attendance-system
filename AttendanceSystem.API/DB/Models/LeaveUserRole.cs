namespace AttendanceSystem.API.DB.Models
{
    public class LeaveUserRole
    {
        public Guid UserRoleId { get; set; }
        public Guid UserId { get; set; }
        public Guid RoleId { get; set; }
    }
}
