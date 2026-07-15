using AttendanceSystem.API.Authorization;
using AttendanceSystem.API.DB;
using AttendanceSystem.API.DB.Models;
using AttendanceSystem.API.DTOs;
using AttendanceSystem.API.Repository;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace AttendanceSystem.API.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class LeaveClerkAssignmentController : ControllerBase
    {
        private static readonly string[] LeaveClerkRoleNames =
        [
            "LeaveClerk",
            "LEAVE_CLERK",
            "ATTENDANCE_CLERK",
            "CLERK"
        ];

        private readonly LeaveDbContext _leaveDb;
        private readonly AppDbContext _appDb;
        private readonly AttendanceRepository _repo;
        private readonly AttendanceAccessService _access;
        private readonly ILogger<LeaveClerkAssignmentController> _logger;

        public LeaveClerkAssignmentController(
            LeaveDbContext leaveDb,
            AppDbContext appDb,
            AttendanceRepository repo,
            AttendanceAccessService access,
            ILogger<LeaveClerkAssignmentController> logger)
        {
            _leaveDb = leaveDb;
            _appDb = appDb;
            _repo = repo;
            _access = access;
            _logger = logger;
        }

        [HttpGet("clerks")]
        public async Task<IActionResult> GetClerks()
        {
            if (!_access.CanManageClerkAssignments(User)) return Forbid();
            return Ok(await GetActiveLeaveClerksAsync());
        }

        [HttpGet("assignments")]
        public async Task<IActionResult> GetAssignments(
            [FromQuery] Guid? clerkEmployeeId = null,
            [FromQuery] string status = "unassigned",
            [FromQuery] string? keyword = null,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 50)
        {
            if (!_access.CanManageClerkAssignments(User)) return Forbid();
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 25, 200);

            var rows = await BuildAssignmentRowsAsync();

            var totalEmployees = rows.Count;
            var assignedEmployees = rows.Count(r => r.LeaveClerkEmployeeId.HasValue);
            var unassignedEmployees = totalEmployees - assignedEmployees;
            var selectedClerkAssignedEmployees = clerkEmployeeId.HasValue
                ? rows.Count(r => r.LeaveClerkEmployeeId == clerkEmployeeId.Value)
                : 0;

            var filtered = status.Trim().ToLowerInvariant() switch
            {
                "assigned" when clerkEmployeeId.HasValue => rows.Where(r => r.LeaveClerkEmployeeId == clerkEmployeeId.Value),
                "assigned" => rows.Where(r => r.LeaveClerkEmployeeId.HasValue),
                "all" => rows,
                _ => rows.Where(r => !r.LeaveClerkEmployeeId.HasValue)
            };

            if (!string.IsNullOrWhiteSpace(keyword))
            {
                var term = keyword.Trim();
                filtered = filtered.Where(r =>
                    Contains(r.EpfNo, term) ||
                    Contains(r.NameWithInitial, term) ||
                    Contains(r.DesignationName, term) ||
                    Contains(r.AgmWorkSpaceName, term) ||
                    Contains(r.DgmWorkSpaceName, term) ||
                    Contains(r.ServiceUnitName, term) ||
                    Contains(r.LeaveClerkEpfNo, term) ||
                    Contains(r.LeaveClerkName, term));
            }

            var ordered = filtered
                .OrderBy(r => r.AssignmentStatus)
                .ThenBy(r => AttendanceAccessService.NormalizeEpf(r.EpfNo))
                .ToList();
            var totalCount = ordered.Count;

            return Ok(new LeaveClerkAssignmentPageDTO
            {
                Page = page,
                PageSize = pageSize,
                TotalCount = totalCount,
                TotalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize),
                TotalEmployees = totalEmployees,
                AssignedEmployees = assignedEmployees,
                UnassignedEmployees = unassignedEmployees,
                SelectedClerkAssignedEmployees = selectedClerkAssignedEmployees,
                Items = ordered.Skip((page - 1) * pageSize).Take(pageSize).ToList()
            });
        }

        [HttpPost("assign")]
        public async Task<IActionResult> Assign([FromBody] LeaveClerkAssignRequestDTO dto)
        {
            if (!_access.CanManageClerkAssignments(User)) return Forbid();
            if (dto.ClerkEmployeeId == Guid.Empty) return BadRequest("Attendance Clerk employee id is required.");
            var employeeIds = CleanEmployeeIds(dto.EmployeeIds);
            if (employeeIds.Count == 0) return BadRequest("Select at least one employee.");
            if (!await IsActiveLeaveClerkAsync(dto.ClerkEmployeeId)) return BadRequest("Selected employee is not an active Attendance Clerk.");
            var activeEmployeeIds = await GetActiveEmployeeIdsAsync();
            var skippedInactive = employeeIds.RemoveAll(id => !activeEmployeeIds.Contains(id));
            if (employeeIds.Count == 0) return BadRequest("Selected employees are not active in CECB_ERP.");

            var now = DateTime.UtcNow;
            var user = GetUserInfo();
            var epfMap = await GetLeaveUserEpfMapAsync();
            var audits = new List<LeaveClerkAssignmentAudit>();
            var updated = 0;

            await using var tx = await _leaveDb.Database.BeginTransactionAsync();
            var rows = await _leaveDb.AssignedEmployees
                .Where(x => employeeIds.Contains(x.EmployeeId))
                .ToListAsync();

            if (rows.Count == 0) return BadRequest("Selected employees were not found in the assignment data source.");

            foreach (var row in rows)
            {
                if (row.LeaveClerkEmployeeId == dto.ClerkEmployeeId) continue;
                var previousClerkId = row.LeaveClerkEmployeeId;
                row.LeaveClerkEmployeeId = dto.ClerkEmployeeId;
                updated++;

                audits.Add(ToAudit(
                    "Assign",
                    row.EmployeeId,
                    previousClerkId,
                    dto.ClerkEmployeeId,
                    epfMap,
                    user,
                    now,
                    "Manual assign"));
            }

            await _leaveDb.SaveChangesAsync();
            await tx.CommitAsync();
            await SaveAuditsAsync(audits);

            return Ok(new LeaveClerkAssignmentResultDTO
            {
                UpdatedCount = updated,
                Message = FormatResultMessage(
                    updated == 0 ? "No assign changes were needed." : $"{updated} employee(s) assigned.",
                    skippedInactive)
            });
        }

        [HttpPost("unassign")]
        public async Task<IActionResult> Unassign([FromBody] LeaveClerkUnassignRequestDTO dto)
        {
            if (!_access.CanManageClerkAssignments(User)) return Forbid();
            var employeeIds = CleanEmployeeIds(dto.EmployeeIds);
            if (employeeIds.Count == 0) return BadRequest("Select at least one employee.");
            var activeEmployeeIds = await GetActiveEmployeeIdsAsync();
            var skippedInactive = employeeIds.RemoveAll(id => !activeEmployeeIds.Contains(id));
            if (employeeIds.Count == 0) return BadRequest("Selected employees are not active in CECB_ERP.");

            var now = DateTime.UtcNow;
            var user = GetUserInfo();
            var epfMap = await GetLeaveUserEpfMapAsync();
            var audits = new List<LeaveClerkAssignmentAudit>();
            var updated = 0;
            var skippedChangedAssignment = 0;

            await using var tx = await _leaveDb.Database.BeginTransactionAsync();
            var rows = await _leaveDb.AssignedEmployees
                .Where(x => employeeIds.Contains(x.EmployeeId))
                .ToListAsync();

            if (rows.Count == 0) return BadRequest("Selected employees were not found in the assignment data source.");

            foreach (var row in rows)
            {
                Guid? previousClerkId;
                if (dto.ExpectedClerkEmployeeId.HasValue &&
                    row.LeaveClerkEmployeeId != dto.ExpectedClerkEmployeeId.Value)
                {
                    skippedChangedAssignment++;
                    continue;
                }

                if (dto.ExpectedClerkEmployeeId.HasValue)
                {
                    // Keep the expected-clerk check in the UPDATE predicate as well as
                    // the loaded-state check. This prevents a concurrent reassignment
                    // from being cleared between the read above and this write.
                    var expectedClerkEmployeeId = dto.ExpectedClerkEmployeeId.Value;
                    var affected = await _leaveDb.AssignedEmployees
                        .Where(x => x.AssignedId == row.AssignedId &&
                                    x.LeaveClerkEmployeeId == expectedClerkEmployeeId)
                        .ExecuteUpdateAsync(setters => setters
                            .SetProperty(x => x.LeaveClerkEmployeeId, (Guid?)null));

                    if (affected == 0)
                    {
                        skippedChangedAssignment++;
                        continue;
                    }

                    previousClerkId = expectedClerkEmployeeId;
                }
                else
                {
                    // Backward compatibility for clients that omit the optional expected
                    // clerk: retain the original unassign-current behavior.
                    if (!row.LeaveClerkEmployeeId.HasValue) continue;
                    previousClerkId = row.LeaveClerkEmployeeId;
                    row.LeaveClerkEmployeeId = null;
                }

                updated++;

                audits.Add(ToAudit(
                    "Unassign",
                    row.EmployeeId,
                    previousClerkId,
                    null,
                    epfMap,
                    user,
                    now,
                    "Manual unassign"));
            }

            await _leaveDb.SaveChangesAsync();
            await tx.CommitAsync();
            await SaveAuditsAsync(audits);

            var message = FormatResultMessage(
                updated == 0 ? "No assigned rows were selected." : $"{updated} employee(s) unassigned.",
                skippedInactive);
            if (skippedChangedAssignment > 0)
            {
                message += $" Skipped {skippedChangedAssignment} employee(s) because their clerk assignment changed; refresh and try again.";
            }

            return Ok(new LeaveClerkAssignmentResultDTO
            {
                UpdatedCount = updated,
                Message = message
            });
        }

        [HttpPost("auto-assign")]
        public async Task<IActionResult> AutoAssign([FromBody] LeaveClerkAutoAssignRequestDTO dto)
        {
            if (!_access.CanManageClerkAssignments(User)) return Forbid();

            var clerks = await GetActiveLeaveClerksAsync();
            if (dto.ClerkEmployeeIds.Count > 0)
            {
                var requested = dto.ClerkEmployeeIds.Distinct().ToHashSet();
                clerks = clerks.Where(c => requested.Contains(c.EmployeeId)).ToList();
            }

            if (clerks.Count == 0) return BadRequest("No active Attendance Clerk users found for automatic assignment.");

            var now = DateTime.UtcNow;
            var user = GetUserInfo();
            var epfMap = await GetLeaveUserEpfMapAsync();
            var clerkLoad = clerks.ToDictionary(c => c.EmployeeId, c => c.AssignedCount);
            var activeEmployeeIds = await GetActiveEmployeeIdsAsync();
            var audits = new List<LeaveClerkAssignmentAudit>();
            var updated = 0;

            await using var tx = await _leaveDb.Database.BeginTransactionAsync();
            var unassigned = await _leaveDb.AssignedEmployees
                .Where(x => x.LeaveClerkEmployeeId == null && activeEmployeeIds.Contains(x.EmployeeId))
                .OrderBy(x => x.EmployeeId)
                .ToListAsync();

            foreach (var row in unassigned)
            {
                var nextClerk = clerks
                    .OrderBy(c => clerkLoad[c.EmployeeId])
                    .ThenBy(c => AttendanceAccessService.NormalizeEpf(c.EpfNo))
                    .First();

                row.LeaveClerkEmployeeId = nextClerk.EmployeeId;
                clerkLoad[nextClerk.EmployeeId]++;
                updated++;

                audits.Add(ToAudit(
                    "AutoAssign",
                    row.EmployeeId,
                    null,
                    nextClerk.EmployeeId,
                    epfMap,
                    user,
                    now,
                    "Auto assigned unassigned employee"));
            }

            await _leaveDb.SaveChangesAsync();
            await tx.CommitAsync();
            await SaveAuditsAsync(audits);

            return Ok(new LeaveClerkAssignmentResultDTO
            {
                UpdatedCount = updated,
                Message = updated == 0 ? "No unassigned employees found." : $"{updated} unassigned employee(s) auto assigned."
            });
        }

        [HttpGet("audit")]
        public async Task<IActionResult> GetAudit([FromQuery] int take = 25)
        {
            if (!_access.CanManageClerkAssignments(User)) return Forbid();
            take = Math.Clamp(take, 5, 100);

            var rows = await _appDb.LeaveClerkAssignmentAudits
                .AsNoTracking()
                .OrderByDescending(x => x.ChangedAt)
                .Take(take)
                .Select(x => new LeaveClerkAssignmentAuditDTO
                {
                    Id = x.Id,
                    Action = x.Action,
                    EmployeeId = x.EmployeeId,
                    EmployeeEpfNo = x.EmployeeEpfNo,
                    PreviousClerkEmployeeId = x.PreviousClerkEmployeeId,
                    PreviousClerkEpfNo = x.PreviousClerkEpfNo,
                    NewClerkEmployeeId = x.NewClerkEmployeeId,
                    NewClerkEpfNo = x.NewClerkEpfNo,
                    ChangedByName = x.ChangedByName,
                    ChangedByEpfNo = x.ChangedByEpfNo,
                    Remarks = x.Remarks,
                    ChangedAt = x.ChangedAt
                })
                .ToListAsync();

            return Ok(rows);
        }

        [HttpGet("/api/User/GetLeaveClerkWiseEmployeeList/{leaveClerkEpf?}")]
        [HttpGet("/api/User/getleaveclerkwsemployeelist/{leaveClerkEpf?}")]
        [HttpGet("leave-clerk-wise-employee-list/{leaveClerkEpf?}")]
        public async Task<IActionResult> GetLeaveClerkWiseEmployeeList(string? leaveClerkEpf = null)
        {
            var canManage = _access.CanManageClerkAssignments(User);
            if (!canManage && !_access.IsLeaveClerkUser(User)) return Forbid();

            var callerEpf = AttendanceAccessService.NormalizeEpf(_access.GetCallerEpf(User));
            var requestedEpf = AttendanceAccessService.NormalizeEpf(
                string.IsNullOrWhiteSpace(leaveClerkEpf) ? callerEpf : leaveClerkEpf);

            if (string.IsNullOrWhiteSpace(requestedEpf))
                return BadRequest("Attendance Clerk EPF is required.");

            if (!canManage && !string.Equals(requestedEpf, callerEpf, StringComparison.OrdinalIgnoreCase))
                return Forbid();

            var clerk = (await GetActiveLeaveClerksAsync())
                .FirstOrDefault(c => string.Equals(
                    AttendanceAccessService.NormalizeEpf(c.EpfNo),
                    requestedEpf,
                    StringComparison.OrdinalIgnoreCase));

            if (clerk == null)
                return NotFound($"Active Attendance Clerk not found for EPF {requestedEpf}.");

            var employees = (await BuildAssignmentRowsAsync())
                .Where(r => r.LeaveClerkEmployeeId == clerk.EmployeeId)
                .OrderBy(r => AttendanceAccessService.NormalizeEpf(r.EpfNo))
                .ToList();

            return Ok(employees);
        }

        private async Task<List<LeaveClerkDTO>> GetActiveLeaveClerksAsync()
        {
            var roleIds = await _leaveDb.Roles
                .AsNoTracking()
                .Where(r => LeaveClerkRoleNames.Contains(r.RoleName))
                .Select(r => r.RoleId)
                .ToListAsync();

            if (roleIds.Count == 0) return [];

            var clerkUsers = await (
                from user in _leaveDb.Users.AsNoTracking()
                join userRole in _leaveDb.UserRoles.AsNoTracking() on user.UserId equals userRole.UserId
                where user.IsActive && roleIds.Contains(userRole.RoleId)
                select new { user.UserId, user.EmployeeId, user.EPFNo, user.IsActive })
                .Distinct()
                .ToListAsync();

            if (clerkUsers.Count == 0) return [];

            var employeeMap = await GetEmployeeMapByIdAsync();
            var activeEmployeeIds = employeeMap.Keys.ToList();

            var counts = await _leaveDb.AssignedEmployees
                .AsNoTracking()
                .Where(x => x.LeaveClerkEmployeeId != null && activeEmployeeIds.Contains(x.EmployeeId))
                .GroupBy(x => x.LeaveClerkEmployeeId!.Value)
                .Select(g => new { EmployeeId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.EmployeeId, x => x.Count);

            return clerkUsers
                .GroupBy(x => x.EmployeeId)
                .Select(g => g.First())
                .Where(c => employeeMap.ContainsKey(c.EmployeeId))
                .Select(c =>
                {
                    employeeMap.TryGetValue(c.EmployeeId, out var employee);
                    counts.TryGetValue(c.EmployeeId, out var count);
                    return new LeaveClerkDTO
                    {
                        UserId = c.UserId,
                        EmployeeId = c.EmployeeId,
                        EpfNo = AttendanceAccessService.NormalizeEpf(c.EPFNo),
                        NameWithInitial = employee?.NameWithInitial,
                        IsActive = c.IsActive,
                        AssignedCount = count
                    };
                })
                .OrderBy(c => AttendanceAccessService.NormalizeEpf(c.EpfNo))
                .ToList();
        }

        private async Task<bool> IsActiveLeaveClerkAsync(Guid employeeId)
        {
            var clerks = await GetActiveLeaveClerksAsync();
            return clerks.Any(c => c.EmployeeId == employeeId);
        }

        private async Task<List<LeaveClerkAssignmentRowDTO>> BuildAssignmentRowsAsync()
        {
            var employeeMap = await GetEmployeeMapByIdAsync();
            if (employeeMap.Count == 0) return [];

            var activeEmployeeIds = employeeMap.Keys.ToList();
            var assignments = await _leaveDb.AssignedEmployees
                .AsNoTracking()
                .Where(a => activeEmployeeIds.Contains(a.EmployeeId))
                .ToListAsync();
            if (assignments.Count == 0) return [];

            var assignmentEmployeeIds = assignments.Select(a => a.EmployeeId).ToHashSet();
            var clerkEmployeeIds = assignments
                .Where(a => a.LeaveClerkEmployeeId.HasValue)
                .Select(a => a.LeaveClerkEmployeeId!.Value)
                .ToHashSet();
            var relatedEmployeeIds = assignmentEmployeeIds
                .Concat(clerkEmployeeIds)
                .Distinct()
                .ToList();

            var leaveUsers = await _leaveDb.Users
                .AsNoTracking()
                .Where(u => relatedEmployeeIds.Contains(u.EmployeeId))
                .ToListAsync();
            var leaveUserByEmployeeId = leaveUsers
                .GroupBy(u => u.EmployeeId)
                .ToDictionary(g => g.Key, g => g.First());

            return assignments.Select(a =>
            {
                employeeMap.TryGetValue(a.EmployeeId, out var employee);
                leaveUserByEmployeeId.TryGetValue(a.EmployeeId, out var leaveEmployee);

                LeaveUser? clerkUser = null;
                AttendanceEmployeeDTO? clerkEmployee = null;
                if (a.LeaveClerkEmployeeId.HasValue)
                {
                    leaveUserByEmployeeId.TryGetValue(a.LeaveClerkEmployeeId.Value, out clerkUser);
                    employeeMap.TryGetValue(a.LeaveClerkEmployeeId.Value, out clerkEmployee);
                }

                var epf = employee?.EpfNo ?? leaveEmployee?.EPFNo;
                return new LeaveClerkAssignmentRowDTO
                {
                    AssignedId = a.AssignedId,
                    EmployeeId = a.EmployeeId,
                    EpfNo = string.IsNullOrWhiteSpace(epf) ? null : AttendanceAccessService.NormalizeEpf(epf),
                    NameWithInitial = employee?.NameWithInitial,
                    DesignationName = employee?.DesignationName,
                    AgmWorkSpaceName = employee?.AGMWorkSpaceName,
                    DgmWorkSpaceName = employee?.DGMWorkSpaceName,
                    ServiceUnitName = employee?.ServiceUnitName,
                    LeaveClerkEmployeeId = a.LeaveClerkEmployeeId,
                    LeaveClerkEpfNo = clerkUser == null ? null : AttendanceAccessService.NormalizeEpf(clerkUser.EPFNo),
                    LeaveClerkName = clerkEmployee?.NameWithInitial,
                    AssignmentStatus = a.LeaveClerkEmployeeId.HasValue ? "Assigned" : "Unassigned"
                };
            }).ToList();
        }

        private async Task<Dictionary<Guid, AttendanceEmployeeDTO>> GetEmployeeMapByIdAsync()
        {
            var employees = await _repo.GetEmployeesAsync();
            return employees
                .Where(e => e.EmployeeId.HasValue)
                .GroupBy(e => e.EmployeeId!.Value)
                .ToDictionary(g => g.Key, g => g.First());
        }

        private async Task<HashSet<Guid>> GetActiveEmployeeIdsAsync()
        {
            var employees = await GetEmployeeMapByIdAsync();
            return employees.Keys.ToHashSet();
        }

        private async Task<Dictionary<Guid, string>> GetLeaveUserEpfMapAsync()
        {
            var users = await _leaveDb.Users.AsNoTracking().ToListAsync();
            return users
                .GroupBy(u => u.EmployeeId)
                .ToDictionary(g => g.Key, g => AttendanceAccessService.NormalizeEpf(g.First().EPFNo));
        }

        private async Task SaveAuditsAsync(List<LeaveClerkAssignmentAudit> audits)
        {
            if (audits.Count == 0) return;

            try
            {
                _appDb.LeaveClerkAssignmentAudits.AddRange(audits);
                await _appDb.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Leave clerk assign audit save failed after assign update.");
            }
        }

        private static LeaveClerkAssignmentAudit ToAudit(
            string action,
            Guid employeeId,
            Guid? previousClerkId,
            Guid? newClerkId,
            Dictionary<Guid, string> epfMap,
            (string? UserId, string Name, string? EpfNo) user,
            DateTime changedAt,
            string remarks) =>
            new()
            {
                Id = Guid.NewGuid(),
                Action = action,
                EmployeeId = employeeId,
                EmployeeEpfNo = epfMap.TryGetValue(employeeId, out var employeeEpf) ? employeeEpf : null,
                PreviousClerkEmployeeId = previousClerkId,
                PreviousClerkEpfNo = previousClerkId.HasValue && epfMap.TryGetValue(previousClerkId.Value, out var previousEpf)
                    ? previousEpf
                    : null,
                NewClerkEmployeeId = newClerkId,
                NewClerkEpfNo = newClerkId.HasValue && epfMap.TryGetValue(newClerkId.Value, out var newEpf)
                    ? newEpf
                    : null,
                ChangedByUserId = user.UserId,
                ChangedByName = user.Name,
                ChangedByEpfNo = user.EpfNo,
                Remarks = remarks,
                ChangedAt = changedAt
            };

        private (string? UserId, string Name, string? EpfNo) GetUserInfo()
        {
            var userId = User.FindFirstValue("userId") ??
                         User.FindFirstValue(ClaimTypes.NameIdentifier) ??
                         User.FindFirstValue("sub");
            var epf = _access.GetCallerEpf(User);
            var name = User.FindFirstValue("fullName") ??
                       User.FindFirstValue("name") ??
                       User.FindFirstValue("username") ??
                       epf ??
                       "Unknown user";
            return (userId, name, string.IsNullOrWhiteSpace(epf) ? null : AttendanceAccessService.NormalizeEpf(epf));
        }

        private static List<Guid> CleanEmployeeIds(IEnumerable<Guid> employeeIds) =>
            employeeIds
                .Where(id => id != Guid.Empty)
                .Distinct()
                .Take(1000)
                .ToList();

        private static string FormatResultMessage(string message, int skippedInactive) =>
            skippedInactive > 0
                ? $"{message} Skipped {skippedInactive} inactive/missing ERP employee(s)."
                : message;

        private static bool Contains(string? value, string keyword) =>
            !string.IsNullOrWhiteSpace(value) &&
            value.Contains(keyword, StringComparison.OrdinalIgnoreCase);
    }
}
