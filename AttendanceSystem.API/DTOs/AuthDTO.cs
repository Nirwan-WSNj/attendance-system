namespace AttendanceSystem.API.DTOs
{
    public class LoginRequestDTO
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class LoginResponseDTO
    {
        public string AccessToken { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string? EpfNo { get; set; }
        public string? FullName { get; set; }
        public string Username { get; set; } = string.Empty;
    }

    public class CreateUserDTO
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string Role { get; set; } = "Employee";
        public string? EpfNo { get; set; }
        public string? FullName { get; set; }
    }

    public class ChangePasswordDTO
    {
        public string CurrentPassword { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
    }
}
