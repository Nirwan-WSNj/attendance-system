namespace AttendanceSystem.API.DB.Models
{
    public class DataSourceHealth
    {
        public string SourceName { get; set; } = string.Empty;
        public DateTime? LastCheckedAt { get; set; }
        public DateTime? LastSuccessAt { get; set; }
        public string Status { get; set; } = "Unknown";
        public string? Message { get; set; }
    }
}
