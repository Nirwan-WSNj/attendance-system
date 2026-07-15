namespace AttendanceSystem.API.Authorization
{
    public static class AttendancePermissions
    {
        public const string DashboardViewAssigned = "ATTENDANCE.DASHBOARD.VIEW_ASSIGNED";
        public const string DashboardViewAll = "ATTENDANCE.DASHBOARD.VIEW_ALL";

        public const string MyAttendanceViewOwn = "ATTENDANCE.MY_ATTENDANCE.VIEW_OWN";
        public const string SectionAttendanceViewAssigned = "ATTENDANCE.SECTION_ATTENDANCE.VIEW_ASSIGNED";
        public const string AllAttendanceViewAll = "ATTENDANCE.ALL_ATTENDANCE.VIEW_ALL";

        public const string EmployeesViewAssigned = "ATTENDANCE.EMPLOYEES.VIEW_ASSIGNED";
        public const string EmployeesViewAll = "ATTENDANCE.EMPLOYEES.VIEW_ALL";

        public const string ReportsViewOwn = "ATTENDANCE.REPORTS.VIEW_OWN";
        public const string ReportsViewAssigned = "ATTENDANCE.REPORTS.VIEW_ASSIGNED";
        public const string ReportsViewAll = "ATTENDANCE.REPORTS.VIEW_ALL";
        public const string ReportsExport = "ATTENDANCE.REPORTS.EXPORT";
        public const string ReportsPrint = "ATTENDANCE.REPORTS.PRINT";

        public const string OtSummaryViewOwn = "ATTENDANCE.OT_SUMMARY.VIEW_OWN";
        public const string OtSummaryViewAssigned = "ATTENDANCE.OT_SUMMARY.VIEW_ASSIGNED";
        public const string OtSummaryViewAll = "ATTENDANCE.OT_SUMMARY.VIEW_ALL";
        public const string OtSummaryExport = "ATTENDANCE.OT_SUMMARY.EXPORT";
        public const string OtSummaryPrint = "ATTENDANCE.OT_SUMMARY.PRINT";

        public const string AttendanceRegisterViewAssigned = "ATTENDANCE.ATTENDANCE_REGISTER.VIEW_ASSIGNED";
        public const string AttendanceRegisterViewAll = "ATTENDANCE.ATTENDANCE_REGISTER.VIEW_ALL";
        public const string AttendanceRegisterExport = "ATTENDANCE.ATTENDANCE_REGISTER.EXPORT";
        public const string AttendanceRegisterPrint = "ATTENDANCE.ATTENDANCE_REGISTER.PRINT";

        public const string AttendanceCorrectionsViewAssigned = "ATTENDANCE.ATTENDANCE_CORRECTIONS.VIEW_ASSIGNED";
        public const string AttendanceCorrectionsManage = "ATTENDANCE.ATTENDANCE_CORRECTIONS.MANAGE";

        public const string AnalyticsViewAssigned = "ATTENDANCE.ANALYTICS.VIEW_ASSIGNED";
        public const string AnalyticsViewAll = "ATTENDANCE.ANALYTICS.VIEW_ALL";

        public const string SourceStatusViewAll = "ATTENDANCE.SOURCE_STATUS.VIEW_ALL";
        public const string SystemHealthViewAll = "ATTENDANCE.SYSTEM_HEALTH.VIEW_ALL";
        public const string CacheRefresh = "ATTENDANCE.CACHE.REFRESH";
        public const string ClerkAssignmentsManage = "ATTENDANCE.CLERK_ASSIGNMENTS.MANAGE";
        public const string SettingsManage = "ATTENDANCE.SETTINGS.MANAGE";

        public static readonly string[] ViewAll =
        [
            DashboardViewAll,
            AllAttendanceViewAll,
            EmployeesViewAll,
            ReportsViewAll,
            OtSummaryViewAll,
            AttendanceRegisterViewAll,
            AnalyticsViewAll,
            SourceStatusViewAll,
            SettingsManage
        ];

        public static readonly string[] ViewAssigned =
        [
            DashboardViewAssigned,
            SectionAttendanceViewAssigned,
            EmployeesViewAssigned,
            ReportsViewAssigned,
            OtSummaryViewAssigned,
            AttendanceRegisterViewAssigned,
            AnalyticsViewAssigned
        ];

        public static readonly string[] ViewOwn =
        [
            MyAttendanceViewOwn,
            ReportsViewOwn,
            OtSummaryViewOwn
        ];
    }
}
