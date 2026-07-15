using Microsoft.EntityFrameworkCore;

namespace AttendanceSystem.API.DB
{
    public static class AppDatabaseInitializer
    {
        public static async Task EnsureOperationalTablesAsync(AppDbContext db)
        {
            await db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH('dbo.Users', 'FailedLoginAttempts') IS NULL
    ALTER TABLE dbo.Users ADD FailedLoginAttempts int NOT NULL DEFAULT 0;
IF COL_LENGTH('dbo.Users', 'LockedUntil') IS NULL
    ALTER TABLE dbo.Users ADD LockedUntil datetime2 NULL;
IF COL_LENGTH('dbo.Users', 'PasswordChangedAt') IS NULL
    ALTER TABLE dbo.Users ADD PasswordChangedAt datetime2 NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Users_ActiveEpfNo' AND object_id = OBJECT_ID(N'dbo.Users'))
    AND NOT EXISTS (
        SELECT 1
        FROM dbo.Users
        WHERE IsActive = 1 AND EpfNo IS NOT NULL AND LTRIM(RTRIM(EpfNo)) <> N''
        GROUP BY EpfNo
        HAVING COUNT(*) > 1
    )
    CREATE UNIQUE INDEX UX_Users_ActiveEpfNo ON dbo.Users(EpfNo)
    WHERE IsActive = 1 AND EpfNo IS NOT NULL AND EpfNo <> N'';

IF OBJECT_ID(N'dbo.AttendanceRuleSettings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AttendanceRuleSettings
    (
        Id int NOT NULL CONSTRAINT PK_AttendanceRuleSettings PRIMARY KEY,
        DefaultInHour int NOT NULL,
        DefaultInMinute int NOT NULL,
        DefaultOutHour int NOT NULL,
        DefaultOutMinute int NOT NULL,
        LateMinutes int NOT NULL,
        HalfShortLeaveMinutes int NOT NULL,
        ShortLeaveMinutes int NOT NULL,
        UpdatedAt datetime2 NOT NULL
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.AttendanceRuleSettings WHERE Id = 1)
BEGIN
    INSERT INTO dbo.AttendanceRuleSettings
        (Id, DefaultInHour, DefaultInMinute, DefaultOutHour, DefaultOutMinute, LateMinutes, HalfShortLeaveMinutes, ShortLeaveMinutes, UpdatedAt)
    VALUES
        (1, 8, 30, 16, 15, 30, 45, 90, SYSUTCDATETIME());
END;

IF COL_LENGTH('dbo.AttendanceRuleSettings', 'EarlyOTGraceMinutes') IS NULL
    ALTER TABLE dbo.AttendanceRuleSettings ADD EarlyOTGraceMinutes int NOT NULL DEFAULT 30;
IF COL_LENGTH('dbo.AttendanceRuleSettings', 'EveningOTGraceMinutes') IS NULL
    ALTER TABLE dbo.AttendanceRuleSettings ADD EveningOTGraceMinutes int NOT NULL DEFAULT 30;
IF COL_LENGTH('dbo.AttendanceRuleSettings', 'OTRoundingMinutes') IS NULL
    ALTER TABLE dbo.AttendanceRuleSettings ADD OTRoundingMinutes int NOT NULL DEFAULT 15;
IF COL_LENGTH('dbo.AttendanceRuleSettings', 'OTCapHour') IS NULL
    ALTER TABLE dbo.AttendanceRuleSettings ADD OTCapHour int NOT NULL DEFAULT 20;
IF COL_LENGTH('dbo.AttendanceRuleSettings', 'UpdatedBy') IS NULL
    ALTER TABLE dbo.AttendanceRuleSettings ADD UpdatedBy nvarchar(100) NULL;

IF OBJECT_ID(N'dbo.DataSourceHealth', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DataSourceHealth
    (
        SourceName nvarchar(50) NOT NULL CONSTRAINT PK_DataSourceHealth PRIMARY KEY,
        LastCheckedAt datetime2 NULL,
        LastSuccessAt datetime2 NULL,
        Status nvarchar(30) NOT NULL,
        Message nvarchar(500) NULL
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.DataSourceHealth WHERE SourceName = N'AttendanceERP')
    INSERT INTO dbo.DataSourceHealth (SourceName, Status, Message) VALUES (N'AttendanceERP', N'Unknown', N'Fingerprint punch data source');
IF NOT EXISTS (SELECT 1 FROM dbo.DataSourceHealth WHERE SourceName = N'CECB_ERP')
    INSERT INTO dbo.DataSourceHealth (SourceName, Status, Message) VALUES (N'CECB_ERP', N'Unknown', N'Employee master data source');
IF NOT EXISTS (SELECT 1 FROM dbo.DataSourceHealth WHERE SourceName = N'LeaveDB')
    INSERT INTO dbo.DataSourceHealth (SourceName, Status, Message) VALUES (N'LeaveDB', N'Unknown', N'Employee schedule data source');

IF OBJECT_ID(N'dbo.EmployeeScheduleSnapshots', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmployeeScheduleSnapshots
    (
        EmployeeId uniqueidentifier NOT NULL CONSTRAINT PK_EmployeeScheduleSnapshots PRIMARY KEY,
        EpfNo nvarchar(20) NOT NULL,
        NameWithInitial nvarchar(200) NULL,
        DesignationName nvarchar(200) NULL,
        AGMWorkSpaceId uniqueidentifier NULL,
        AGMWorkSpaceName nvarchar(200) NULL,
        DGMWorkSpaceId uniqueidentifier NULL,
        DGMWorkSpaceName nvarchar(200) NULL,
        ServiceUnitId uniqueidentifier NULL,
        ServiceUnitName nvarchar(200) NULL,
        InHour int NULL,
        InMinute int NULL,
        OutHour int NULL,
        OutMinute int NULL,
        ScheduleSource nvarchar(50) NOT NULL,
        LastSyncedAt datetime2 NOT NULL
    );
    CREATE INDEX IX_EmployeeScheduleSnapshots_EpfNo ON dbo.EmployeeScheduleSnapshots(EpfNo);
END;

IF COL_LENGTH('dbo.EmployeeScheduleSnapshots', 'AGMWorkSpaceId') IS NULL
    ALTER TABLE dbo.EmployeeScheduleSnapshots ADD AGMWorkSpaceId uniqueidentifier NULL;
IF COL_LENGTH('dbo.EmployeeScheduleSnapshots', 'AGMWorkSpaceName') IS NULL
    ALTER TABLE dbo.EmployeeScheduleSnapshots ADD AGMWorkSpaceName nvarchar(200) NULL;
IF COL_LENGTH('dbo.EmployeeScheduleSnapshots', 'DGMWorkSpaceId') IS NULL
    ALTER TABLE dbo.EmployeeScheduleSnapshots ADD DGMWorkSpaceId uniqueidentifier NULL;
IF COL_LENGTH('dbo.EmployeeScheduleSnapshots', 'DGMWorkSpaceName') IS NULL
    ALTER TABLE dbo.EmployeeScheduleSnapshots ADD DGMWorkSpaceName nvarchar(200) NULL;
IF COL_LENGTH('dbo.EmployeeScheduleSnapshots', 'ServiceUnitId') IS NULL
    ALTER TABLE dbo.EmployeeScheduleSnapshots ADD ServiceUnitId uniqueidentifier NULL;
IF COL_LENGTH('dbo.EmployeeScheduleSnapshots', 'ServiceUnitName') IS NULL
    ALTER TABLE dbo.EmployeeScheduleSnapshots ADD ServiceUnitName nvarchar(200) NULL;

IF OBJECT_ID(N'dbo.EmployeeUserMappings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmployeeUserMappings
    (
        Id uniqueidentifier NOT NULL CONSTRAINT PK_EmployeeUserMappings PRIMARY KEY,
        UserId uniqueidentifier NOT NULL,
        EmployeeId uniqueidentifier NULL,
        EpfNo nvarchar(20) NOT NULL,
        Username nvarchar(100) NOT NULL,
        FullName nvarchar(200) NULL,
        Role nvarchar(30) NOT NULL,
        IsActive bit NOT NULL,
        LinkedAt datetime2 NOT NULL,
        LastSyncedAt datetime2 NOT NULL
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EmployeeUserMappings_UserId' AND object_id = OBJECT_ID(N'dbo.EmployeeUserMappings'))
    CREATE UNIQUE INDEX IX_EmployeeUserMappings_UserId ON dbo.EmployeeUserMappings(UserId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EmployeeUserMappings_EpfNo' AND object_id = OBJECT_ID(N'dbo.EmployeeUserMappings'))
    CREATE INDEX IX_EmployeeUserMappings_EpfNo ON dbo.EmployeeUserMappings(EpfNo);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_EmployeeUserMappings_ActiveEpfNo' AND object_id = OBJECT_ID(N'dbo.EmployeeUserMappings'))
    AND NOT EXISTS (
        SELECT 1
        FROM dbo.EmployeeUserMappings
        WHERE IsActive = 1 AND EpfNo IS NOT NULL AND LTRIM(RTRIM(EpfNo)) <> N''
        GROUP BY EpfNo
        HAVING COUNT(*) > 1
    )
    CREATE UNIQUE INDEX UX_EmployeeUserMappings_ActiveEpfNo ON dbo.EmployeeUserMappings(EpfNo)
    WHERE IsActive = 1 AND EpfNo IS NOT NULL AND EpfNo <> N'';

IF OBJECT_ID(N'dbo.EmployeeWorkspaceHistory', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmployeeWorkspaceHistory
    (
        Id uniqueidentifier NOT NULL CONSTRAINT PK_EmployeeWorkspaceHistory PRIMARY KEY,
        EmployeeId uniqueidentifier NOT NULL,
        EpfNo nvarchar(20) NOT NULL,
        EmployeeName nvarchar(200) NULL,
        DesignationName nvarchar(200) NULL,
        AGMWorkSpaceId uniqueidentifier NULL,
        AGMWorkSpaceName nvarchar(200) NULL,
        DGMWorkSpaceId uniqueidentifier NULL,
        DGMWorkSpaceName nvarchar(200) NULL,
        ServiceUnitId uniqueidentifier NULL,
        ServiceUnitName nvarchar(200) NULL,
        EffectiveFrom datetime2 NOT NULL,
        EffectiveTo datetime2 NULL,
        Source nvarchar(50) NOT NULL,
        LastSyncedAt datetime2 NOT NULL
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EmployeeWorkspaceHistory_EpfNo_EffectiveFrom' AND object_id = OBJECT_ID(N'dbo.EmployeeWorkspaceHistory'))
    CREATE INDEX IX_EmployeeWorkspaceHistory_EpfNo_EffectiveFrom ON dbo.EmployeeWorkspaceHistory(EpfNo, EffectiveFrom);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EmployeeWorkspaceHistory_EmployeeId_EffectiveTo' AND object_id = OBJECT_ID(N'dbo.EmployeeWorkspaceHistory'))
    CREATE INDEX IX_EmployeeWorkspaceHistory_EmployeeId_EffectiveTo ON dbo.EmployeeWorkspaceHistory(EmployeeId, EffectiveTo);

IF OBJECT_ID(N'dbo.MonthlyAttendanceSnapshots', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MonthlyAttendanceSnapshots
    (
        Id uniqueidentifier NOT NULL CONSTRAINT PK_MonthlyAttendanceSnapshots PRIMARY KEY,
        [Year] int NOT NULL,
        [Month] int NOT NULL,
        EpfNo nvarchar(20) NOT NULL,
        Name nvarchar(200) NULL,
        Designation nvarchar(200) NULL,
        AGMUnit nvarchar(200) NULL,
        DGMUnit nvarchar(200) NULL,
        ServiceUnit nvarchar(200) NULL,
        WorkingDays int NOT NULL,
        UnsyncedDays int NOT NULL,
        PresentDays int NOT NULL,
        AbsentDays int NOT NULL,
        LateDays int NOT NULL,
        OntimeDays int NOT NULL,
        TotalWorkHours float NOT NULL,
        AverageWorkHours float NOT NULL,
        AttendanceRate float NOT NULL,
        SourceFromDate datetime2 NOT NULL,
        SourceToDate datetime2 NOT NULL,
        GeneratedAt datetime2 NOT NULL
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MonthlyAttendanceSnapshots_Year_Month_EpfNo' AND object_id = OBJECT_ID(N'dbo.MonthlyAttendanceSnapshots'))
    CREATE UNIQUE INDEX IX_MonthlyAttendanceSnapshots_Year_Month_EpfNo ON dbo.MonthlyAttendanceSnapshots([Year], [Month], EpfNo);

IF OBJECT_ID(N'dbo.MonthlyOTSummarySnapshots', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MonthlyOTSummarySnapshots
    (
        Id uniqueidentifier NOT NULL CONSTRAINT PK_MonthlyOTSummarySnapshots PRIMARY KEY,
        [Year] int NOT NULL,
        [Month] int NOT NULL,
        EpfNo nvarchar(20) NOT NULL,
        Name nvarchar(200) NULL,
        Designation nvarchar(200) NULL,
        Unit nvarchar(200) NULL,
        AGMUnit nvarchar(200) NULL,
        DGMUnit nvarchar(200) NULL,
        OTDays int NOT NULL,
        TotalOTHours float NOT NULL,
        PayableOTHours float NOT NULL,
        IsEngineerPayCategory bit NOT NULL,
        PayableOTRule nvarchar(50) NOT NULL,
        SourceFromDate datetime2 NOT NULL,
        SourceToDate datetime2 NOT NULL,
        GeneratedAt datetime2 NOT NULL
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MonthlyOTSummarySnapshots_Year_Month_EpfNo' AND object_id = OBJECT_ID(N'dbo.MonthlyOTSummarySnapshots'))
    CREATE UNIQUE INDEX IX_MonthlyOTSummarySnapshots_Year_Month_EpfNo ON dbo.MonthlyOTSummarySnapshots([Year], [Month], EpfNo);

IF OBJECT_ID(N'dbo.ReportGenerationAudits', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ReportGenerationAudits
    (
        Id uniqueidentifier NOT NULL CONSTRAINT PK_ReportGenerationAudits PRIMARY KEY,
        ReportType nvarchar(80) NOT NULL,
        RequestedBy nvarchar(100) NULL,
        RequestedEpfNo nvarchar(20) NULL,
        FromDate datetime2 NULL,
        ToDate datetime2 NULL,
        [Year] int NULL,
        [Month] int NULL,
        FiltersJson nvarchar(1000) NULL,
        [RowCount] int NULL,
        Status nvarchar(30) NOT NULL,
        Message nvarchar(500) NULL,
        GeneratedAt datetime2 NOT NULL
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ReportGenerationAudits_ReportType_GeneratedAt' AND object_id = OBJECT_ID(N'dbo.ReportGenerationAudits'))
    CREATE INDEX IX_ReportGenerationAudits_ReportType_GeneratedAt ON dbo.ReportGenerationAudits(ReportType, GeneratedAt);

IF OBJECT_ID(N'dbo.AttendanceCorrectionSessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AttendanceCorrectionSessions
    (
        SessionId uniqueidentifier NOT NULL CONSTRAINT PK_AttendanceCorrectionSessions PRIMARY KEY,
        SessionNo nvarchar(30) NOT NULL,
        Title nvarchar(200) NOT NULL,
        FromDate date NOT NULL,
        ToDate date NOT NULL,
        Status nvarchar(30) NOT NULL,
        Remarks nvarchar(1000) NULL,
        CreatedByUserId nvarchar(80) NULL,
        CreatedByName nvarchar(200) NULL,
        CreatedByEpfNo nvarchar(20) NULL,
        CreatedAt datetime2 NOT NULL,
        UpdatedAt datetime2 NULL,
        UpdatedByName nvarchar(200) NULL
    );
END;
IF COL_LENGTH('dbo.AttendanceCorrectionSessions', 'SessionId') IS NULL
    ALTER TABLE dbo.AttendanceCorrectionSessions ADD SessionId uniqueidentifier NOT NULL DEFAULT (NEWID());
IF COL_LENGTH('dbo.AttendanceCorrectionSessions', 'SessionNo') IS NULL
    ALTER TABLE dbo.AttendanceCorrectionSessions ADD SessionNo nvarchar(30) NOT NULL DEFAULT (CONCAT(N'AC-', LEFT(REPLACE(CONVERT(nvarchar(36), NEWID()), N'-', N''), 20)));
IF COL_LENGTH('dbo.AttendanceCorrectionSessions', 'Title') IS NULL
    ALTER TABLE dbo.AttendanceCorrectionSessions ADD Title nvarchar(200) NOT NULL DEFAULT (N'Attendance correction session');
IF COL_LENGTH('dbo.AttendanceCorrectionSessions', 'FromDate') IS NULL
    ALTER TABLE dbo.AttendanceCorrectionSessions ADD FromDate date NOT NULL DEFAULT (CONVERT(date, SYSUTCDATETIME()));
IF COL_LENGTH('dbo.AttendanceCorrectionSessions', 'ToDate') IS NULL
    ALTER TABLE dbo.AttendanceCorrectionSessions ADD ToDate date NOT NULL DEFAULT (CONVERT(date, SYSUTCDATETIME()));
IF COL_LENGTH('dbo.AttendanceCorrectionSessions', 'Status') IS NULL
    ALTER TABLE dbo.AttendanceCorrectionSessions ADD Status nvarchar(30) NOT NULL DEFAULT (N'Applied');
IF COL_LENGTH('dbo.AttendanceCorrectionSessions', 'Remarks') IS NULL
    ALTER TABLE dbo.AttendanceCorrectionSessions ADD Remarks nvarchar(1000) NULL;
IF COL_LENGTH('dbo.AttendanceCorrectionSessions', 'CreatedByUserId') IS NULL
    ALTER TABLE dbo.AttendanceCorrectionSessions ADD CreatedByUserId nvarchar(80) NULL;
IF COL_LENGTH('dbo.AttendanceCorrectionSessions', 'CreatedByName') IS NULL
    ALTER TABLE dbo.AttendanceCorrectionSessions ADD CreatedByName nvarchar(200) NULL;
IF COL_LENGTH('dbo.AttendanceCorrectionSessions', 'CreatedByEpfNo') IS NULL
    ALTER TABLE dbo.AttendanceCorrectionSessions ADD CreatedByEpfNo nvarchar(20) NULL;
IF COL_LENGTH('dbo.AttendanceCorrectionSessions', 'CreatedAt') IS NULL
    ALTER TABLE dbo.AttendanceCorrectionSessions ADD CreatedAt datetime2 NOT NULL DEFAULT (SYSUTCDATETIME());
IF COL_LENGTH('dbo.AttendanceCorrectionSessions', 'UpdatedAt') IS NULL
    ALTER TABLE dbo.AttendanceCorrectionSessions ADD UpdatedAt datetime2 NULL;
IF COL_LENGTH('dbo.AttendanceCorrectionSessions', 'UpdatedByName') IS NULL
    ALTER TABLE dbo.AttendanceCorrectionSessions ADD UpdatedByName nvarchar(200) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AttendanceCorrectionSessions_SessionNo' AND object_id = OBJECT_ID(N'dbo.AttendanceCorrectionSessions'))
    CREATE UNIQUE INDEX UX_AttendanceCorrectionSessions_SessionNo ON dbo.AttendanceCorrectionSessions(SessionNo);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AttendanceCorrectionSessions_Range_Status' AND object_id = OBJECT_ID(N'dbo.AttendanceCorrectionSessions'))
    CREATE INDEX IX_AttendanceCorrectionSessions_Range_Status ON dbo.AttendanceCorrectionSessions(FromDate, ToDate, Status);

IF OBJECT_ID(N'dbo.AttendanceCorrections', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AttendanceCorrections
    (
        CorrectionId uniqueidentifier NOT NULL CONSTRAINT PK_AttendanceCorrections PRIMARY KEY,
        SessionId uniqueidentifier NOT NULL,
        EpfNo nvarchar(20) NOT NULL,
        EmployeeId uniqueidentifier NULL,
        EmployeeName nvarchar(200) NULL,
        WorkDate date NOT NULL,
        OriginalCheckIn nvarchar(20) NULL,
        OriginalCheckOut nvarchar(20) NULL,
        CorrectedCheckIn nvarchar(20) NULL,
        CorrectedCheckOut nvarchar(20) NULL,
        ReasonType nvarchar(50) NOT NULL,
        Location nvarchar(200) NULL,
        Remarks nvarchar(1000) NULL,
        Status nvarchar(30) NOT NULL,
        IsActive bit NOT NULL,
        CreatedByUserId nvarchar(80) NULL,
        CreatedByName nvarchar(200) NULL,
        CreatedByEpfNo nvarchar(20) NULL,
        CreatedAt datetime2 NOT NULL,
        UpdatedByName nvarchar(200) NULL,
        UpdatedAt datetime2 NULL
    );
END;
IF COL_LENGTH('dbo.AttendanceCorrections', 'CorrectionId') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD CorrectionId uniqueidentifier NOT NULL DEFAULT (NEWID());
IF COL_LENGTH('dbo.AttendanceCorrections', 'SessionId') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD SessionId uniqueidentifier NOT NULL DEFAULT (NEWID());
IF COL_LENGTH('dbo.AttendanceCorrections', 'EpfNo') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD EpfNo nvarchar(20) NOT NULL DEFAULT (N'');
IF COL_LENGTH('dbo.AttendanceCorrections', 'EmployeeId') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD EmployeeId uniqueidentifier NULL;
IF COL_LENGTH('dbo.AttendanceCorrections', 'EmployeeName') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD EmployeeName nvarchar(200) NULL;
IF COL_LENGTH('dbo.AttendanceCorrections', 'WorkDate') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD WorkDate date NOT NULL DEFAULT (CONVERT(date, SYSUTCDATETIME()));
IF COL_LENGTH('dbo.AttendanceCorrections', 'OriginalCheckIn') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD OriginalCheckIn nvarchar(20) NULL;
IF COL_LENGTH('dbo.AttendanceCorrections', 'OriginalCheckOut') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD OriginalCheckOut nvarchar(20) NULL;
IF COL_LENGTH('dbo.AttendanceCorrections', 'CorrectedCheckIn') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD CorrectedCheckIn nvarchar(20) NULL;
IF COL_LENGTH('dbo.AttendanceCorrections', 'CorrectedCheckOut') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD CorrectedCheckOut nvarchar(20) NULL;
IF COL_LENGTH('dbo.AttendanceCorrections', 'ReasonType') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD ReasonType nvarchar(50) NOT NULL DEFAULT (N'Site/Circuit');
IF COL_LENGTH('dbo.AttendanceCorrections', 'Location') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD Location nvarchar(200) NULL;
IF COL_LENGTH('dbo.AttendanceCorrections', 'Remarks') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD Remarks nvarchar(1000) NULL;
IF COL_LENGTH('dbo.AttendanceCorrections', 'Status') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD Status nvarchar(30) NOT NULL DEFAULT (N'Applied');
IF COL_LENGTH('dbo.AttendanceCorrections', 'IsActive') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD IsActive bit NOT NULL DEFAULT (1);
IF COL_LENGTH('dbo.AttendanceCorrections', 'CreatedByUserId') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD CreatedByUserId nvarchar(80) NULL;
IF COL_LENGTH('dbo.AttendanceCorrections', 'CreatedByName') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD CreatedByName nvarchar(200) NULL;
IF COL_LENGTH('dbo.AttendanceCorrections', 'CreatedByEpfNo') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD CreatedByEpfNo nvarchar(20) NULL;
IF COL_LENGTH('dbo.AttendanceCorrections', 'CreatedAt') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD CreatedAt datetime2 NOT NULL DEFAULT (SYSUTCDATETIME());
IF COL_LENGTH('dbo.AttendanceCorrections', 'UpdatedByName') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD UpdatedByName nvarchar(200) NULL;
IF COL_LENGTH('dbo.AttendanceCorrections', 'UpdatedAt') IS NULL
    ALTER TABLE dbo.AttendanceCorrections ADD UpdatedAt datetime2 NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AttendanceCorrections_EpfDateActive' AND object_id = OBJECT_ID(N'dbo.AttendanceCorrections'))
    CREATE INDEX IX_AttendanceCorrections_EpfDateActive ON dbo.AttendanceCorrections(EpfNo, WorkDate, IsActive);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AttendanceCorrections_ActiveEpfWorkDate' AND object_id = OBJECT_ID(N'dbo.AttendanceCorrections'))
    AND NOT EXISTS (
        SELECT 1
        FROM dbo.AttendanceCorrections
        WHERE IsActive = 1
        GROUP BY EpfNo, WorkDate
        HAVING COUNT(*) > 1
    )
    CREATE UNIQUE INDEX UX_AttendanceCorrections_ActiveEpfWorkDate ON dbo.AttendanceCorrections(EpfNo, WorkDate)
    WHERE IsActive = 1;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AttendanceCorrections_SessionId' AND object_id = OBJECT_ID(N'dbo.AttendanceCorrections'))
    CREATE INDEX IX_AttendanceCorrections_SessionId ON dbo.AttendanceCorrections(SessionId);

IF OBJECT_ID(N'dbo.LeaveClerkAssignmentAudits', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.LeaveClerkAssignmentAudits
    (
        Id uniqueidentifier NOT NULL CONSTRAINT PK_LeaveClerkAssignmentAudits PRIMARY KEY,
        [Action] nvarchar(30) NOT NULL,
        EmployeeId uniqueidentifier NOT NULL,
        EmployeeEpfNo nvarchar(20) NULL,
        PreviousClerkEmployeeId uniqueidentifier NULL,
        PreviousClerkEpfNo nvarchar(20) NULL,
        NewClerkEmployeeId uniqueidentifier NULL,
        NewClerkEpfNo nvarchar(20) NULL,
        ChangedByUserId nvarchar(80) NULL,
        ChangedByName nvarchar(200) NULL,
        ChangedByEpfNo nvarchar(20) NULL,
        Remarks nvarchar(500) NULL,
        ChangedAt datetime2 NOT NULL
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LeaveClerkAssignmentAudits_Employee_ChangedAt' AND object_id = OBJECT_ID(N'dbo.LeaveClerkAssignmentAudits'))
    CREATE INDEX IX_LeaveClerkAssignmentAudits_Employee_ChangedAt ON dbo.LeaveClerkAssignmentAudits(EmployeeId, ChangedAt);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LeaveClerkAssignmentAudits_NewClerk_ChangedAt' AND object_id = OBJECT_ID(N'dbo.LeaveClerkAssignmentAudits'))
    CREATE INDEX IX_LeaveClerkAssignmentAudits_NewClerk_ChangedAt ON dbo.LeaveClerkAssignmentAudits(NewClerkEmployeeId, ChangedAt);
");
        }
    }
}
