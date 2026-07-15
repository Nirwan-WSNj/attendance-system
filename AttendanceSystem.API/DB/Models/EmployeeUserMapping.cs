namespace AttendanceSystem.API.DB.Models
{
    public class EmployeeUserMapping
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public Guid? EmployeeId { get; set; }
        public string EpfNo { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string? FullName { get; set; }
        public string Role { get; set; } = "Employee";
        public bool IsActive { get; set; } = true;
        public DateTime LinkedAt { get; set; } = DateTime.UtcNow;
        public DateTime LastSyncedAt { get; set; } = DateTime.UtcNow;
    }
}
