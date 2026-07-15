using AttendanceSystem.API.Authorization;
using AttendanceSystem.API.DTOs;
using AttendanceSystem.API.Repository;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AttendanceSystem.API.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class EmployeeController : ControllerBase
    {
        private static readonly string[] EmployeeDirectoryAssignedPermissions =
        [
            AttendancePermissions.SectionAttendanceViewAssigned,
            AttendancePermissions.EmployeesViewAssigned,
            AttendancePermissions.AttendanceRegisterViewAssigned,
            AttendancePermissions.OtSummaryViewAssigned
        ];

        private static readonly string[] EmployeeDirectoryAllPermissions =
        [
            AttendancePermissions.AllAttendanceViewAll,
            AttendancePermissions.EmployeesViewAll,
            AttendancePermissions.AttendanceRegisterViewAll,
            AttendancePermissions.OtSummaryViewAll,
            AttendancePermissions.SettingsManage
        ];

        private readonly AttendanceRepository _repo;
        private readonly AttendanceAccessService _access;
        private readonly ILogger<EmployeeController> _logger;

        public EmployeeController(
            AttendanceRepository repo,
            AttendanceAccessService access,
            ILogger<EmployeeController> logger)
        {
            _repo = repo;
            _access = access;
            _logger = logger;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] string? keyword = null)
        {
            try
            {
                var employees = await _repo.GetEmployeesAsync(keyword);
                var allowedEpfs = await _access.GetAllowedEpfSetForPermissionsAsync(
                    User,
                    employees,
                    allowOwn: false,
                    EmployeeDirectoryAssignedPermissions,
                    EmployeeDirectoryAllPermissions);
                if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();
                return Ok(FilterEmployees(employees, allowedEpfs));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching employees");
                return Problem(title: "Failed to fetch employees.", statusCode: 500);
            }
        }

        private static List<AttendanceEmployeeDTO> FilterEmployees(
            List<AttendanceEmployeeDTO> employees,
            HashSet<string>? allowedEpfs)
        {
            if (allowedEpfs == null)
                return employees;

            return employees
                .Where(e => !string.IsNullOrWhiteSpace(e.EpfNo) &&
                            allowedEpfs.Contains(AttendanceAccessService.NormalizeEpf(e.EpfNo)))
                .ToList();
        }
    }
}
