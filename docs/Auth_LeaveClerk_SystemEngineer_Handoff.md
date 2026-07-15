# Auth and Leave Clerk Assignment Handoff

This note is for the system engineer before connecting the Attendance System to the central Auth setup. It does not require the developer to change `LeaveDB` directly.

## Current Readiness

- API build verified successfully using a separate output folder.
- UI production build verified successfully using a separate output folder.
- Attendance app code is ready for central JWT validation once production configuration values are provided.
- Leave clerk assignment UI/API is implemented for manual assign, unassign, auto assign, and audit history.
- App-owned tables in `AttendanceSystemDB` are created/updated by API startup when the app DB user has the required permissions.

## Role Decision

Current behavior:

- `Admin` and `LeaveAdmin` can open **Assign Clerks** and manage clerk assignments.
- `LeaveClerk` users cannot manually assign employees.
- `LeaveClerk` users can access their assigned employee scope where leave clerk assignment scope is used.

If the business wants ordinary leave clerks to manually choose/assign employees, the application permission logic must be changed before deployment.

## Required Central Auth Configuration

Configure these values outside source control, for example in production app settings or environment variables:

- `CentralJwtSettings:Issuer`
- `CentralJwtSettings:Audience`
- `CentralJwtSettings:SecretKey`

The Attendance API already accepts both local Attendance tokens and central Auth tokens when the central settings are present.

## Required JWT Claims

Central Auth tokens should include:

- `epfNo`: employee EPF number, preferably normalized or consistently formatted.
- Role claim using standard role claim type, or a `roles` JSON claim.
- Optional `permission` claims for permission-based access.
- Optional `employeeId` claim if available.
- Optional `fullName` or `name` claim for display/audit names.

Important roles recognized by Attendance:

- `Admin`
- `SUPER_ADMIN`
- `ATTENDANCE_ADMIN`
- `DASHBOARD_ADMIN`
- `LeaveAdmin`
- `LEAVE_ADMIN`
- `ATTENDANCE_LEAVE_ADMIN`
- `LeaveClerk`
- `LEAVE_CLERK`
- `ATTENDANCE_CLERK`
- `CLERK`
- `AGM`
- `ATTENDANCE_AGM`

## Required Permissions

Useful permission claims:

- `ATTENDANCE.DASHBOARD.VIEW_ALL`
- `ATTENDANCE.ALL_ATTENDANCE.VIEW_ALL`
- `ATTENDANCE.EMPLOYEES.VIEW_ALL`
- `ATTENDANCE.REPORTS.VIEW_ALL`
- `ATTENDANCE.OT_SUMMARY.VIEW_ALL`
- `ATTENDANCE.ATTENDANCE_REGISTER.VIEW_ALL`
- `ATTENDANCE.ANALYTICS.VIEW_ALL`
- `ATTENDANCE.SOURCE_STATUS.VIEW_ALL`
- `ATTENDANCE.SETTINGS.MANAGE`
- `ATTENDANCE.DASHBOARD.VIEW_ASSIGNED`
- `ATTENDANCE.SECTION_ATTENDANCE.VIEW_ASSIGNED`
- `ATTENDANCE.EMPLOYEES.VIEW_ASSIGNED`
- `ATTENDANCE.REPORTS.VIEW_ASSIGNED`
- `ATTENDANCE.OT_SUMMARY.VIEW_ASSIGNED`
- `ATTENDANCE.ATTENDANCE_REGISTER.VIEW_ASSIGNED`
- `ATTENDANCE.ANALYTICS.VIEW_ASSIGNED`
- `ATTENDANCE.MY_ATTENDANCE.VIEW_OWN`

## Required CECB Auth DB Data

For assigned/section-level access, central Auth must have `UserWorkUnit` mappings:

- Match the Auth `UserId` to ERP work unit IDs.
- Work unit IDs should match Attendance employee data IDs such as `AGMWorkSpaceId`, `DGMWorkSpaceId`, or `ServiceUnitId`.
- If a user has an assigned role but no `UserWorkUnit` rows, assigned data can appear empty.

## Required LeaveDB Check

The system engineer should verify `LeaveDB.dbo.AssignedEmployee` has this nullable column:

```sql
USE LeaveDB;

IF COL_LENGTH('dbo.AssignedEmployee', 'LeaveClerkEmployeeId') IS NULL
    ALTER TABLE dbo.AssignedEmployee ADD LeaveClerkEmployeeId uniqueidentifier NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_AssignedEmployee_LeaveClerkEmployeeId'
    AND object_id = OBJECT_ID(N'dbo.AssignedEmployee')
)
    CREATE INDEX IX_AssignedEmployee_LeaveClerkEmployeeId
    ON dbo.AssignedEmployee(LeaveClerkEmployeeId);
```

Also verify:

- `LeaveDB.dbo.AssignedEmployee` contains active employee rows.
- `LeaveDB.dbo.User`, `Role`, and `UserRole` identify active leave clerks.
- Accepted leave clerk role names are `LeaveClerk`, `LEAVE_CLERK`, `ATTENDANCE_CLERK`, and `CLERK`.

## Required Connection Strings

Production configuration must provide valid connection strings for:

- `AttendanceSystemDB`
- `AttendanceERP`
- `ServerERP`
- `LeaveDb`
- `CECBAuth`

Do not commit production secrets to source control.

## Post-Setup Smoke Test

After central Auth and DB setup:

1. Login as `Admin` or `LeaveAdmin`.
2. Confirm the sidebar shows **Assign Clerks**.
3. Open **Assign Clerks** and confirm active leave clerks load in the dropdown.
4. Assign one employee manually with **Assign Selected**.
5. Unassign the same employee.
6. Run **Auto Assign** for unassigned employees.
7. Confirm **Assign History** records manual and auto actions.
8. Login as a `LeaveClerk`.
9. Confirm the clerk sees only the expected assigned/scope data.
10. Login as an assigned AGM/Clerk test user with `UserWorkUnit` rows and confirm assigned section data is visible.

## Message To Send

Please configure central Auth for the Attendance System with the JWT issuer/audience/secret, required role/permission claims, and `UserWorkUnit` mappings. Also verify `LeaveDB.dbo.AssignedEmployee.LeaveClerkEmployeeId` exists and active leave clerks are mapped through `LeaveDB.User`, `Role`, and `UserRole`. The Attendance code builds successfully and is ready for integration testing after those values/data are in place.
