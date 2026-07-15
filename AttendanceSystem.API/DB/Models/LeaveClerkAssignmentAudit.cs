namespace AttendanceSystem.API.DB.Models
{
    public class LeaveClerkAssignmentAudit
    {
        public Guid Id { get; set; }
        public string Action { get; set; } = string.Empty;
        public Guid EmployeeId { get; set; }
        public string? EmployeeEpfNo { get; set; }
        public Guid? PreviousClerkEmployeeId { get; set; }
        public string? PreviousClerkEpfNo { get; set; }
        public Guid? NewClerkEmployeeId { get; set; }
        public string? NewClerkEpfNo { get; set; }
        public string? ChangedByUserId { get; set; }
        public string? ChangedByName { get; set; }
        public string? ChangedByEpfNo { get; set; }
        public string? Remarks { get; set; }
        public DateTime ChangedAt { get; set; }
    }
}
