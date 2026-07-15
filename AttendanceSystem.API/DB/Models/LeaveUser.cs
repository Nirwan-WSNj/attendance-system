namespace AttendanceSystem.API.DB.Models
{
    public class LeaveUser
    {
        public Guid UserId { get; set; }
        public Guid EmployeeId { get; set; }
        public string EPFNo { get; set; } = string.Empty;
        public bool IsActive { get; set; }
    }
}
