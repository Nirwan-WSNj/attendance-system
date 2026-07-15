using AttendanceSystem.API.Authorization;
using AttendanceSystem.API.BL;
using AttendanceSystem.API.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace AttendanceSystem.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly AuthBL _authBL;
        private readonly AttendanceAccessService _access;

        public AuthController(AuthBL authBL, AttendanceAccessService access)
        {
            _authBL = authBL;
            _access = access;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequestDTO dto)
        {
            try
            {
                var result = await _authBL.LoginAsync(dto);
                return Ok(new { success = true, data = result });
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { success = false, message = ex.Message });
            }
        }

        [Authorize]
        [HttpPost("users")]
        public async Task<IActionResult> CreateUser([FromBody] CreateUserDTO dto)
        {
            if (!_access.CanManageUsers(User))
                return Forbid();

            try
            {
                var user = await _authBL.CreateUserAsync(dto);
                return Ok(new { success = true, data = new { user.Id, user.Username, user.Role, user.EpfNo, user.FullName } });
            }
            catch (InvalidOperationException ex)
            {
                return Conflict(new { success = false, message = ex.Message });
            }
        }

        [Authorize]
        [HttpGet("users")]
        public async Task<IActionResult> GetUsers()
        {
            if (!_access.CanManageUsers(User))
                return Forbid();

            var users = await _authBL.GetUsersAsync();
            return Ok(users.Select(u => new { u.Id, u.Username, u.Role, u.EpfNo, u.FullName, u.IsActive, u.CreatedAt, u.LastLoginAt }));
        }

        [Authorize]
        [HttpPut("users/{id}/toggle")]
        public async Task<IActionResult> ToggleUser(Guid id, [FromQuery] bool isActive)
        {
            if (!_access.CanManageUsers(User))
                return Forbid();

            try
            {
                await _authBL.ToggleUserAsync(id, isActive);
                return Ok(new { success = true });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { success = false, message = ex.Message });
            }
        }

        [Authorize]
        [HttpPost("change-password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDTO dto)
        {
            var raw = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "";
            if (!Guid.TryParse(raw, out var userId))
                return Unauthorized(new { success = false, message = "Invalid token." });
            try
            {
                await _authBL.ChangePasswordAsync(userId, dto);
                return Ok(new { success = true });
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { success = false, message = ex.Message });
            }
        }
    }
}
