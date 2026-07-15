# Role Permission Matrix

This is the proposed access model for the next role-based access phase. The current system fully supports `Admin` and employee self-access. AGM/DGM/Viewer roles are planned and need user-to-unit mapping before enforcement.

| Role | Dashboard | All Attendance | Employees | Reports | Users | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| Admin | Yes | Yes | Yes | Yes | Yes | All employees |
| AGM | Planned | Planned | Planned | Planned | No | Employees under assigned AGM workspace |
| DGM | Planned | Planned | Planned | Planned | No | Employees under assigned DGM workspace |
| HR Viewer | Planned | Planned | Planned | Planned | No | Read-only all employees or assigned unit |
| Employee | Limited | No | No | Own employee report only | No | Own EPF only |

## Current State

- Backend admin checks use `Authorize(Roles = "Admin")`.
- Employee access is restricted by the EPF number stored in the JWT token.
- Frontend admin menus are controlled by `isAdmin` from the logged-in role.
- There is no database mapping yet for AGM/DGM users to workspace IDs.

## Needed For AGM/DGM Roles

- Add user-to-workspace mapping in `AttendanceSystemDB`, for example `UserWorkspaceScopes`.
- Store `UserId`, `Role`, `AGMWorkSpaceId`, `DGMWorkSpaceId`, and `CanExport`.
- Enforce the same scope in backend queries, not only in the frontend.
- Keep Admin unrestricted.

## Safe Implementation Order

1. Add scope table and admin maintenance screen.
2. Add backend helper to read the caller's allowed workspace IDs.
3. Filter report/attendance endpoints by allowed scope.
4. Hide frontend menu/filter options outside the caller's scope.
5. Add tests with one Admin, one AGM, one DGM, and one Employee account.
