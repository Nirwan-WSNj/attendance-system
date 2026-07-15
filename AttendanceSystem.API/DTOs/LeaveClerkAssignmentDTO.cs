namespace AttendanceSystem.API.DTOs
{
    public class LeaveClerkDTO
    {
        public Guid UserId { get; set; }
        public Guid EmployeeId { get; set; }
        public string EpfNo { get; set; } = string.Empty;
        public string? NameWithInitial { get; set; }
        public bool IsActive { get; set; }
        public int AssignedCount { get; set; }
    }

    public class LeaveClerkAssignmentRowDTO
    {
        public Guid AssignedId { get; set; }
        public Guid EmployeeId { get; set; }
        public string? EpfNo { get; set; }
        public string? NameWithInitial { get; set; }
        public string? DesignationName { get; set; }
        public string? AgmWorkSpaceName { get; set; }
        public string? DgmWorkSpaceName { get; set; }
        public string? ServiceUnitName { get; set; }
        public Guid? LeaveClerkEmployeeId { get; set; }
        public string? LeaveClerkEpfNo { get; set; }
        public string? LeaveClerkName { get; set; }
        public string AssignmentStatus { get; set; } = "Unassigned";
    }

    public class LeaveClerkAssignmentPageDTO
    {
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalCount { get; set; }
        public int TotalPages { get; set; }
        public int TotalEmployees { get; set; }
        public int AssignedEmployees { get; set; }
        public int UnassignedEmployees { get; set; }
        public int SelectedClerkAssignedEmployees { get; set; }
        public List<LeaveClerkAssignmentRowDTO> Items { get; set; } = [];
    }

    public class LeaveClerkAssignRequestDTO
    {
        public Guid ClerkEmployeeId { get; set; }
        public List<Guid> EmployeeIds { get; set; } = [];
    }

    public class LeaveClerkUnassignRequestDTO
    {
        public List<Guid> EmployeeIds { get; set; } = [];
        public Guid? ExpectedClerkEmployeeId { get; set; }
    }

    public class LeaveClerkAutoAssignRequestDTO
    {
        public List<Guid> ClerkEmployeeIds { get; set; } = [];
    }

    public class LeaveClerkAssignmentResultDTO
    {
        public int UpdatedCount { get; set; }
        public string Message { get; set; } = string.Empty;
    }

    public class LeaveClerkAssignmentAuditDTO
    {
        public Guid Id { get; set; }
        public string Action { get; set; } = string.Empty;
        public Guid EmployeeId { get; set; }
        public string? EmployeeEpfNo { get; set; }
        public Guid? PreviousClerkEmployeeId { get; set; }
        public string? PreviousClerkEpfNo { get; set; }
        public Guid? NewClerkEmployeeId { get; set; }
        public string? NewClerkEpfNo { get; set; }
        public string? ChangedByName { get; set; }
        public string? ChangedByEpfNo { get; set; }
        public string? Remarks { get; set; }
        public DateTime ChangedAt { get; set; }
    }
}
