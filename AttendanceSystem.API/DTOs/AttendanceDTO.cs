namespace AttendanceSystem.API.DTOs
{
    public class AttendanceRecordDTO
    {
        public Guid? EmployeeId { get; set; }
        public string? EpfNo { get; set; }
        public string? NameWithInitial { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? DesignationName { get; set; }
        public int? InHour { get; set; }
        public int? InMinute { get; set; }
        public int? OutHour { get; set; }
        public int? OutMinute { get; set; }
        public Guid? AGMWorkSpaceId { get; set; }
        public string? AGMWorkSpaceName { get; set; }
        public Guid? DGMWorkSpaceId { get; set; }
        public string? DGMWorkSpaceName { get; set; }
        public Guid? ServiceUnitId { get; set; }
        public string? ServiceUnitName { get; set; }
        public DateOnly? WorkDate { get; set; }
        public string? CheckIn { get; set; }
        public string? CheckOut { get; set; }
        public bool CheckOutIsNextDay { get; set; }
        public DateTime? ReceivedAt { get; set; }
        public bool IsCorrected { get; set; }
        public Guid? CorrectionId { get; set; }
        public Guid? CorrectionSessionId { get; set; }
        public string? OriginalCheckIn { get; set; }
        public string? OriginalCheckOut { get; set; }
        public string? CorrectionReason { get; set; }
        public string? CorrectionLocation { get; set; }
        public string? CorrectionRemarks { get; set; }
    }

    public class DailyAttendanceCountDTO
    {
        public DateOnly Date { get; set; }
        public int Count { get; set; }
        public bool IsSynced { get; set; } = true;
        public bool IsWorkingDay { get; set; } = true;
    }

    public class AttendanceArrivalStatusCountDTO
    {
        public string Key { get; set; } = "";
        public string Label { get; set; } = "";
        public int Count { get; set; }
    }

    public class AttendanceStatusDTO
    {
        public string EpfNo { get; set; } = "";
        public string? Name { get; set; }
        public string Date { get; set; } = "";
        public string Status { get; set; } = "";
        public bool IsSynced { get; set; } = true;
        public bool IsPresent { get; set; }
        public bool IsAbsent { get; set; }
        public bool IsWeekend { get; set; }
        public bool IsHoliday { get; set; }
        public string? HolidayName { get; set; }
        public string? CheckIn { get; set; }
        public string? CheckOut { get; set; }
        public double? WorkHours { get; set; }
        public string? LateBy { get; set; }
    }

    public class AttendanceSourceStatusDTO
    {
        public string Date { get; set; } = "";
        public bool IsWorkingDay { get; set; }
        public bool IsWeekend { get; set; }
        public bool IsHoliday { get; set; }
        public string? HolidayName { get; set; }
        public bool HasPunchData { get; set; }
        public bool IsSynced { get; set; }
        public int PunchRecordCount { get; set; }
        public int EmployeeCount { get; set; }
        public DateTime? LastReceivedAt { get; set; }
        public string? LatestAvailablePunchDate { get; set; }
        public DateTime? LatestAvailableReceivedAt { get; set; }
        public string Status { get; set; } = "";
        public string Message { get; set; } = "";
    }

    public class AttendanceEmployeeDTO
    {
        public Guid? EmployeeId { get; set; }
        public string? EpfNo { get; set; }
        public string? NameWithInitial { get; set; }
        public string? DesignationName { get; set; }
        public int? InHour { get; set; }
        public int? InMinute { get; set; }
        public int? OutHour { get; set; }
        public int? OutMinute { get; set; }
        public Guid? AGMWorkSpaceId { get; set; }
        public string? AGMWorkSpaceName { get; set; }
        public Guid? DGMWorkSpaceId { get; set; }
        public string? DGMWorkSpaceName { get; set; }
        public Guid? ServiceUnitId { get; set; }
        public string? ServiceUnitName { get; set; }
    }

    public class ScheduleCacheRefreshResultDTO
    {
        public int EmployeeCount { get; set; }
        public int SnapshotCount { get; set; }
        public DateTime RefreshedAt { get; set; }
        public string Message { get; set; } = "";
    }
}
