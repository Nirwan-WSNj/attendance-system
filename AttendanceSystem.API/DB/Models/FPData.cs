namespace AttendanceSystem.API.DB.Models
{
    public class FPData
    {
        public Guid Id { get; set; }
        public string? EPFNo { get; set; }
        public DateOnly? FirstPunchDate { get; set; }
        public string? FirstPunchTime { get; set; }
        public DateOnly? LastPunchDate { get; set; }
        public string? LastPunchTime { get; set; }
        public DateTime? ReceivedAt { get; set; }
    }
}
