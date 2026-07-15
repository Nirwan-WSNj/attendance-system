export const PERMISSIONS = {
    DASHBOARD_VIEW_ASSIGNED: "ATTENDANCE.DASHBOARD.VIEW_ASSIGNED",
    DASHBOARD_VIEW_ALL: "ATTENDANCE.DASHBOARD.VIEW_ALL",
    MY_ATTENDANCE_VIEW_OWN: "ATTENDANCE.MY_ATTENDANCE.VIEW_OWN",
    SECTION_ATTENDANCE_VIEW_ASSIGNED: "ATTENDANCE.SECTION_ATTENDANCE.VIEW_ASSIGNED",
    ALL_ATTENDANCE_VIEW_ALL: "ATTENDANCE.ALL_ATTENDANCE.VIEW_ALL",
    EMPLOYEES_VIEW_ASSIGNED: "ATTENDANCE.EMPLOYEES.VIEW_ASSIGNED",
    EMPLOYEES_VIEW_ALL: "ATTENDANCE.EMPLOYEES.VIEW_ALL",
    REPORTS_VIEW_OWN: "ATTENDANCE.REPORTS.VIEW_OWN",
    REPORTS_VIEW_ASSIGNED: "ATTENDANCE.REPORTS.VIEW_ASSIGNED",
    REPORTS_VIEW_ALL: "ATTENDANCE.REPORTS.VIEW_ALL",
    REPORTS_EXPORT: "ATTENDANCE.REPORTS.EXPORT",
    REPORTS_PRINT: "ATTENDANCE.REPORTS.PRINT",
    OT_SUMMARY_VIEW_OWN: "ATTENDANCE.OT_SUMMARY.VIEW_OWN",
    OT_SUMMARY_VIEW_ASSIGNED: "ATTENDANCE.OT_SUMMARY.VIEW_ASSIGNED",
    OT_SUMMARY_VIEW_ALL: "ATTENDANCE.OT_SUMMARY.VIEW_ALL",
    OT_SUMMARY_EXPORT: "ATTENDANCE.OT_SUMMARY.EXPORT",
    OT_SUMMARY_PRINT: "ATTENDANCE.OT_SUMMARY.PRINT",
    ATTENDANCE_REGISTER_VIEW_ASSIGNED: "ATTENDANCE.ATTENDANCE_REGISTER.VIEW_ASSIGNED",
    ATTENDANCE_REGISTER_VIEW_ALL: "ATTENDANCE.ATTENDANCE_REGISTER.VIEW_ALL",
    ATTENDANCE_REGISTER_EXPORT: "ATTENDANCE.ATTENDANCE_REGISTER.EXPORT",
    ATTENDANCE_REGISTER_PRINT: "ATTENDANCE.ATTENDANCE_REGISTER.PRINT",
    ATTENDANCE_CORRECTIONS_VIEW_ASSIGNED: "ATTENDANCE.ATTENDANCE_CORRECTIONS.VIEW_ASSIGNED",
    ATTENDANCE_CORRECTIONS_MANAGE: "ATTENDANCE.ATTENDANCE_CORRECTIONS.MANAGE",
    ANALYTICS_VIEW_ASSIGNED: "ATTENDANCE.ANALYTICS.VIEW_ASSIGNED",
    ANALYTICS_VIEW_ALL: "ATTENDANCE.ANALYTICS.VIEW_ALL",
    SOURCE_STATUS_VIEW_ALL: "ATTENDANCE.SOURCE_STATUS.VIEW_ALL",
    SYSTEM_HEALTH_VIEW_ALL: "ATTENDANCE.SYSTEM_HEALTH.VIEW_ALL",
    CACHE_REFRESH: "ATTENDANCE.CACHE.REFRESH",
    CLERK_ASSIGNMENTS_MANAGE: "ATTENDANCE.CLERK_ASSIGNMENTS.MANAGE",
    SETTINGS_MANAGE: "ATTENDANCE.SETTINGS.MANAGE"
};

const ADMIN_ROLES = ["Admin", "ADMIN", "SUPER_ADMIN", "ATTENDANCE_ADMIN", "DASHBOARD_ADMIN"];
// Work-unit access is separate from legacy leave-clerk correction scope.
const ASSIGNED_ROLES = ["AGM", "ATTENDANCE_AGM", "CLERK", "ATTENDANCE_CLERK"];
const LEAVE_ADMIN_ROLES = ["LeaveAdmin", "LEAVE_ADMIN", "ATTENDANCE_LEAVE_ADMIN"];
const LEAVE_CLERK_ROLES = ["CLERK", "ATTENDANCE_CLERK", "LEAVE_CLERK", "LeaveClerk"];

const readJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

export const getRoles = () => readJson("roleList", []);

export const getPermissionList = () => {
    const stored = readJson("permissionList", []);
    if (Array.isArray(stored)) return stored;

    const grouped = readJson("permissions", {});
    if (Array.isArray(grouped)) return grouped;
    if (grouped && typeof grouped === "object") {
        return Object.values(grouped).flat().filter(Boolean);
    }
    return [];
};

export const hasRole = (role) =>
    getRoles().some(r => String(r).toLowerCase() === String(role).toLowerCase());

export const hasAnyRole = (...roles) => roles.some(hasRole);

export const isAttendanceAdmin = () => hasAnyRole(...ADMIN_ROLES);
export const isLeaveAdmin = () => hasAnyRole(...LEAVE_ADMIN_ROLES);
export const isLeaveClerk = () => hasAnyRole(...LEAVE_CLERK_ROLES);
export const isAttendanceClerkWorkspace = () =>
    isLeaveClerk() && !isAttendanceAdmin() && !isLeaveAdmin();

export const hasPermission = (permission) =>
    getPermissionList().some(p => String(p).toLowerCase() === String(permission).toLowerCase());

export const hasAnyPermission = (...permissions) => permissions.some(hasPermission);

// These two legacy helpers are used only for report-tab visibility. Route
// authorization below always checks its own module permissions explicitly.
export const canViewAllData = () =>
    isAttendanceAdmin() || hasPermission(PERMISSIONS.REPORTS_VIEW_ALL);

export const canViewAssignedData = () =>
    canViewAllData() ||
    hasAnyRole(...ASSIGNED_ROLES) ||
    hasPermission(PERMISSIONS.REPORTS_VIEW_ASSIGNED);

export const canViewOwnData = () =>
    !!localStorage.getItem("epfNo");

export const canManageUsers = () =>
    hasAnyRole(...ADMIN_ROLES) || hasPermission(PERMISSIONS.SETTINGS_MANAGE);

export const canManageClerkAssignments = () =>
    isAttendanceAdmin() ||
    isLeaveAdmin() ||
    hasPermission(PERMISSIONS.CLERK_ASSIGNMENTS_MANAGE);

export const canViewDashboard = () =>
    isAttendanceAdmin() ||
    hasAnyRole(...ASSIGNED_ROLES) ||
    hasAnyPermission(PERMISSIONS.DASHBOARD_VIEW_ASSIGNED, PERMISSIONS.DASHBOARD_VIEW_ALL);

export const canViewAllAttendance = () =>
    isAttendanceAdmin() ||
    hasAnyRole(...ASSIGNED_ROLES) ||
    hasAnyPermission(PERMISSIONS.SECTION_ATTENDANCE_VIEW_ASSIGNED, PERMISSIONS.ALL_ATTENDANCE_VIEW_ALL);

export const canViewEmployees = () =>
    isAttendanceAdmin() ||
    hasAnyPermission(PERMISSIONS.EMPLOYEES_VIEW_ASSIGNED, PERMISSIONS.EMPLOYEES_VIEW_ALL) ||
    hasAnyRole(...ASSIGNED_ROLES);

export const canViewReports = () =>
    isAttendanceAdmin() ||
    hasAnyRole(...ASSIGNED_ROLES) ||
    hasAnyPermission(
        PERMISSIONS.REPORTS_VIEW_OWN,
        PERMISSIONS.REPORTS_VIEW_ASSIGNED,
        PERMISSIONS.REPORTS_VIEW_ALL,
        PERMISSIONS.OT_SUMMARY_VIEW_OWN,
        PERMISSIONS.OT_SUMMARY_VIEW_ASSIGNED,
        PERMISSIONS.OT_SUMMARY_VIEW_ALL,
        PERMISSIONS.ATTENDANCE_REGISTER_VIEW_ASSIGNED,
        PERMISSIONS.ATTENDANCE_REGISTER_VIEW_ALL
    );

export const canViewEmployeeReports = () =>
    isAttendanceAdmin() ||
    hasAnyRole(...ASSIGNED_ROLES) ||
    hasAnyPermission(PERMISSIONS.REPORTS_VIEW_OWN, PERMISSIONS.REPORTS_VIEW_ASSIGNED, PERMISSIONS.REPORTS_VIEW_ALL);

export const canSearchEmployeeReports = () =>
    isAttendanceAdmin() ||
    hasAnyRole(...ASSIGNED_ROLES) ||
    hasAnyPermission(PERMISSIONS.REPORTS_VIEW_ASSIGNED, PERMISSIONS.REPORTS_VIEW_ALL);

export const canViewAttendanceRegister = () =>
    isAttendanceAdmin() ||
    hasAnyRole(...ASSIGNED_ROLES) ||
    hasAnyPermission(PERMISSIONS.ATTENDANCE_REGISTER_VIEW_ASSIGNED, PERMISSIONS.ATTENDANCE_REGISTER_VIEW_ALL);

export const canViewOtSummary = () =>
    isAttendanceAdmin() ||
    hasAnyRole(...ASSIGNED_ROLES) ||
    hasAnyPermission(PERMISSIONS.OT_SUMMARY_VIEW_OWN, PERMISSIONS.OT_SUMMARY_VIEW_ASSIGNED, PERMISSIONS.OT_SUMMARY_VIEW_ALL);

export const canEditCorrections = () =>
    isAttendanceAdmin() ||
    isLeaveAdmin() ||
    isLeaveClerk() ||
    hasPermission(PERMISSIONS.ATTENDANCE_CORRECTIONS_MANAGE);

export const canManageCorrections = () =>
    canEditCorrections() ||
    hasPermission(PERMISSIONS.ATTENDANCE_CORRECTIONS_VIEW_ASSIGNED);

export const canViewAnalytics = () =>
    isAttendanceAdmin() ||
    hasAnyRole(...ASSIGNED_ROLES) ||
    hasAnyPermission(PERMISSIONS.ANALYTICS_VIEW_ASSIGNED, PERMISSIONS.ANALYTICS_VIEW_ALL);

export const canViewSystemHealth = () =>
    hasAnyRole(...ADMIN_ROLES) ||
    hasPermission(PERMISSIONS.SYSTEM_HEALTH_VIEW_ALL);

export const canExportReports = () =>
    hasAnyRole(...ADMIN_ROLES) ||
    hasPermission(PERMISSIONS.REPORTS_EXPORT);

export const canPrintReports = () =>
    hasAnyRole(...ADMIN_ROLES) ||
    hasPermission(PERMISSIONS.REPORTS_PRINT);

export const canExportOtSummary = () =>
    hasAnyRole(...ADMIN_ROLES) ||
    hasPermission(PERMISSIONS.OT_SUMMARY_EXPORT);

export const canPrintOtSummary = () =>
    hasAnyRole(...ADMIN_ROLES) ||
    hasPermission(PERMISSIONS.OT_SUMMARY_PRINT);

export const canExportAttendanceRegister = () =>
    hasAnyRole(...ADMIN_ROLES) ||
    hasPermission(PERMISSIONS.ATTENDANCE_REGISTER_EXPORT);

export const canPrintAttendanceRegister = () =>
    hasAnyRole(...ADMIN_ROLES) ||
    hasPermission(PERMISSIONS.ATTENDANCE_REGISTER_PRINT);

export const getDefaultRoute = () => {
    if (isAttendanceClerkWorkspace() && canManageCorrections()) return "/corrections";
    if (canViewDashboard()) return "/dashboard";
    if (canViewOwnData()) return "/my-attendance";
    if (canManageCorrections()) return "/corrections";
    if (canManageClerkAssignments()) return "/assign-clerks";
    if (canViewAllAttendance()) return "/all-attendance";
    if (canViewEmployees()) return "/employees";
    if (canManageUsers()) return "/users";
    if (canViewReports()) return "/reports";
    if (canViewAnalytics()) return "/analytics";
    if (canViewSystemHealth()) return "/system-health";
    return "/no-access";
};

export const getAccessLabel = () => {
    if (isAttendanceAdmin()) return "Admin";
    if (isLeaveAdmin()) return "Attendance Administrator";
    if (isLeaveClerk()) return "Attendance Clerk";
    if (hasAnyRole(...ASSIGNED_ROLES)) return "Section";
    return "Employee";
};
