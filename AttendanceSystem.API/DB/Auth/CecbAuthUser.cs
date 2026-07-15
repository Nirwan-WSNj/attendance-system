namespace AttendanceSystem.API.DB.Auth
{
    public class CecbAuthUser
    {
        public Guid UserId { get; set; }
        public string EPFNo { get; set; } = "";
        public bool IsActive { get; set; }
    }
}
