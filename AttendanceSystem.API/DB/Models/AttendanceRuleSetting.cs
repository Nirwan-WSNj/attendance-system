namespace AttendanceSystem.API.DB.Models
{
    public class AttendanceRuleSetting
    {
        public int Id { get; set; } = 1;
        public int DefaultInHour { get; set; } = 8;
        public int DefaultInMinute { get; set; } = 30;
        public int DefaultOutHour { get; set; } = 16;
        public int DefaultOutMinute { get; set; } = 15;
        public int LateMinutes { get; set; } = 30;
        public int HalfShortLeaveMinutes { get; set; } = 45;
        public int ShortLeaveMinutes { get; set; } = 90;
        public int EarlyOTGraceMinutes { get; set; } = 30;
        public int EveningOTGraceMinutes { get; set; } = 30;
        public int OTRoundingMinutes { get; set; } = 15;
        public int OTCapHour { get; set; } = 20;
        public string? UpdatedBy { get; set; }
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
