using AttendanceSystem.API.Authorization;
using AttendanceSystem.API.DB;
using AttendanceSystem.API.DB.Models;
using AttendanceSystem.API.DTOs;
using AttendanceSystem.API.Repository;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AttendanceSystem.API.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class SystemHealthController : ControllerBase
    {
        private static readonly string[] LeaveClerkRoleNames =
        [
            "LeaveClerk",
            "LEAVE_CLERK",
            "ATTENDANCE_CLERK",
            "CLERK"
        ];

        private readonly AppDbContext _appDb;
        private readonly AttendanceERPDbContext _attendanceDb;
        private readonly ERPDBContext _erpDb;
        private readonly LeaveDbContext _leaveDb;
        private readonly AttendanceRepository _repo;
        private readonly AttendanceAccessService _access;
        private readonly ILogger<SystemHealthController> _logger;

        public SystemHealthController(
            AppDbContext appDb,
            AttendanceERPDbContext attendanceDb,
            ERPDBContext erpDb,
            LeaveDbContext leaveDb,
            AttendanceRepository repo,
            AttendanceAccessService access,
            ILogger<SystemHealthController> logger)
        {
            _appDb = appDb;
            _attendanceDb = attendanceDb;
            _erpDb = erpDb;
            _leaveDb = leaveDb;
            _repo = repo;
            _access = access;
            _logger = logger;
        }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] string? date = null)
        {
            if (!_access.CanViewSystemHealth(User)) return Forbid();

            DateOnly selectedDate;
            if (string.IsNullOrWhiteSpace(date))
                selectedDate = DateOnly.FromDateTime(DateTime.Now);
            else if (!DateOnly.TryParse(date, out selectedDate))
                return BadRequest("Invalid date. Use yyyy-MM-dd.");

            var dto = new SystemHealthDTO
            {
                GeneratedAt = DateTime.UtcNow,
                SelectedDate = selectedDate.ToString("yyyy-MM-dd")
            };

            Dictionary<string, DataSourceHealth> savedHealth = [];
            var appConnected = await CanConnectAsync(_appDb, "AttendanceSystemDB", dto);
            if (appConnected)
            {
                savedHealth = await _appDb.DataSourceHealth
                    .AsNoTracking()
                    .ToDictionaryAsync(h => h.SourceName, StringComparer.OrdinalIgnoreCase);
            }

            var attendanceConnected = await CanConnectAsync(_attendanceDb, "AttendanceERP", dto, savedHealth);
            var erpConnected = await CanConnectAsync(_erpDb, "CECB_ERP", dto, savedHealth);
            var leaveConnected = await CanConnectAsync(_leaveDb, "LeaveDB", dto, savedHealth);

            await LoadAttendanceHealthAsync(dto, selectedDate, attendanceConnected);
            var activeEmployeeIds = await LoadEmployeeHealthAsync(dto, erpConnected, appConnected);
            await LoadAssignmentHealthAsync(dto, activeEmployeeIds, leaveConnected);
            AddReadinessChecks(dto, selectedDate);

            dto.Status = OverallStatus(dto.Checks);
            return Ok(dto);
        }

        private async Task LoadAttendanceHealthAsync(SystemHealthDTO dto, DateOnly selectedDate, bool canConnect)
        {
            if (!canConnect) return;

            try
            {
                var latestFirstPunchDate = await _attendanceDb.FPDataset.AsNoTracking().MaxAsync(p => p.FirstPunchDate);
                var latestLastPunchDate = await _attendanceDb.FPDataset.AsNoTracking().MaxAsync(p => p.LastPunchDate);
                var latestPunchDate = LatestDate(latestFirstPunchDate, latestLastPunchDate);
                dto.LatestPunchDate = latestPunchDate?.ToString("yyyy-MM-dd");
                dto.LatestPunchReceivedAt = await _attendanceDb.FPDataset.AsNoTracking().MaxAsync(p => p.ReceivedAt);

                var selectedPunches = _attendanceDb.FPDataset
                    .AsNoTracking()
                    .Where(p => (p.FirstPunchDate ?? p.LastPunchDate) == selectedDate);

                dto.SelectedDatePunchRecords = await selectedPunches.CountAsync();
                dto.SelectedDatePunchEmployees = await selectedPunches
                    .Where(p => p.EPFNo != null && p.EPFNo != "")
                    .Select(p => p.EPFNo)
                    .Distinct()
                    .CountAsync();

                var selectedDateIsFuture = selectedDate > DateOnly.FromDateTime(DateTime.Now);
                var selectedDateHasData = dto.SelectedDatePunchRecords > 0;
                var stale = latestPunchDate.HasValue && latestPunchDate.Value < selectedDate;

                dto.Checks.Add(Check(
                    "AttendanceERP",
                    "Selected Date Punch Data",
                    selectedDateIsFuture || selectedDateHasData ? "OK" : "Warning",
                    dto.SelectedDatePunchRecords.ToString(),
                    selectedDateHasData
                        ? "Punch data exists for the selected working date."
                        : selectedDateIsFuture
                            ? "Selected date is in the future."
                            : stale
                                ? $"No punch data for selected date. Latest available punch date is {latestPunchDate:yyyy-MM-dd}."
                                : "No punch data found for the selected date.",
                    selectedDateHasData ? null : "Check AttendanceERP import/sync job."));

                dto.Checks.Add(Check(
                    "AttendanceERP",
                    "Latest Punch Date",
                    latestPunchDate.HasValue ? "OK" : "Error",
                    dto.LatestPunchDate ?? "-",
                    latestPunchDate.HasValue
                        ? "AttendanceERP contains punch data."
                        : "AttendanceERP FPDataset has no punch data.",
                    latestPunchDate.HasValue ? null : "Check AttendanceERP connection and import configuration."));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "AttendanceERP health query failed.");
                dto.Checks.Add(Check("AttendanceERP", "Punch Data Query", "Error", "-", "Could not read AttendanceERP punch data.", ex.Message));
            }
        }

        private async Task<HashSet<Guid>> LoadEmployeeHealthAsync(SystemHealthDTO dto, bool erpConnected, bool appConnected)
        {
            var activeEmployeeIds = new HashSet<Guid>();
            if (!erpConnected) return activeEmployeeIds;

            try
            {
                dto.ErpEmployeeCount = await _erpDb.employeeVersions.AsNoTracking().CountAsync();

                var activeEmployees = await _repo.GetEmployeesAsync();
                dto.ActiveEmployeeCount = activeEmployees.Count;
                activeEmployeeIds = activeEmployees
                    .Where(e => e.EmployeeId.HasValue)
                    .Select(e => e.EmployeeId!.Value)
                    .ToHashSet();

                dto.EmployeesMissingSchedule = activeEmployees.Count(e =>
                    !e.InHour.HasValue ||
                    !e.InMinute.HasValue ||
                    !e.OutHour.HasValue ||
                    !e.OutMinute.HasValue);

                if (appConnected)
                    dto.ScheduleSnapshotCount = await _appDb.EmployeeScheduleSnapshots.AsNoTracking().CountAsync();

                dto.Checks.Add(Check(
                    "Employees",
                    "Active ERP Employees",
                    dto.ActiveEmployeeCount > 0 ? "OK" : "Error",
                    dto.ActiveEmployeeCount.ToString(),
                    dto.ActiveEmployeeCount > 0
                        ? "Active employee master data is available."
                        : "No active employees were found in CECB_ERP.",
                    dto.ActiveEmployeeCount > 0 ? null : "Check ERP employee master data."));

                dto.Checks.Add(Check(
                    "Employees",
                    "Schedule Alignment",
                    dto.EmployeesMissingSchedule == 0 ? "OK" : "Warning",
                    $"{dto.ActiveEmployeeCount - dto.EmployeesMissingSchedule}/{dto.ActiveEmployeeCount}",
                    dto.EmployeesMissingSchedule == 0
                        ? "All active employees have in/out schedule data."
                        : $"{dto.EmployeesMissingSchedule} active employee(s) are using missing/default schedule data.",
                    dto.EmployeesMissingSchedule == 0 ? null : "Refresh the schedule cache and check In/Out Times in the assignment data source."));

                if (appConnected)
                {
                    var snapshotStatus = dto.ScheduleSnapshotCount >= dto.ActiveEmployeeCount ? "OK" : "Warning";
                    dto.Checks.Add(Check(
                        "Employees",
                        "Schedule Snapshot",
                        snapshotStatus,
                        dto.ScheduleSnapshotCount.ToString(),
                        snapshotStatus == "OK"
                            ? "AttendanceSystemDB schedule snapshots cover active employees."
                            : "Schedule snapshots are fewer than active employees.",
                        snapshotStatus == "OK" ? null : "Run schedule cache refresh."));
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Employee health query failed.");
                dto.Checks.Add(Check("Employees", "Employee Alignment", "Error", "-", "Could not read employee alignment data.", ex.Message));
            }

            return activeEmployeeIds;
        }

        private async Task LoadAssignmentHealthAsync(SystemHealthDTO dto, HashSet<Guid> activeEmployeeIds, bool leaveConnected)
        {
            if (!leaveConnected) return;

            try
            {
                dto.AssignmentRows = await _leaveDb.AssignedEmployees.AsNoTracking().CountAsync();

                var activeAssignments = await _leaveDb.AssignedEmployees
                    .AsNoTracking()
                    .Where(a => activeEmployeeIds.Contains(a.EmployeeId))
                    .ToListAsync();

                dto.ActiveAssignmentRows = activeAssignments.Count;
                dto.AssignedEmployees = activeAssignments.Count(a => a.LeaveClerkEmployeeId.HasValue);
                dto.UnassignedEmployees = activeAssignments.Count(a => !a.LeaveClerkEmployeeId.HasValue);
                dto.InactiveAssignmentRows = Math.Max(0, dto.AssignmentRows - dto.ActiveAssignmentRows);
                dto.InvalidClerkAssignments = activeAssignments.Count(a =>
                    a.LeaveClerkEmployeeId.HasValue &&
                    !activeEmployeeIds.Contains(a.LeaveClerkEmployeeId.Value));

                dto.ActiveLeaveClerks = await GetActiveLeaveClerkCountAsync(activeEmployeeIds);

                dto.Checks.Add(Check(
                    "Correction Access",
                    "Employee Coverage",
                    dto.UnassignedEmployees == 0 ? "OK" : "Warning",
                    $"{dto.AssignedEmployees}/{dto.ActiveAssignmentRows}",
                    dto.UnassignedEmployees == 0
                        ? "All active employees have an Attendance Clerk."
                        : $"{dto.UnassignedEmployees} active employee(s) need an Attendance Clerk.",
                    dto.UnassignedEmployees == 0 ? null : "Open Correction Access and assign the missing employees."));

                dto.Checks.Add(Check(
                    "Correction Access",
                    "Inactive Rows Skipped",
                    dto.InactiveAssignmentRows == 0 ? "OK" : "Warning",
                    dto.InactiveAssignmentRows.ToString(),
                    dto.InactiveAssignmentRows == 0
                        ? "No inactive employee assignment rows are counted."
                        : "Inactive employee rows exist in the assignment data source and are skipped by Correction Access.",
                    dto.InactiveAssignmentRows == 0 ? null : "Keep these rows skipped or clean the assignment data source if required."));

                dto.Checks.Add(Check(
                    "Correction Access",
                    "Active Attendance Clerks",
                    dto.ActiveLeaveClerks > 0 ? "OK" : "Error",
                    dto.ActiveLeaveClerks.ToString(),
                    dto.ActiveLeaveClerks > 0
                        ? "Active Attendance Clerks are available."
                        : "No active Attendance Clerk users were found.",
                    dto.ActiveLeaveClerks > 0 ? null : "Check Attendance Clerk roles and active status in the assignment data source."));

                if (dto.InvalidClerkAssignments > 0)
                {
                    dto.Checks.Add(Check(
                        "Correction Access",
                        "Attendance Clerk References",
                        "Warning",
                        dto.InvalidClerkAssignments.ToString(),
                        "Some active assignments point to inactive or missing Attendance Clerk employees.",
                        "Reassign those employees to an active Attendance Clerk."));
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Leave clerk assignment health query failed.");
                dto.Checks.Add(Check("Correction Access", "Access Query", "Error", "-", "Could not read Correction Access data.", ex.Message));
            }
        }

        private async Task<int> GetActiveLeaveClerkCountAsync(HashSet<Guid> activeEmployeeIds)
        {
            if (activeEmployeeIds.Count == 0) return 0;

            var roleIds = await _leaveDb.Roles
                .AsNoTracking()
                .Where(r => LeaveClerkRoleNames.Contains(r.RoleName))
                .Select(r => r.RoleId)
                .ToListAsync();

            if (roleIds.Count == 0) return 0;

            return await (
                from user in _leaveDb.Users.AsNoTracking()
                join userRole in _leaveDb.UserRoles.AsNoTracking() on user.UserId equals userRole.UserId
                where user.IsActive &&
                      roleIds.Contains(userRole.RoleId) &&
                      activeEmployeeIds.Contains(user.EmployeeId)
                select user.EmployeeId)
                .Distinct()
                .CountAsync();
        }

        private void AddReadinessChecks(SystemHealthDTO dto, DateOnly selectedDate)
        {
            var hasEmployees = dto.ActiveEmployeeCount > 0;
            var hasPunchSource = !string.IsNullOrWhiteSpace(dto.LatestPunchDate);
            var selectedIsFuture = selectedDate > DateOnly.FromDateTime(DateTime.Now);
            var selectedHasPunches = selectedIsFuture || dto.SelectedDatePunchRecords > 0;

            dto.Checks.Add(Check(
                "Reports",
                "Attendance Reports",
                hasEmployees && hasPunchSource ? "OK" : "Error",
                hasEmployees && hasPunchSource ? "Ready" : "Not Ready",
                hasEmployees && hasPunchSource
                    ? "Employee and punch data are available for report generation."
                    : "Report generation needs active employee data and AttendanceERP punch data.",
                hasEmployees && hasPunchSource ? null : "Check CECB_ERP and AttendanceERP sources."));

            dto.Checks.Add(Check(
                "Reports",
                "Selected Date Readiness",
                selectedHasPunches ? "OK" : "Warning",
                dto.SelectedDate,
                selectedHasPunches
                    ? "Selected date is ready or future-dated."
                    : "Selected date has no AttendanceERP punch records.",
                selectedHasPunches ? null : "Check latest punch date and import/sync job."));
        }

        private async Task<bool> CanConnectAsync(DbContext db, string sourceName, SystemHealthDTO dto, Dictionary<string, DataSourceHealth>? savedHealth = null)
        {
            try
            {
                var canConnect = await db.Database.CanConnectAsync();
                DataSourceHealth? saved = null;
                savedHealth?.TryGetValue(sourceName, out saved);

                dto.Sources.Add(new SystemHealthSourceDTO
                {
                    SourceName = sourceName,
                    CanConnect = canConnect,
                    Status = canConnect ? saved?.Status ?? "OK" : "Error",
                    LastCheckedAt = saved?.LastCheckedAt,
                    LastSuccessAt = saved?.LastSuccessAt,
                    Message = canConnect
                        ? saved?.Message ?? "Connection OK."
                        : "Database connection failed."
                });

                dto.Checks.Add(Check(
                    "Data Sources",
                    sourceName,
                    canConnect ? "OK" : "Error",
                    canConnect ? "Connected" : "Failed",
                    canConnect ? "Database connection OK." : "Database connection failed.",
                    canConnect ? null : $"Check {sourceName} connection string and database availability."));

                return canConnect;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "{SourceName} connection check failed.", sourceName);
                dto.Sources.Add(new SystemHealthSourceDTO
                {
                    SourceName = sourceName,
                    CanConnect = false,
                    Status = "Error",
                    Message = ex.Message
                });
                dto.Checks.Add(Check("Data Sources", sourceName, "Error", "Failed", "Database connection check failed.", ex.Message));
                return false;
            }
        }

        private static DateOnly? LatestDate(DateOnly? first, DateOnly? second)
        {
            if (!first.HasValue) return second;
            if (!second.HasValue) return first;
            return first.Value >= second.Value ? first : second;
        }

        private static SystemHealthCheckDTO Check(string area, string label, string status, string value, string message, string? action = null) =>
            new()
            {
                Area = area,
                Label = label,
                Status = status,
                Value = value,
                Message = message,
                Action = action
            };

        private static string OverallStatus(IEnumerable<SystemHealthCheckDTO> checks)
        {
            var list = checks.ToList();
            if (list.Any(c => string.Equals(c.Status, "Error", StringComparison.OrdinalIgnoreCase))) return "Error";
            if (list.Any(c => string.Equals(c.Status, "Warning", StringComparison.OrdinalIgnoreCase))) return "Warning";
            return "OK";
        }
    }
}
