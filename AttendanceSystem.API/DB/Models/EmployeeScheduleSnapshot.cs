namespace AttendanceSystem.API.DB.Models
{
    public class EmployeeScheduleSnapshot
    {
        public Guid EmployeeId { get; set; }
        public string EpfNo { get; set; } = string.Empty;
        public string? NameWithInitial { get; set; }
        public string? DesignationName { get; set; }
        public Guid? AGMWorkSpaceId { get; set; }
        public string? AGMWorkSpaceName { get; set; }
        public Guid? DGMWorkSpaceId { get; set; }
        public string? DGMWorkSpaceName { get; set; }
        public Guid? ServiceUnitId { get; set; }
        public string? ServiceUnitName { get; set; }
        public int? InHour { get; set; }
        public int? InMinute { get; set; }
        public int? OutHour { get; set; }
        public int? OutMinute { get; set; }
        public string ScheduleSource { get; set; } = "LeaveDB";
        public DateTime LastSyncedAt { get; set; } = DateTime.UtcNow;
    }
}
