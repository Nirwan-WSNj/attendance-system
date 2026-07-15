namespace AttendanceSystem.API.DB.Models
{
    public class EmployeeWorkspaceHistory
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid EmployeeId { get; set; }
        public string EpfNo { get; set; } = string.Empty;
        public string? EmployeeName { get; set; }
        public string? DesignationName { get; set; }
        public Guid? AGMWorkSpaceId { get; set; }
        public string? AGMWorkSpaceName { get; set; }
        public Guid? DGMWorkSpaceId { get; set; }
        public string? DGMWorkSpaceName { get; set; }
        public Guid? ServiceUnitId { get; set; }
        public string? ServiceUnitName { get; set; }
        public DateTime EffectiveFrom { get; set; } = DateTime.UtcNow;
        public DateTime? EffectiveTo { get; set; }
        public string Source { get; set; } = "CECB_ERP";
        public DateTime LastSyncedAt { get; set; } = DateTime.UtcNow;
    }
}
