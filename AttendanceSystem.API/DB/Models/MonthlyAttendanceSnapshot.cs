namespace AttendanceSystem.API.DB.Models
{
    public class MonthlyAttendanceSnapshot
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public int Year { get; set; }
        public int Month { get; set; }
        public string EpfNo { get; set; } = string.Empty;
        public string? Name { get; set; }
        public string? Designation { get; set; }
        public string? AGMUnit { get; set; }
        public string? DGMUnit { get; set; }
        public string? ServiceUnit { get; set; }
        public int WorkingDays { get; set; }
        public int UnsyncedDays { get; set; }
        public int PresentDays { get; set; }
        public int AbsentDays { get; set; }
        public int LateDays { get; set; }
        public int OntimeDays { get; set; }
        public double TotalWorkHours { get; set; }
        public double AverageWorkHours { get; set; }
        public double AttendanceRate { get; set; }
        public DateTime SourceFromDate { get; set; }
        public DateTime SourceToDate { get; set; }
        public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    }
}
