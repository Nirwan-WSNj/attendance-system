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
    public class AttendanceController : ControllerBase
    {
        private static readonly string[] AttendanceDataAssignedPermissions =
        [
            AttendancePermissions.DashboardViewAssigned,
            AttendancePermissions.SectionAttendanceViewAssigned
        ];

        private static readonly string[] AttendanceDataAllPermissions =
        [
            AttendancePermissions.DashboardViewAll,
            AttendancePermissions.AllAttendanceViewAll
        ];

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

        private static readonly string[] ChartAssignedPermissions =
        [
            AttendancePermissions.DashboardViewAssigned,
            AttendancePermissions.AnalyticsViewAssigned
        ];

        private static readonly string[] ChartAllPermissions =
        [
            AttendancePermissions.DashboardViewAll,
            AttendancePermissions.AnalyticsViewAll
        ];

        private readonly AttendanceRepository _repo;
        private readonly AttendanceAccessService _access;
        private readonly ILogger<AttendanceController> _logger;

        public AttendanceController(
            AttendanceRepository repo,
            AttendanceAccessService access,
            ILogger<AttendanceController> logger)
        {
            _repo = repo;
            _access = access;
            _logger = logger;
        }

        [HttpGet("today")]
        public async Task<IActionResult> GetToday()
        {
            try
            {
                var allowedEpfs = await GetAllowedEpfsAsync(
                    allowOwn: true,
                    AttendanceDataAssignedPermissions,
                    AttendanceDataAllPermissions);
                if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();
                return Ok(await _repo.GetTodayAsync(allowedEpfs));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching today");
                return Problem(title: "Failed to fetch today's attendance data.", statusCode: 500);
            }
        }

        [HttpGet("bydate/{date}")]
        public async Task<IActionResult> GetByDate(string date)
        {
            if (!DateOnly.TryParse(date, out var d)) return BadRequest("Invalid date. Use yyyy-MM-dd");

            try
            {
                var allowedEpfs = await GetAllowedEpfsAsync(
                    allowOwn: true,
                    AttendanceDataAssignedPermissions,
                    AttendanceDataAllPermissions);
                if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();
                return Ok(await _repo.GetByDateAsync(d, allowedEpfs));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching by date");
                return Problem(title: "Failed to fetch attendance data for this date.", statusCode: 500);
            }
        }

        [HttpGet("source-status")]
        public async Task<IActionResult> GetSourceStatus([FromQuery] string? date = null)
        {
            DateOnly d;
            if (date == null)
                d = DateOnly.FromDateTime(DateTime.Now);
            else if (!DateOnly.TryParse(date, out d))
                return BadRequest("Invalid date. Use yyyy-MM-dd");

            if (!_access.CanViewSourceStatus(User))
                return Forbid();

            try { return Ok(await _repo.GetSourceStatusAsync(d)); }
            catch (Exception ex) { _logger.LogError(ex, "Error fetching source status"); return Problem(title: "Failed to check AttendanceERP sync status.", statusCode: 500); }
        }

        [HttpGet("status/{epfNo}")]
        public async Task<IActionResult> GetStatus(string epfNo, [FromQuery] string? date = null)
        {
            DateOnly d;
            if (date == null)
                d = DateOnly.FromDateTime(DateTime.Now);
            else if (!DateOnly.TryParse(date, out d))
                return BadRequest("Invalid date. Use yyyy-MM-dd");

            if (!await CanAccessEpfAsync(
                    epfNo,
                    AttendanceDataAssignedPermissions,
                    AttendanceDataAllPermissions))
                return Forbid();

            try { return Ok(await _repo.GetStatusByEpfAndDateAsync(epfNo, d)); }
            catch (Exception ex) { _logger.LogError(ex, "Error fetching status"); return Problem(title: "Failed to fetch employee attendance status.", statusCode: 500); }
        }

        [HttpGet("byepf/{epfNo}")]
        public async Task<IActionResult> GetByEpf(string epfNo)
        {
            if (!await CanAccessEpfAsync(
                    epfNo,
                    AttendanceDataAssignedPermissions,
                    AttendanceDataAllPermissions))
                return Forbid();

            try { return Ok(await _repo.GetByEpfAsync(epfNo)); }
            catch (Exception ex) { _logger.LogError(ex, "Error fetching by EPF"); return Problem(title: "Failed to fetch employee attendance records.", statusCode: 500); }
        }

        [HttpGet("range")]
        public async Task<IActionResult> GetByRange([FromQuery] string from, [FromQuery] string to, [FromQuery] string? epfNo = null)
        {
            if (!DateOnly.TryParse(from, out var f) || !DateOnly.TryParse(to, out var t))
                return BadRequest("Invalid date. Use yyyy-MM-dd");
            if (f > t) return BadRequest("from must not be after to");

            var allowedEpfs = await GetAllowedEpfsAsync(
                allowOwn: true,
                AttendanceDataAssignedPermissions,
                AttendanceDataAllPermissions);
            if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();
            if (!string.IsNullOrWhiteSpace(epfNo) &&
                allowedEpfs != null &&
                !allowedEpfs.Contains(AttendanceAccessService.NormalizeEpf(epfNo)))
            {
                return Forbid();
            }

            try { return Ok(await _repo.GetByRangeAsync(f, t, epfNo, allowedEpfs)); }
            catch (Exception ex) { _logger.LogError(ex, "Error fetching range"); return Problem(title: "Failed to fetch attendance records for this range.", statusCode: 500); }
        }

        [HttpGet("employees")]
        public async Task<IActionResult> GetEmployees([FromQuery] string? keyword = null)
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

        [HttpPost("cache/refresh-schedules")]
        public async Task<IActionResult> RefreshScheduleCache()
        {
            if (!_access.CanRefreshCache(User))
                return Forbid();

            try { return Ok(await _repo.RefreshScheduleCacheAsync()); }
            catch (Exception ex) { _logger.LogError(ex, "Error refreshing employee schedule cache"); return Problem(title: "Failed to refresh employee schedules.", statusCode: 500); }
        }

        [HttpGet("chart/daily-count")]
        public async Task<IActionResult> GetDailyCount([FromQuery] int days = 14)
        {
            if (days <= 0 || days > 366) return BadRequest("days must be 1-366");
            try
            {
                var allowedEpfs = await GetAllowedEpfsAsync(
                    allowOwn: false,
                    ChartAssignedPermissions,
                    ChartAllPermissions);
                if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();
                return Ok(await _repo.GetDailyCountAsync(days, allowedEpfs));
            }
            catch (Exception ex) { _logger.LogError(ex, "Error fetching daily count"); return Problem(title: "Failed to fetch attendance chart data.", statusCode: 500); }
        }

        [HttpGet("chart/arrival-status")]
        public async Task<IActionResult> GetArrivalStatus([FromQuery] int days = 14)
        {
            if (days <= 0 || days > 366) return BadRequest("days must be 1-366");
            try
            {
                var allowedEpfs = await GetAllowedEpfsAsync(
                    allowOwn: false,
                    ChartAssignedPermissions,
                    ChartAllPermissions);
                if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();
                return Ok(await _repo.GetArrivalStatusAsync(days, allowedEpfs));
            }
            catch (Exception ex) { _logger.LogError(ex, "Error fetching arrival status"); return Problem(title: "Failed to fetch arrival status chart data.", statusCode: 500); }
        }

        private async Task<HashSet<string>?> GetAllowedEpfsAsync(
            bool allowOwn,
            IEnumerable<string> viewAssignedPermissions,
            IEnumerable<string> viewAllPermissions)
        {
            var employees = await _repo.GetEmployeesAsync();
            return await _access.GetAllowedEpfSetForPermissionsAsync(
                User,
                employees,
                allowOwn,
                viewAssignedPermissions,
                viewAllPermissions);
        }

        private async Task<bool> CanAccessEpfAsync(
            string epfNo,
            IEnumerable<string> viewAssignedPermissions,
            IEnumerable<string> viewAllPermissions)
        {
            var normalized = AttendanceAccessService.NormalizeEpf(epfNo);
            var employee = (await _repo.GetEmployeesAsync(epfNo))
                .FirstOrDefault(e => string.Equals(
                    AttendanceAccessService.NormalizeEpf(e.EpfNo),
                    normalized,
                    StringComparison.OrdinalIgnoreCase));

            return await _access.CanAccessEmployeeForPermissionsAsync(
                User,
                employee,
                epfNo,
                allowOwn: true,
                viewAssignedPermissions,
                viewAllPermissions);
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
