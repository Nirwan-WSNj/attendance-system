namespace AttendanceSystem.API.DB.Models
{
    public class MonthlyOTSummarySnapshot
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public int Year { get; set; }
        public int Month { get; set; }
        public string EpfNo { get; set; } = string.Empty;
        public string? Name { get; set; }
        public string? Designation { get; set; }
        public string? Unit { get; set; }
        public string? AGMUnit { get; set; }
        public string? DGMUnit { get; set; }
        public int OTDays { get; set; }
        public double TotalOTHours { get; set; }
        public double PayableOTHours { get; set; }
        public bool IsEngineerPayCategory { get; set; }
        public string PayableOTRule { get; set; } = "NORMAL";
        public DateTime SourceFromDate { get; set; }
        public DateTime SourceToDate { get; set; }
        public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    }
}
