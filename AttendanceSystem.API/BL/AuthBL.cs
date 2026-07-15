using AttendanceSystem.API.DB;
using AttendanceSystem.API.DB.Models;
using AttendanceSystem.API.DTOs;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace AttendanceSystem.API.BL
{
    public class AuthBL
    {
        private readonly AppDbContext _db;
        private readonly IConfiguration _cfg;
        private static readonly HashSet<string> AllowedRoles = new(StringComparer.OrdinalIgnoreCase)
        {
            "Admin",
            "Employee",
            "LeaveClerk",
            "LeaveAdmin"
        };

        public AuthBL(AppDbContext db, IConfiguration cfg)
        {
            _db = db;
            _cfg = cfg;
        }

        public async Task<LoginResponseDTO> LoginAsync(LoginRequestDTO dto)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == dto.Username && u.IsActive);

            if (user != null && user.LockedUntil.HasValue && user.LockedUntil.Value > DateTime.UtcNow)
            {
                var remainingMins = (int)Math.Ceiling((user.LockedUntil.Value - DateTime.UtcNow).TotalMinutes);
                throw new UnauthorizedAccessException($"Account locked. Try again in {remainingMins} minute(s).");
            }

            if (user == null || !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
            {
                if (user != null)
                {
                    user.FailedLoginAttempts++;
                    if (user.FailedLoginAttempts >= 5)
                        user.LockedUntil = DateTime.UtcNow.AddMinutes(15);
                    await _db.SaveChangesAsync();
                }
                throw new UnauthorizedAccessException("Invalid username or password.");
            }

            user.FailedLoginAttempts = 0;
            user.LockedUntil = null;
            user.LastLoginAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return new LoginResponseDTO
            {
                AccessToken = GenerateToken(user),
                Role = user.Role,
                EpfNo = string.IsNullOrWhiteSpace(user.EpfNo) ? null : NormalizeEpf(user.EpfNo),
                FullName = user.FullName,
                Username = user.Username
            };
        }

        public async Task<AppUser> CreateUserAsync(CreateUserDTO dto)
        {
            var username = dto.Username.Trim();
            var password = dto.Password;
            var role = NormalizeRoleName(dto.Role);
            var rawEpfNo = dto.EpfNo?.Trim();
            var epfNo = string.IsNullOrWhiteSpace(rawEpfNo) ? null : NormalizeEpf(rawEpfNo);

            if (string.IsNullOrWhiteSpace(username))
                throw new InvalidOperationException("Username is required.");
            if (string.IsNullOrWhiteSpace(password) || password.Length < 6)
                throw new InvalidOperationException("Password must be at least 6 characters.");
            if (!AllowedRoles.Contains(role))
                throw new InvalidOperationException("Role must be Admin, Employee, LeaveClerk, or LeaveAdmin.");
            if ((string.Equals(role, "Employee", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(role, "LeaveClerk", StringComparison.OrdinalIgnoreCase)) &&
                string.IsNullOrWhiteSpace(epfNo))
                throw new InvalidOperationException("Employee and LeaveClerk users must have an EPF number.");

            if (await _db.Users.AnyAsync(u => u.Username == username))
                throw new InvalidOperationException("Username already exists.");
            if (!string.IsNullOrWhiteSpace(epfNo) &&
                await _db.Users.AnyAsync(u => u.IsActive && (u.EpfNo == epfNo || u.EpfNo == rawEpfNo)))
                throw new InvalidOperationException("An active user already exists for this EPF number.");

            var user = new AppUser
            {
                Username = username,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
                Role = role,
                EpfNo = epfNo,
                FullName = string.IsNullOrWhiteSpace(dto.FullName) ? null : dto.FullName.Trim()
            };

            _db.Users.Add(user);
            await UpsertEmployeeUserMappingAsync(user);
            await _db.SaveChangesAsync();
            return user;
        }

        public async Task ChangePasswordAsync(Guid userId, ChangePasswordDTO dto)
        {
            var user = await _db.Users.FindAsync(userId) ?? throw new KeyNotFoundException("User not found.");
            if (!BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, user.PasswordHash))
                throw new UnauthorizedAccessException("Current password is incorrect.");
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
            user.PasswordChangedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }

        public async Task<List<AppUser>> GetUsersAsync() =>
            await _db.Users.OrderBy(u => u.Username).ToListAsync();

        public async Task ToggleUserAsync(Guid userId, bool isActive)
        {
            var user = await _db.Users.FindAsync(userId) ?? throw new KeyNotFoundException("User not found.");
            user.IsActive = isActive;
            await UpsertEmployeeUserMappingAsync(user);
            await _db.SaveChangesAsync();
        }

        private async Task UpsertEmployeeUserMappingAsync(AppUser user)
        {
            if (string.IsNullOrWhiteSpace(user.EpfNo))
                return;

            var epfNo = NormalizeEpf(user.EpfNo);
            var mapping = await _db.EmployeeUserMappings.FirstOrDefaultAsync(m => m.UserId == user.Id);
            if (mapping == null)
            {
                mapping = new EmployeeUserMapping
                {
                    UserId = user.Id,
                    LinkedAt = DateTime.UtcNow
                };
                _db.EmployeeUserMappings.Add(mapping);
            }

            var employeeSnapshot = await _db.EmployeeScheduleSnapshots
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.EpfNo == epfNo || s.EpfNo == user.EpfNo.Trim());

            mapping.EmployeeId = employeeSnapshot?.EmployeeId ?? mapping.EmployeeId;
            mapping.EpfNo = epfNo;
            mapping.Username = user.Username;
            mapping.FullName = user.FullName;
            mapping.Role = user.Role;
            mapping.IsActive = user.IsActive;
            mapping.LastSyncedAt = DateTime.UtcNow;
        }

        private static string NormalizeEpf(string? epf)
        {
            if (string.IsNullOrWhiteSpace(epf)) return epf ?? "";
            var trimmed = epf.Trim();
            return int.TryParse(trimmed, out _) ? trimmed.PadLeft(6, '0') : trimmed;
        }

        private static string NormalizeRoleName(string? role)
        {
            var trimmed = role?.Trim() ?? "";
            if (string.Equals(trimmed, "Admin", StringComparison.OrdinalIgnoreCase)) return "Admin";
            if (string.Equals(trimmed, "LeaveClerk", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(trimmed, "LEAVE_CLERK", StringComparison.OrdinalIgnoreCase)) return "LeaveClerk";
            if (string.Equals(trimmed, "LeaveAdmin", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(trimmed, "LEAVE_ADMIN", StringComparison.OrdinalIgnoreCase)) return "LeaveAdmin";
            if (string.Equals(trimmed, "Employee", StringComparison.OrdinalIgnoreCase)) return "Employee";
            return trimmed;
        }

        private string GenerateToken(AppUser user)
        {
            var jwt = _cfg.GetSection("JwtSettings");
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt["SecretKey"]!));
            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim("username", user.Username),
                new Claim("role", user.Role),
                new Claim("epfNo", string.IsNullOrWhiteSpace(user.EpfNo) ? "" : NormalizeEpf(user.EpfNo)),
                new Claim("fullName", user.FullName ?? ""),
                new Claim(ClaimTypes.Role, user.Role)
            };
            var token = new JwtSecurityToken(
                issuer: jwt["Issuer"],
                audience: jwt["Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddHours(8),
                signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
