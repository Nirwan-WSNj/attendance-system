namespace AttendanceSystem.API.DB.Models
{
    public class TimeNetPunch
    {
        public int id { get; set; }
        public int employee_id { get; set; }
        public DateTime punch_time { get; set; }
        // 0 = check-in, 1 = check-out, 255 = auto-detect (ZKTeco convention)
        public int? workstate { get; set; }
    }
}
