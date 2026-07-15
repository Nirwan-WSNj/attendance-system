namespace AttendanceSystem.API.DB.Models
{
    public class LeaveInOutTime
    {
        public Guid InOutId { get; set; }
        public Guid EmployeeId { get; set; }
        public bool IsActive { get; set; }
        public bool IsOffice { get; set; }
        public int InHour { get; set; }
        public int InMinute { get; set; }
        public int OutHour { get; set; }
        public int OutMinute { get; set; }
    }
}
