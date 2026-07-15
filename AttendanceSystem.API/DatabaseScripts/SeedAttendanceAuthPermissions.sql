/*
    Attendance System permissions seed for CECB_Auth.

    Review before running. This script is idempotent:
    - Creates/updates ATTENDANCE system
    - Creates/updates Attendance tasks, actions and task-actions
    - Creates/updates Attendance roles
    - Assigns role permissions
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

DECLARE @Now datetime2 = SYSDATETIME();
DECLARE @SystemId uniqueidentifier;

SELECT @SystemId = SystemId
FROM dbo.[System]
WHERE SystemCode = N'ATTENDANCE';

IF @SystemId IS NULL
BEGIN
    SET @SystemId = NEWID();

    INSERT INTO dbo.[System]
        (SystemId, SystemCode, IsActive, SystemName, BaseUrl, AllowCors, UiUrl, Subtitle)
    VALUES
        (@SystemId, N'ATTENDANCE', 1, N'Attendance System', N'http://localhost:5050/api', 1, N'http://localhost:3002', N'Attendance and Leave Information Management System');
END
ELSE
BEGIN
    UPDATE dbo.[System]
    SET
        IsActive = 1,
        SystemName = N'Attendance System',
        BaseUrl = COALESCE(NULLIF(BaseUrl, N''), N'http://localhost:5050/api'),
        AllowCors = 1,
        UiUrl = N'http://localhost:3002',
        Subtitle = N'Attendance and Leave Information Management System'
    WHERE SystemId = @SystemId;
END

DECLARE @Tasks TABLE
(
    TaskCode nvarchar(100) NOT NULL PRIMARY KEY,
    TaskName nvarchar(200) NOT NULL
);

INSERT INTO @Tasks (TaskCode, TaskName)
VALUES
    (N'DASHBOARD', N'Dashboard'),
    (N'MY_ATTENDANCE', N'My Attendance'),
    (N'SECTION_ATTENDANCE', N'Section Attendance'),
    (N'ALL_ATTENDANCE', N'All Attendance'),
    (N'EMPLOYEES', N'Employees'),
    (N'REPORTS', N'Reports'),
    (N'OT_SUMMARY', N'OT Summary'),
    (N'ATTENDANCE_REGISTER', N'Attendance Register'),
    (N'ATTENDANCE_CORRECTIONS', N'Attendance Corrections'),
    (N'ANALYTICS', N'Analytics'),
    (N'SOURCE_STATUS', N'Source Status'),
    (N'SYSTEM_HEALTH', N'System Health'),
    (N'CACHE', N'Cache'),
    (N'CLERK_ASSIGNMENTS', N'Clerk Assignments'),
    (N'SETTINGS', N'Settings');

MERGE dbo.[Task] AS target
USING (
    SELECT @SystemId AS SystemId, TaskCode, TaskName
    FROM @Tasks
) AS source
ON target.SystemId = source.SystemId
AND target.TaskCode = source.TaskCode
WHEN MATCHED THEN
    UPDATE SET
        TaskName = source.TaskName,
        IsActive = 1,
        UpdatedDateTime = @Now
WHEN NOT MATCHED THEN
    INSERT (TaskId, SystemId, TaskCode, TaskName, IsActive, CreatedDateTime)
    VALUES (NEWID(), source.SystemId, source.TaskCode, source.TaskName, 1, @Now);

DECLARE @Actions TABLE
(
    ActionCode nvarchar(100) NOT NULL PRIMARY KEY,
    ActionName nvarchar(200) NOT NULL
);

INSERT INTO @Actions (ActionCode, ActionName)
VALUES
    (N'VIEW_OWN', N'View Own'),
    (N'VIEW_ASSIGNED', N'View Assigned'),
    (N'VIEW_ALL', N'View All'),
    (N'EXPORT', N'Export'),
    (N'PRINT', N'Print'),
    (N'REFRESH', N'Refresh'),
    (N'MANAGE', N'Manage');

MERGE dbo.[Action] AS target
USING @Actions AS source
ON target.ActionCode = source.ActionCode
WHEN MATCHED THEN
    UPDATE SET
        ActionName = source.ActionName,
        IsActive = 1,
        UpdatedDateTime = @Now
WHEN NOT MATCHED THEN
    INSERT (ActionId, ActionCode, ActionName, IsActive, CreatedDateTime)
    VALUES (NEWID(), source.ActionCode, source.ActionName, 1, @Now);

DECLARE @TaskActions TABLE
(
    TaskCode nvarchar(100) NOT NULL,
    ActionCode nvarchar(100) NOT NULL,
    PRIMARY KEY (TaskCode, ActionCode)
);

INSERT INTO @TaskActions (TaskCode, ActionCode)
VALUES
    (N'DASHBOARD', N'VIEW_ASSIGNED'),
    (N'DASHBOARD', N'VIEW_ALL'),
    (N'MY_ATTENDANCE', N'VIEW_OWN'),
    (N'SECTION_ATTENDANCE', N'VIEW_ASSIGNED'),
    (N'ALL_ATTENDANCE', N'VIEW_ALL'),
    (N'EMPLOYEES', N'VIEW_ASSIGNED'),
    (N'EMPLOYEES', N'VIEW_ALL'),
    (N'REPORTS', N'VIEW_OWN'),
    (N'REPORTS', N'VIEW_ASSIGNED'),
    (N'REPORTS', N'VIEW_ALL'),
    (N'REPORTS', N'EXPORT'),
    (N'REPORTS', N'PRINT'),
    (N'OT_SUMMARY', N'VIEW_OWN'),
    (N'OT_SUMMARY', N'VIEW_ASSIGNED'),
    (N'OT_SUMMARY', N'VIEW_ALL'),
    (N'OT_SUMMARY', N'EXPORT'),
    (N'OT_SUMMARY', N'PRINT'),
    (N'ATTENDANCE_REGISTER', N'VIEW_ASSIGNED'),
    (N'ATTENDANCE_REGISTER', N'VIEW_ALL'),
    (N'ATTENDANCE_REGISTER', N'EXPORT'),
    (N'ATTENDANCE_REGISTER', N'PRINT'),
    (N'ATTENDANCE_CORRECTIONS', N'VIEW_ASSIGNED'),
    (N'ATTENDANCE_CORRECTIONS', N'MANAGE'),
    (N'ANALYTICS', N'VIEW_ASSIGNED'),
    (N'ANALYTICS', N'VIEW_ALL'),
    (N'SOURCE_STATUS', N'VIEW_ALL'),
    (N'SYSTEM_HEALTH', N'VIEW_ALL'),
    (N'CACHE', N'REFRESH'),
    (N'CLERK_ASSIGNMENTS', N'MANAGE'),
    (N'SETTINGS', N'MANAGE');

MERGE dbo.[TaskAction] AS target
USING (
    SELECT t.TaskId, a.ActionId
    FROM @TaskActions ta
    INNER JOIN dbo.[Task] t
        ON t.SystemId = @SystemId
        AND t.TaskCode = ta.TaskCode
    INNER JOIN dbo.[Action] a
        ON a.ActionCode = ta.ActionCode
) AS source
ON target.TaskId = source.TaskId
AND target.ActionId = source.ActionId
WHEN MATCHED THEN
    UPDATE SET
        IsActive = 1,
        UpdatedDateTime = @Now
WHEN NOT MATCHED THEN
    INSERT (TaskActionId, TaskId, ActionId, IsActive, CreatedDateTime)
    VALUES (NEWID(), source.TaskId, source.ActionId, 1, @Now);

DECLARE @Roles TABLE
(
    RoleCode nvarchar(255) NOT NULL PRIMARY KEY,
    RoleName nvarchar(255) NOT NULL
);

INSERT INTO @Roles (RoleCode, RoleName)
VALUES
    (N'ATTENDANCE_ADMIN', N'Attendance Admin'),
    (N'ATTENDANCE_AGM', N'Attendance AGM'),
    (N'ATTENDANCE_CLERK', N'Attendance Clerk'),
    (N'ATTENDANCE_EMPLOYEE', N'Attendance Employee'),
    (N'ATTENDANCE_LEAVE_ADMIN', N'Attendance Leave Admin');

MERGE dbo.[Role] AS target
USING (
    SELECT RoleCode, RoleName, @SystemId AS SystemId
    FROM @Roles
) AS source
ON target.SystemId = source.SystemId
AND target.RoleCode = source.RoleCode
WHEN MATCHED THEN
    UPDATE SET
        RoleName = source.RoleName,
        IsActive = 1,
        IsGlobal = 0
WHEN NOT MATCHED THEN
    INSERT (RoleId, RoleCode, RoleName, SystemId, IsActive, IsGlobal)
    VALUES (NEWID(), source.RoleCode, source.RoleName, source.SystemId, 1, 0);

DECLARE @RolePermissions TABLE
(
    RoleCode nvarchar(255) NOT NULL,
    TaskCode nvarchar(100) NOT NULL,
    ActionCode nvarchar(100) NOT NULL,
    PRIMARY KEY (RoleCode, TaskCode, ActionCode)
);

INSERT INTO @RolePermissions (RoleCode, TaskCode, ActionCode)
VALUES
    (N'ATTENDANCE_EMPLOYEE', N'MY_ATTENDANCE', N'VIEW_OWN'),
    (N'ATTENDANCE_EMPLOYEE', N'REPORTS', N'VIEW_OWN'),
    (N'ATTENDANCE_EMPLOYEE', N'OT_SUMMARY', N'VIEW_OWN');

INSERT INTO @RolePermissions (RoleCode, TaskCode, ActionCode)
SELECT roleSeed.RoleCode, permissionSeed.TaskCode, permissionSeed.ActionCode
FROM (VALUES
    (N'ATTENDANCE_AGM'),
    (N'ATTENDANCE_CLERK')
) AS roleSeed(RoleCode)
CROSS JOIN (VALUES
    (N'DASHBOARD', N'VIEW_ASSIGNED'),
    (N'SECTION_ATTENDANCE', N'VIEW_ASSIGNED'),
    (N'EMPLOYEES', N'VIEW_ASSIGNED'),
    (N'REPORTS', N'VIEW_ASSIGNED'),
    (N'REPORTS', N'EXPORT'),
    (N'REPORTS', N'PRINT'),
    (N'OT_SUMMARY', N'VIEW_ASSIGNED'),
    (N'OT_SUMMARY', N'EXPORT'),
    (N'OT_SUMMARY', N'PRINT'),
    (N'ATTENDANCE_REGISTER', N'VIEW_ASSIGNED'),
    (N'ATTENDANCE_REGISTER', N'EXPORT'),
    (N'ATTENDANCE_REGISTER', N'PRINT'),
    (N'ATTENDANCE_CORRECTIONS', N'VIEW_ASSIGNED'),
    (N'ATTENDANCE_CORRECTIONS', N'MANAGE'),
    (N'ANALYTICS', N'VIEW_ASSIGNED')
) AS permissionSeed(TaskCode, ActionCode);

INSERT INTO @RolePermissions (RoleCode, TaskCode, ActionCode)
SELECT N'ATTENDANCE_ADMIN', TaskCode, ActionCode
FROM @TaskActions;

INSERT INTO @RolePermissions (RoleCode, TaskCode, ActionCode)
VALUES
    (N'ATTENDANCE_LEAVE_ADMIN', N'CLERK_ASSIGNMENTS', N'MANAGE'),
    (N'ATTENDANCE_LEAVE_ADMIN', N'ATTENDANCE_CORRECTIONS', N'VIEW_ASSIGNED'),
    (N'ATTENDANCE_LEAVE_ADMIN', N'ATTENDANCE_CORRECTIONS', N'MANAGE');

MERGE dbo.[RoleTaskAction] AS target
USING (
    SELECT r.RoleId, ta.TaskActionId
    FROM @RolePermissions rp
    INNER JOIN dbo.[Role] r
        ON r.SystemId = @SystemId
        AND r.RoleCode = rp.RoleCode
    INNER JOIN dbo.[Task] t
        ON t.SystemId = @SystemId
        AND t.TaskCode = rp.TaskCode
    INNER JOIN dbo.[Action] a
        ON a.ActionCode = rp.ActionCode
    INNER JOIN dbo.[TaskAction] ta
        ON ta.TaskId = t.TaskId
        AND ta.ActionId = a.ActionId
) AS source
ON target.RoleId = source.RoleId
AND target.TaskActionId = source.TaskActionId
WHEN MATCHED THEN
    UPDATE SET
        IsActive = 1,
        UpdatedDateTime = @Now
WHEN NOT MATCHED THEN
    INSERT (RoleTaskActionId, RoleId, TaskActionId, IsActive, CreatedDateTime)
    VALUES (NEWID(), source.RoleId, source.TaskActionId, 1, @Now);

COMMIT TRANSACTION;

SELECT
    r.RoleCode,
    COUNT(rta.RoleTaskActionId) AS ActivePermissionCount
FROM dbo.[Role] r
LEFT JOIN dbo.[RoleTaskAction] rta
    ON rta.RoleId = r.RoleId
    AND rta.IsActive = 1
WHERE r.SystemId = @SystemId
GROUP BY r.RoleCode
ORDER BY r.RoleCode;
