namespace AttendanceSystem.API.DB.Models
{
    public class AttendanceCorrectionSession
    {
        public Guid SessionId { get; set; }
        public string SessionNo { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public DateOnly FromDate { get; set; }
        public DateOnly ToDate { get; set; }
        public string Status { get; set; } = "Applied";
        public string? Remarks { get; set; }
        public string? CreatedByUserId { get; set; }
        public string? CreatedByName { get; set; }
        public string? CreatedByEpfNo { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAt { get; set; }
        public string? UpdatedByName { get; set; }
    }
}
