namespace AttendanceSystem.API.DB.Models
{
    public class AssignedEmployee
    {
        public Guid AssignedId { get; set; }
        public Guid ApproverId { get; set; }
        public Guid EmployeeId { get; set; }
        public Guid? RecommenderId { get; set; }
        public Guid? LeaveClerkEmployeeId { get; set; }
    }
}
