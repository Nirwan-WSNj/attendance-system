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
    public class ReportController : ControllerBase
    {
        private static readonly string[] ReportsAssignedPermissions =
        [
            AttendancePermissions.ReportsViewAssigned
        ];

        private static readonly string[] ReportsAllPermissions =
        [
            AttendancePermissions.ReportsViewAll
        ];

        private static readonly string[] AgmReportAssignedPermissions =
        [
            AttendancePermissions.ReportsViewAssigned,
            AttendancePermissions.AnalyticsViewAssigned
        ];

        private static readonly string[] AgmReportAllPermissions =
        [
            AttendancePermissions.ReportsViewAll,
            AttendancePermissions.AnalyticsViewAll
        ];

        private static readonly string[] EmployeeReportAssignedPermissions =
        [
            AttendancePermissions.ReportsViewAssigned,
            AttendancePermissions.EmployeesViewAssigned,
            AttendancePermissions.OtSummaryViewAssigned
        ];

        private static readonly string[] EmployeeReportAllPermissions =
        [
            AttendancePermissions.ReportsViewAll,
            AttendancePermissions.EmployeesViewAll,
            AttendancePermissions.OtSummaryViewAll
        ];

        private static readonly string[] DailySummaryAssignedPermissions =
        [
            AttendancePermissions.ReportsViewAssigned,
            AttendancePermissions.DashboardViewAssigned,
            AttendancePermissions.AnalyticsViewAssigned
        ];

        private static readonly string[] DailySummaryAllPermissions =
        [
            AttendancePermissions.ReportsViewAll,
            AttendancePermissions.DashboardViewAll,
            AttendancePermissions.AnalyticsViewAll
        ];

        private static readonly string[] AttendanceRegisterAssignedPermissions =
        [
            AttendancePermissions.AttendanceRegisterViewAssigned
        ];

        private static readonly string[] AttendanceRegisterAllPermissions =
        [
            AttendancePermissions.AttendanceRegisterViewAll
        ];

        private static readonly string[] OtSummaryAssignedPermissions =
        [
            AttendancePermissions.OtSummaryViewAssigned,
            AttendancePermissions.EmployeesViewAssigned
        ];

        private static readonly string[] OtSummaryAllPermissions =
        [
            AttendancePermissions.OtSummaryViewAll,
            AttendancePermissions.EmployeesViewAll
        ];

        private readonly AttendanceRepository _repo;
        private readonly AttendanceAccessService _access;
        private readonly ILogger<ReportController> _logger;

        public ReportController(
            AttendanceRepository repo,
            AttendanceAccessService access,
            ILogger<ReportController> logger)
        {
            _repo = repo;
            _access = access;
            _logger = logger;
        }

        [HttpGet("agm-wise")]
        public async Task<IActionResult> GetAgmWise([FromQuery] string from, [FromQuery] string to)
        {
            if (!TryParseRange(from, to, out var f, out var t, out var error)) return error!;

            try
            {
                var allowedEpfs = await GetAllowedEpfsAsync(
                    allowOwn: false,
                    AgmReportAssignedPermissions,
                    AgmReportAllPermissions);
                if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();
                return Ok(await _repo.GetAgmWiseReportAsync(f, t, allowedEpfs));
            }
            catch (Exception ex) { _logger.LogError(ex, "AGM report error"); return Problem(title: "Failed to generate AGM-wise report.", statusCode: 500); }
        }

        [HttpGet("all-employees")]
        public async Task<IActionResult> GetAllEmployees([FromQuery] string from, [FromQuery] string to)
        {
            if (!TryParseRange(from, to, out var f, out var t, out var error)) return error!;

            try
            {
                var allowedEpfs = await GetAllowedEpfsAsync(
                    allowOwn: false,
                    ReportsAssignedPermissions,
                    ReportsAllPermissions);
                if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();
                return Ok(await _repo.GetAllEmployeeSummaryAsync(f, t, allowedEpfs));
            }
            catch (Exception ex) { _logger.LogError(ex, "All employees report error"); return Problem(title: "Failed to generate all employees report.", statusCode: 500); }
        }

        [HttpGet("employee/{epfNo}")]
        public async Task<IActionResult> GetEmployee(string epfNo, [FromQuery] string from, [FromQuery] string to)
        {
            if (!await CanAccessEpfAsync(
                    epfNo,
                    EmployeeReportAssignedPermissions,
                    EmployeeReportAllPermissions))
                return Forbid();

            if (!TryParseRange(from, to, out var f, out var t, out var error)) return error!;
            try { return Ok(await _repo.GetEmployeeReportAsync(epfNo, f, t)); }
            catch (Exception ex) { _logger.LogError(ex, "Employee report error"); return Problem(title: "Failed to generate employee report.", statusCode: 500); }
        }

        [HttpGet("late-arrivals")]
        public async Task<IActionResult> GetLateArrivals(
            [FromQuery] string from,
            [FromQuery] string to,
            [FromQuery] string? epfNo = null)
        {
            if (!TryParseRange(from, to, out var f, out var t, out var error)) return error!;

            try
            {
                var allowedEpfs = await GetAllowedEpfsAsync(
                    allowOwn: false,
                    ReportsAssignedPermissions,
                    ReportsAllPermissions);
                if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();

                if (!string.IsNullOrWhiteSpace(epfNo))
                {
                    var normalizedEpf = AttendanceAccessService.NormalizeEpf(epfNo);
                    if (allowedEpfs != null && !allowedEpfs.Contains(normalizedEpf)) return Forbid();

                    allowedEpfs = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                    {
                        normalizedEpf
                    };
                }

                return Ok(await _repo.GetLateArrivalReportAsync(f, t, allowedEpfs));
            }
            catch (Exception ex) { _logger.LogError(ex, "Late arrival report error"); return Problem(title: "Failed to generate late arrivals report.", statusCode: 500); }
        }

        [HttpGet("daily-summary")]
        public async Task<IActionResult> GetDailySummary([FromQuery] string from, [FromQuery] string to)
        {
            if (!TryParseRange(from, to, out var f, out var t, out var error)) return error!;

            try
            {
                var allowedEpfs = await GetAllowedEpfsAsync(
                    allowOwn: false,
                    DailySummaryAssignedPermissions,
                    DailySummaryAllPermissions);
                if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();
                return Ok(await _repo.GetDailySummaryReportAsync(f, t, allowedEpfs));
            }
            catch (Exception ex) { _logger.LogError(ex, "Daily summary error"); return Problem(title: "Failed to generate daily summary report.", statusCode: 500); }
        }

        [HttpGet("attendance-register")]
        public async Task<IActionResult> GetAttendanceRegister([FromQuery] int year, [FromQuery] int month, [FromQuery] string? agm = null, [FromQuery] string? dgm = null)
        {
            if (year < 2000 || year > 2100 || month < 1 || month > 12)
                return BadRequest("Invalid year or month.");

            try
            {
                var allowedEpfs = await GetAllowedEpfsAsync(
                    allowOwn: false,
                    AttendanceRegisterAssignedPermissions,
                    AttendanceRegisterAllPermissions);
                if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();
                return Ok(await _repo.GetAttendanceRegisterAsync(year, month, agm, dgm, allowedEpfs));
            }
            catch (Exception ex) { _logger.LogError(ex, "Register error"); return Problem(title: "Failed to generate attendance register.", statusCode: 500); }
        }

        [HttpGet("workspaces")]
        public async Task<IActionResult> GetWorkspaces()
        {
            try
            {
                var emps = await _repo.GetEmployeesAsync();
                var allowedEpfs = await _access.GetAllowedEpfSetForPermissionsAsync(
                    User,
                    emps,
                    allowOwn: false,
                    AttendanceRegisterAssignedPermissions,
                    AttendanceRegisterAllPermissions);
                if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();
                emps = FilterEmployees(emps, allowedEpfs);

                static string Clean(string? value) => string.IsNullOrWhiteSpace(value) ? "" : value.Trim();
                static string ParentName(AttendanceEmployeeDTO emp)
                {
                    var agm = Clean(emp.AGMWorkSpaceName);
                    var dgm = Clean(emp.DGMWorkSpaceName);
                    var service = Clean(emp.ServiceUnitName);
                    return agm.Length > 0 ? agm : dgm.Length > 0 ? dgm : service.Length > 0 ? service : "Unassigned";
                }
                static string ChildName(AttendanceEmployeeDTO emp)
                {
                    var agm = Clean(emp.AGMWorkSpaceName);
                    var dgm = Clean(emp.DGMWorkSpaceName);
                    var service = Clean(emp.ServiceUnitName);
                    if (agm.Length > 0) return dgm.Length > 0 ? dgm : service;
                    return dgm.Length > 0 && service.Length > 0 ? service : "";
                }

                var tree = emps
                    .GroupBy(ParentName)
                    .OrderBy(g => g.Key)
                    .Select(g => new
                    {
                        agm = g.Key,
                        dgms = g
                            .Select(ChildName)
                            .Where(d => !string.IsNullOrWhiteSpace(d) &&
                                        !string.Equals(d, g.Key, StringComparison.OrdinalIgnoreCase))
                            .Distinct()
                            .OrderBy(d => d)
                            .ToList()
                    })
                    .ToList();
                return Ok(tree);
            }
            catch (Exception ex) { _logger.LogError(ex, "Workspace list error"); return Problem(title: "Failed to fetch workspace list.", statusCode: 500); }
        }

        [HttpGet("absent")]
        public async Task<IActionResult> GetAbsentEmployees([FromQuery] string? date = null)
        {
            DateOnly d;
            if (date == null)
                d = DateOnly.FromDateTime(DateTime.Now);
            else if (!DateOnly.TryParse(date, out d))
                return BadRequest("Invalid date. Use yyyy-MM-dd");

            try
            {
                var allowedEpfs = await GetAllowedEpfsAsync(
                    allowOwn: false,
                    ReportsAssignedPermissions,
                    ReportsAllPermissions);
                if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();
                return Ok(await _repo.GetAbsentEmployeesAsync(d, allowedEpfs));
            }
            catch (Exception ex) { _logger.LogError(ex, "Absent employees error"); return Problem(title: "Failed to fetch absent employees.", statusCode: 500); }
        }

        [HttpGet("ot-summary")]
        public async Task<IActionResult> GetOTSummary([FromQuery] string from, [FromQuery] string to, [FromQuery] string? epfNo = null)
        {
            if (!TryParseRange(from, to, out var f, out var t, out var error)) return error!;

            if (!string.IsNullOrWhiteSpace(epfNo) &&
                !await CanAccessEpfAsync(
                    epfNo,
                    OtSummaryAssignedPermissions,
                    OtSummaryAllPermissions))
                return Forbid();

            try
            {
                var allowedEpfs = await GetAllowedEpfsAsync(
                    allowOwn: true,
                    OtSummaryAssignedPermissions,
                    OtSummaryAllPermissions);
                if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();
                return Ok(await _repo.GetOTSummaryAsync(f, t, epfNo, allowedEpfs));
            }
            catch (Exception ex) { _logger.LogError(ex, "OT summary error"); return Problem(title: "Failed to generate OT summary report.", statusCode: 500); }
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

        private bool TryParseRange(
            string from,
            string to,
            out DateOnly f,
            out DateOnly t,
            out IActionResult? error)
        {
            f = default;
            t = default;

            if (!DateOnly.TryParse(from, out f) || !DateOnly.TryParse(to, out t))
            {
                error = BadRequest("Invalid date. Use yyyy-MM-dd");
                return false;
            }

            if (f > t)
            {
                error = BadRequest("from must not be after to");
                return false;
            }

            error = null;
            return true;
        }
    }
}
