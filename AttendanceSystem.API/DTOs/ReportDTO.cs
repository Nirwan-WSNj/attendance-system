namespace AttendanceSystem.API.DTOs
{
    // AGM → DGM → Service Unit hierarchy report
    public class UnitAttendanceSummaryDTO
    {
        public string UnitName { get; set; } = "";
        public string UnitLevel { get; set; } = ""; // AGM | DGM | ServiceUnit
        public int RegisteredEmployees { get; set; }
        public int TotalWorkingDays { get; set; }  // distinct dates in range
        public int TotalPresent { get; set; }       // employee-day present records
        public int TotalAbsent { get; set; }
        public int TotalLate { get; set; }
        public int TotalUnsyncedDays { get; set; }
        public double AttendanceRate { get; set; }  // %
        public double AverageWorkHours { get; set; }
        public List<UnitAttendanceSummaryDTO> Children { get; set; } = [];
    }

    // Per-employee summary across a date range
    public class EmployeeAttendanceSummaryDTO
    {
        public string? EpfNo { get; set; }
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
        public List<DailyEmployeeRecordDTO> DailyRecords { get; set; } = [];
    }

    public class DailyEmployeeRecordDTO
    {
        public string Date { get; set; } = "";
        public string? CheckIn { get; set; }
        public string? CheckOut { get; set; }
        public double? WorkHours { get; set; }
        public string Status { get; set; } = ""; // OnTime | Late | HalfShortLeave | ShortLeave | HalfDay | MissingIn | FullDayLeave | Absent
        public string? LateBy { get; set; }
        public bool HasOvertime { get; set; }
        public bool IsSynced { get; set; } = true;
    }

    // Late arrival report row
    public class LateArrivalRowDTO
    {
        public string? EpfNo { get; set; }
        public string? Name { get; set; }
        public string? AGMUnit { get; set; }
        public string? DGMUnit { get; set; }
        public string? Unit { get; set; }
        public string Date { get; set; } = "";
        public string CheckIn { get; set; } = "";
        public string ScheduledStart { get; set; } = "";
        public string LateBy { get; set; } = "";
        public int LateMinutes { get; set; }
    }

    // Overall summary for a date
    public class OverallDailySummaryDTO
    {
        public string Date { get; set; } = "";
        public int TotalRegistered { get; set; }
        public int Present { get; set; }
        public int Absent { get; set; }
        public int Late { get; set; }
        public int OnTime { get; set; }
        public int CheckedOut { get; set; }
        public bool IsSynced { get; set; } = true;
        public bool IsWorkingDay { get; set; } = true;
        public string? SourceStatus { get; set; }
        public DateTime? LastReceivedAt { get; set; }
        public double AttendanceRate { get; set; }
        public double AverageWorkHours { get; set; }
    }

    // OT summary per employee
    public class OTSummaryDTO
    {
        public string? EpfNo { get; set; }
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
        public List<OTDayDTO> OTRecords { get; set; } = [];
    }

    public class OTDayDTO
    {
        public string Date { get; set; } = "";
        public string CheckIn { get; set; } = "";
        public string CheckOut { get; set; } = "";
        public string ScheduledStart { get; set; } = "";
        public string ScheduledEnd { get; set; } = "";
        public string MorningOT { get; set; } = "00:00";   // floor to 15-min blocks
        public string EveningOT { get; set; } = "00:00";   // floor to 15-min blocks, capped at 20:00
        public string TotalOT { get; set; } = "00:00";
        public double OTHours { get; set; }                 // decimal for sum/sort
        public string OTDuration { get; set; } = "";
    }

    // ── Attendance Register (physical sheet format) ──────────────────────────

    public class AttendanceRegisterDTO
    {
        public string PeriodLabel { get; set; } = "";   // "MAY 2026"
        public int Year { get; set; }
        public int Month { get; set; }
        public List<RegisterDayHeader> DayHeaders { get; set; } = [];
        public List<RegisterUnitGroup> Units { get; set; } = [];
    }

    public class RegisterDayHeader
    {
        public int Day { get; set; }
        public string DayName { get; set; } = ""; // M,T,W,T,F,S,S
        public bool IsWeekend { get; set; }
        public bool IsHoliday { get; set; }
        public string? HolidayName { get; set; }
    }

    public class RegisterUnitGroup
    {
        public string UnitName { get; set; } = "";
        public string UnitLevel { get; set; } = "";  // AGM | DGM | ServiceUnit
        public List<RegisterEmployeeRow> Employees { get; set; } = [];
    }

    public class RegisterEmployeeRow
    {
        public string EpfNo { get; set; } = "";
        public string Name { get; set; } = "";
        public Dictionary<int, RegisterTimeDTO> Times { get; set; } = [];
    }

    public class RegisterTimeDTO
    {
        public string? CheckIn { get; set; }
        public string? CheckOut { get; set; }
        public bool IsHoliday { get; set; }
        public bool IsWeekend { get; set; }
    }

    public class AbsentEmployeesReportDTO
    {
        public string Date { get; set; } = "";
        public bool IsSynced { get; set; }
        public bool IsWorkingDay { get; set; }
        public bool IsWeekend { get; set; }
        public int TotalRegistered { get; set; }
        public int PresentCount { get; set; }
        public int AbsentCount { get; set; }
        public List<AttendanceEmployeeDTO> Employees { get; set; } = [];
    }
}
