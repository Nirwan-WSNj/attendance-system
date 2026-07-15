namespace AttendanceSystem.API.DB.Models
{
    public class FPuserList
    {
        public int id { get; set; }
        public string epf_no { get; set; } = string.Empty;
        public string? firstName { get; set; }
        public string? lastName { get; set; }
        public DateTime? ReceivedAt { get; set; }
    }
}
