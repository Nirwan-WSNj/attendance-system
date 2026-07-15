namespace AttendanceSystem.API.DB.Models
{
    public class ReportGenerationAudit
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string ReportType { get; set; } = string.Empty;
        public string? RequestedBy { get; set; }
        public string? RequestedEpfNo { get; set; }
        public DateTime? FromDate { get; set; }
        public DateTime? ToDate { get; set; }
        public int? Year { get; set; }
        public int? Month { get; set; }
        public string? FiltersJson { get; set; }
        public int? RowCount { get; set; }
        public string Status { get; set; } = "OK";
        public string? Message { get; set; }
        public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    }
}
