namespace AttendanceSystem.API.DB.Models
{
    public class AttendanceCorrection
    {
        public Guid CorrectionId { get; set; }
        public Guid SessionId { get; set; }
        public string EpfNo { get; set; } = string.Empty;
        public Guid? EmployeeId { get; set; }
        public string? EmployeeName { get; set; }
        public DateOnly WorkDate { get; set; }
        public string? OriginalCheckIn { get; set; }
        public string? OriginalCheckOut { get; set; }
        public string? CorrectedCheckIn { get; set; }
        public string? CorrectedCheckOut { get; set; }
        public string ReasonType { get; set; } = "Site/Circuit";
        public string? Location { get; set; }
        public string? Remarks { get; set; }
        public string Status { get; set; } = "Applied";
        public bool IsActive { get; set; } = true;
        public string? CreatedByUserId { get; set; }
        public string? CreatedByName { get; set; }
        public string? CreatedByEpfNo { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public string? UpdatedByName { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }
}
