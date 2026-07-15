using AttendanceSystem.API.DB.Auth;
using AttendanceSystem.API.DTOs;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace AttendanceSystem.API.Authorization
{
    public class AttendanceAccessService
    {
        private static readonly string[] AdminRoles =
        [
            "Admin",
            "ADMIN",
            "SUPER_ADMIN",
            "ATTENDANCE_ADMIN",
            "DASHBOARD_ADMIN"
        ];

        private static readonly string[] AssignedRoles =
        [
            "AGM",
            "ATTENDANCE_AGM",
            "CLERK",
            "ATTENDANCE_CLERK"
        ];

        private static readonly string[] LeaveAdminRoles =
        [
            "LeaveAdmin",
            "LEAVE_ADMIN",
            "ATTENDANCE_LEAVE_ADMIN"
        ];

        private static readonly string[] LeaveClerkRoles =
        [
            "CLERK",
            "ATTENDANCE_CLERK",
            "LEAVE_CLERK",
            "LeaveClerk"
        ];

        private readonly CecbAuthDbContext _authDb;
        private readonly ILogger<AttendanceAccessService> _logger;

        public AttendanceAccessService(CecbAuthDbContext authDb, ILogger<AttendanceAccessService> logger)
        {
            _authDb = authDb;
            _logger = logger;
        }

        public bool IsAdminUser(ClaimsPrincipal user) =>
            HasAnyRole(user, AdminRoles);

        public bool CanViewAll(ClaimsPrincipal user) =>
            IsAdminUser(user);

        public bool CanViewAssigned(ClaimsPrincipal user) =>
            CanViewAll(user) || HasAnyRole(user, AssignedRoles);

        public bool CanViewOwn(ClaimsPrincipal user) =>
            CanViewAssigned(user) || HasAnyPermission(user, AttendancePermissions.ViewOwn) || !string.IsNullOrWhiteSpace(GetCallerEpf(user));

        public bool CanManageUsers(ClaimsPrincipal user) =>
            HasAnyRole(user, AdminRoles) || HasPermission(user, AttendancePermissions.SettingsManage);

        public bool CanManageClerkAssignments(ClaimsPrincipal user) =>
            IsAdminUser(user) ||
            IsLeaveAdminUser(user) ||
            HasPermission(user, AttendancePermissions.ClerkAssignmentsManage);

        public bool IsLeaveAdminUser(ClaimsPrincipal user) =>
            HasAnyRole(user, LeaveAdminRoles);

        public bool IsLeaveClerkUser(ClaimsPrincipal user) =>
            HasAnyRole(user, LeaveClerkRoles);

        public bool CanViewAllFor(
            ClaimsPrincipal user,
            IEnumerable<string> viewAllPermissions) =>
            IsAdminUser(user) || HasAnyPermission(user, viewAllPermissions);

        public bool CanViewAssignedFor(
            ClaimsPrincipal user,
            IEnumerable<string> viewAssignedPermissions,
            IEnumerable<string> viewAllPermissions) =>
            CanViewAllFor(user, viewAllPermissions) ||
            HasAnyRole(user, AssignedRoles) ||
            HasAnyPermission(user, viewAssignedPermissions);

        public bool CanRefreshCache(ClaimsPrincipal user) =>
            HasAnyRole(user, AdminRoles) || HasPermission(user, AttendancePermissions.CacheRefresh);

        public bool CanViewSourceStatus(ClaimsPrincipal user) =>
            CanViewAssignedFor(
                user,
                [
                    AttendancePermissions.DashboardViewAssigned,
                    AttendancePermissions.SectionAttendanceViewAssigned
                ],
                [
                    AttendancePermissions.DashboardViewAll,
                    AttendancePermissions.AllAttendanceViewAll,
                    AttendancePermissions.SourceStatusViewAll
                ]);

        public bool CanViewSystemHealth(ClaimsPrincipal user) =>
            HasAnyRole(user, AdminRoles) || HasPermission(user, AttendancePermissions.SystemHealthViewAll);

        public async Task<HashSet<string>?> GetAllowedEpfSetAsync(
            ClaimsPrincipal user,
            IEnumerable<AttendanceEmployeeDTO> employees,
            bool allowOwn)
        {
            if (CanViewAll(user))
                return null;

            var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var employeeList = employees.ToList();

            if (CanViewAssigned(user))
            {
                var assignedWorkUnitIds = await GetAssignedWorkUnitIdsAsync(user);
                foreach (var emp in employeeList.Where(e => MatchesAssignedWorkUnit(e, assignedWorkUnitIds)))
                {
                    if (!string.IsNullOrWhiteSpace(emp.EpfNo))
                        allowed.Add(NormalizeEpf(emp.EpfNo));
                }
            }

            if (allowOwn)
            {
                var callerEpf = GetCallerEpf(user);
                if (!string.IsNullOrWhiteSpace(callerEpf))
                    allowed.Add(NormalizeEpf(callerEpf));
            }

            return allowed;
        }

        public async Task<HashSet<string>?> GetAllowedEpfSetForPermissionsAsync(
            ClaimsPrincipal user,
            IEnumerable<AttendanceEmployeeDTO> employees,
            bool allowOwn,
            IEnumerable<string> viewAssignedPermissions,
            IEnumerable<string> viewAllPermissions)
        {
            if (CanViewAllFor(user, viewAllPermissions))
                return null;

            var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var employeeList = employees.ToList();

            if (CanViewAssignedFor(user, viewAssignedPermissions, viewAllPermissions))
            {
                var assignedWorkUnitIds = await GetAssignedWorkUnitIdsAsync(user);
                foreach (var emp in employeeList.Where(e => MatchesAssignedWorkUnit(e, assignedWorkUnitIds)))
                {
                    if (!string.IsNullOrWhiteSpace(emp.EpfNo))
                        allowed.Add(NormalizeEpf(emp.EpfNo));
                }
            }

            if (allowOwn)
            {
                var callerEpf = GetCallerEpf(user);
                if (!string.IsNullOrWhiteSpace(callerEpf))
                    allowed.Add(NormalizeEpf(callerEpf));
            }

            return allowed;
        }

        public async Task<HashSet<string>> GetAssignedWorkUnitEpfSetAsync(
            ClaimsPrincipal user,
            IEnumerable<AttendanceEmployeeDTO> employees)
        {
            var assignedWorkUnitIds = await GetAssignedWorkUnitIdsAsync(user);
            return employees
                .Where(e => MatchesAssignedWorkUnit(e, assignedWorkUnitIds) &&
                            !string.IsNullOrWhiteSpace(e.EpfNo))
                .Select(e => NormalizeEpf(e.EpfNo))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
        }

        public async Task<bool> IsInAssignedWorkUnitAsync(
            ClaimsPrincipal user,
            AttendanceEmployeeDTO? employee)
        {
            if (employee == null)
                return false;

            var assignedWorkUnitIds = await GetAssignedWorkUnitIdsAsync(user);
            return MatchesAssignedWorkUnit(employee, assignedWorkUnitIds);
        }

        public async Task<bool> CanAccessEmployeeAsync(
            ClaimsPrincipal user,
            AttendanceEmployeeDTO? employee,
            string? requestedEpf = null,
            bool allowOwn = true)
        {
            if (CanViewAll(user))
                return true;

            var targetEpf = employee?.EpfNo ?? requestedEpf;
            if (allowOwn && IsOwnEpf(user, targetEpf))
                return true;

            if (!CanViewAssigned(user) || employee == null)
                return false;

            var assignedWorkUnitIds = await GetAssignedWorkUnitIdsAsync(user);
            return MatchesAssignedWorkUnit(employee, assignedWorkUnitIds);
        }

        public async Task<bool> CanAccessEmployeeForPermissionsAsync(
            ClaimsPrincipal user,
            AttendanceEmployeeDTO? employee,
            string? requestedEpf,
            bool allowOwn,
            IEnumerable<string> viewAssignedPermissions,
            IEnumerable<string> viewAllPermissions)
        {
            if (CanViewAllFor(user, viewAllPermissions))
                return true;

            var targetEpf = employee?.EpfNo ?? requestedEpf;
            if (allowOwn && IsOwnEpf(user, targetEpf))
                return true;

            if (!CanViewAssignedFor(user, viewAssignedPermissions, viewAllPermissions) || employee == null)
                return false;

            var assignedWorkUnitIds = await GetAssignedWorkUnitIdsAsync(user);
            return MatchesAssignedWorkUnit(employee, assignedWorkUnitIds);
        }

        public List<AttendanceRecordDTO> FilterRecords(
            ClaimsPrincipal user,
            IEnumerable<AttendanceRecordDTO> records,
            HashSet<string>? allowedEpfs)
        {
            if (allowedEpfs == null)
                return records.ToList();

            return records
                .Where(r => !string.IsNullOrWhiteSpace(r.EpfNo) && allowedEpfs.Contains(NormalizeEpf(r.EpfNo)))
                .ToList();
        }

        public string GetCallerEpf(ClaimsPrincipal user) =>
            user.FindFirst("epfNo")?.Value?.Trim() ?? "";

        public Guid? GetCallerEmployeeId(ClaimsPrincipal user)
        {
            var raw = user.FindFirst("employeeId")?.Value;
            return Guid.TryParse(raw, out var employeeId) ? employeeId : null;
        }

        public bool HasPermission(ClaimsPrincipal user, string permission) =>
            user.Claims.Any(c =>
                string.Equals(c.Type, "permission", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(c.Value, permission, StringComparison.OrdinalIgnoreCase));

        public bool HasAnyPermission(ClaimsPrincipal user, params string[] permissions) =>
            permissions.Any(permission => HasPermission(user, permission));

        public bool HasAnyPermission(ClaimsPrincipal user, IEnumerable<string> permissions) =>
            permissions.Any(permission => HasPermission(user, permission));

        private bool HasAnyRole(ClaimsPrincipal user, IEnumerable<string> roles) =>
            roles.Any(role => user.IsInRole(role) || HasJsonRoleClaim(user, role));

        private static bool HasJsonRoleClaim(ClaimsPrincipal user, string role)
        {
            var rolesClaim = user.FindFirst("roles")?.Value;
            return !string.IsNullOrWhiteSpace(rolesClaim) &&
                   rolesClaim.Contains($"\"{role}\"", StringComparison.OrdinalIgnoreCase);
        }

        private async Task<HashSet<Guid>> GetAssignedWorkUnitIdsAsync(ClaimsPrincipal user)
        {
            try
            {
                var userId = GetUserId(user);
                if (userId.HasValue)
                {
                    var byUserId = await _authDb.UserWorkUnits
                        .AsNoTracking()
                        .Where(x => x.UserId == userId.Value)
                        .Select(x => x.WorkUnitId)
                        .Distinct()
                        .ToListAsync();

                    if (byUserId.Count > 0)
                        return byUserId.ToHashSet();
                }

                var epfNo = GetCallerEpf(user);
                if (string.IsNullOrWhiteSpace(epfNo))
                    return [];

                var normalized = NormalizeEpf(epfNo);
                var userIds = await _authDb.Users
                    .AsNoTracking()
                    .Where(x => x.IsActive && (x.EPFNo == epfNo || x.EPFNo == normalized))
                    .Select(x => x.UserId)
                    .ToListAsync();

                if (userIds.Count == 0)
                    return [];

                var byEpf = await _authDb.UserWorkUnits
                    .AsNoTracking()
                    .Where(x => userIds.Contains(x.UserId))
                    .Select(x => x.WorkUnitId)
                    .Distinct()
                    .ToListAsync();

                return byEpf.ToHashSet();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load assigned work units from CECB Auth DB.");
                return [];
            }
        }

        private static Guid? GetUserId(ClaimsPrincipal user)
        {
            var raw = user.FindFirst("userId")?.Value ??
                      user.FindFirst(ClaimTypes.NameIdentifier)?.Value ??
                      user.FindFirst("sub")?.Value;

            return Guid.TryParse(raw, out var userId) ? userId : null;
        }

        private static bool MatchesAssignedWorkUnit(AttendanceEmployeeDTO employee, HashSet<Guid> assignedWorkUnitIds)
        {
            if (assignedWorkUnitIds.Count == 0)
                return false;

            return Matches(employee.AGMWorkSpaceId, assignedWorkUnitIds) ||
                   Matches(employee.DGMWorkSpaceId, assignedWorkUnitIds) ||
                   Matches(employee.ServiceUnitId, assignedWorkUnitIds);
        }

        private static bool Matches(Guid? value, HashSet<Guid> assignedWorkUnitIds) =>
            value.HasValue && assignedWorkUnitIds.Contains(value.Value);

        private bool IsOwnEpf(ClaimsPrincipal user, string? epfNo) =>
            !string.IsNullOrWhiteSpace(epfNo) &&
            string.Equals(NormalizeEpf(GetCallerEpf(user)), NormalizeEpf(epfNo), StringComparison.OrdinalIgnoreCase);

        public static string NormalizeEpf(string? epf)
        {
            if (string.IsNullOrWhiteSpace(epf)) return epf ?? "";
            var trimmed = epf.Trim();
            return int.TryParse(trimmed, out _) ? trimmed.PadLeft(6, '0') : trimmed;
        }
    }
}
