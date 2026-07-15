namespace AttendanceSystem.API.DTOs
{
    public class AttendanceCorrectionSessionCreateDTO
    {
        public string? Title { get; set; }
        public string FromDate { get; set; } = "";
        public string ToDate { get; set; } = "";
        public string? Remarks { get; set; }
        public List<AttendanceCorrectionCreateDTO> Items { get; set; } = [];
    }

    public class AttendanceCorrectionCreateDTO
    {
        public string EpfNo { get; set; } = "";
        public string WorkDate { get; set; } = "";
        public string? CorrectedCheckIn { get; set; }
        public string? CorrectedCheckOut { get; set; }
        public string ReasonType { get; set; } = "Site/Circuit";
        public string? Location { get; set; }
        public string? Remarks { get; set; }
    }

    public class AttendanceCorrectionUpdateDTO
    {
        public string? CorrectedCheckIn { get; set; }
        public string? CorrectedCheckOut { get; set; }
        public string ReasonType { get; set; } = "Site/Circuit";
        public string? Location { get; set; }
        public string? Remarks { get; set; }
        public bool IsActive { get; set; } = true;
    }

    public class AttendanceCorrectionCandidatePageDTO
    {
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalCount { get; set; }
        public int TotalPages { get; set; }
        public List<AttendanceRecordDTO> Items { get; set; } = [];
        public List<string> AgmOptions { get; set; } = [];
        public List<string> DgmOptions { get; set; } = [];
        public Dictionary<string, int> DgmOptionCounts { get; set; } = [];
        public int DirectUnderAgmCount { get; set; }
        public List<string> ServiceUnitOptions { get; set; } = [];
        public List<string> DesignationOptions { get; set; } = [];
    }

    public class AttendanceCorrectionSessionDTO
    {
        public Guid SessionId { get; set; }
        public string SessionNo { get; set; } = "";
        public string Title { get; set; } = "";
        public string FromDate { get; set; } = "";
        public string ToDate { get; set; } = "";
        public string Status { get; set; } = "";
        public string? Remarks { get; set; }
        public string? CreatedByName { get; set; }
        public string? CreatedByEpfNo { get; set; }
        public DateTime CreatedAt { get; set; }
        public int ItemCount { get; set; }
        public List<AttendanceCorrectionDTO> Items { get; set; } = [];
    }

    public class AttendanceCorrectionDTO
    {
        public Guid CorrectionId { get; set; }
        public Guid SessionId { get; set; }
        public string SessionNo { get; set; } = "";
        public string EpfNo { get; set; } = "";
        public Guid? EmployeeId { get; set; }
        public string? EmployeeName { get; set; }
        public string WorkDate { get; set; } = "";
        public string? OriginalCheckIn { get; set; }
        public string? OriginalCheckOut { get; set; }
        public string? CorrectedCheckIn { get; set; }
        public string? CorrectedCheckOut { get; set; }
        public string ReasonType { get; set; } = "";
        public string? Location { get; set; }
        public string? Remarks { get; set; }
        public string Status { get; set; } = "";
        public bool IsActive { get; set; }
        public string? CreatedByName { get; set; }
        public string? CreatedByEpfNo { get; set; }
        public DateTime CreatedAt { get; set; }
        public string? UpdatedByName { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }
}
