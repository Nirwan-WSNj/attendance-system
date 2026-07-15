namespace AttendanceSystem.API.DTOs
{
    public class SystemHealthDTO
    {
        public string Status { get; set; } = "Unknown";
        public DateTime GeneratedAt { get; set; }
        public string SelectedDate { get; set; } = "";
        public string? LatestPunchDate { get; set; }
        public DateTime? LatestPunchReceivedAt { get; set; }
        public int SelectedDatePunchRecords { get; set; }
        public int SelectedDatePunchEmployees { get; set; }
        public int ErpEmployeeCount { get; set; }
        public int ActiveEmployeeCount { get; set; }
        public int ScheduleSnapshotCount { get; set; }
        public int EmployeesMissingSchedule { get; set; }
        public int AssignmentRows { get; set; }
        public int ActiveAssignmentRows { get; set; }
        public int AssignedEmployees { get; set; }
        public int UnassignedEmployees { get; set; }
        public int InactiveAssignmentRows { get; set; }
        public int InvalidClerkAssignments { get; set; }
        public int ActiveLeaveClerks { get; set; }
        public List<SystemHealthSourceDTO> Sources { get; set; } = [];
        public List<SystemHealthCheckDTO> Checks { get; set; } = [];
    }

    public class SystemHealthSourceDTO
    {
        public string SourceName { get; set; } = "";
        public string Status { get; set; } = "Unknown";
        public bool CanConnect { get; set; }
        public DateTime? LastCheckedAt { get; set; }
        public DateTime? LastSuccessAt { get; set; }
        public string? Message { get; set; }
    }

    public class SystemHealthCheckDTO
    {
        public string Area { get; set; } = "";
        public string Label { get; set; } = "";
        public string Status { get; set; } = "Unknown";
        public string Value { get; set; } = "";
        public string Message { get; set; } = "";
        public string? Action { get; set; }
    }
}
