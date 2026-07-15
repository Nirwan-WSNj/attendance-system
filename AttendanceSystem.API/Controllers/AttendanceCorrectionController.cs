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
    public class AttendanceCorrectionController : ControllerBase
    {
        private const string DirectUnderAgmFilter = "__DIRECT__";

        private readonly AppDbContext _db;
        private readonly LeaveDbContext _leaveDb;
        private readonly AttendanceRepository _repo;
        private readonly AttendanceAccessService _access;
        private readonly ILogger<AttendanceCorrectionController> _logger;

        public AttendanceCorrectionController(
            AppDbContext db,
            LeaveDbContext leaveDb,
            AttendanceRepository repo,
            AttendanceAccessService access,
            ILogger<AttendanceCorrectionController> logger)
        {
            _db = db;
            _leaveDb = leaveDb;
            _repo = repo;
            _access = access;
            _logger = logger;
        }

        [HttpGet("candidates")]
        public async Task<IActionResult> GetCandidates(
            [FromQuery] string from,
            [FromQuery] string to,
            [FromQuery] string? epfNo = null,
            [FromQuery] string? status = null,
            [FromQuery] string? keyword = null,
            [FromQuery] string? agm = null,
            [FromQuery] string? dgm = null,
            [FromQuery] string? serviceUnit = null,
            [FromQuery] string? designation = null,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 50)
        {
            if (!CanUseCorrections()) return Forbid();
            if (!TryParseRange(from, to, out var f, out var t, out var error)) return error!;
            if (t.DayNumber - f.DayNumber > 31) return BadRequest("Candidate range cannot exceed 31 days.");
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 25, 200);

            try
            {
                var employees = await _repo.GetEmployeesAsync(keyword);
                var allowedEpfs = await GetCorrectionAllowedEpfSetAsync(employees);
                if (allowedEpfs != null && allowedEpfs.Count == 0)
                {
                    if (!UsesLeaveClerkAssignmentScope()) return Forbid();
                    return Ok(new AttendanceCorrectionCandidatePageDTO
                    {
                        Page = page,
                        PageSize = pageSize,
                        TotalCount = 0,
                        TotalPages = 0
                    });
                }

                if (!string.IsNullOrWhiteSpace(epfNo) && allowedEpfs != null &&
                    !allowedEpfs.Contains(AttendanceAccessService.NormalizeEpf(epfNo)))
                    return Forbid();

                var employeePool = FilterEmployees(employees, allowedEpfs)
                    .Where(e => string.IsNullOrWhiteSpace(epfNo) ||
                                string.Equals(AttendanceAccessService.NormalizeEpf(e.EpfNo), AttendanceAccessService.NormalizeEpf(epfNo), StringComparison.OrdinalIgnoreCase))
                    .ToList();

                var agmOptions = DistinctOptions(employeePool.Select(e => e.AGMWorkSpaceName));
                var agmScopedForOptions = employeePool
                    .Where(e => MatchesOptional(e.AGMWorkSpaceName, agm))
                    .ToList();
                var dgmOptionCounts = agmScopedForOptions
                    .Where(e => !string.IsNullOrWhiteSpace(e.DGMWorkSpaceName))
                    .GroupBy(e => e.DGMWorkSpaceName!.Trim(), StringComparer.OrdinalIgnoreCase)
                    .OrderBy(g => g.Key)
                    .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);
                var dgmOptions = dgmOptionCounts.Keys.ToList();
                var directUnderAgmCount = agmScopedForOptions.Count(e => string.IsNullOrWhiteSpace(e.DGMWorkSpaceName));
                var dgmScopedForOptions = agmScopedForOptions
                    .Where(e => MatchesDgm(e.DGMWorkSpaceName, dgm))
                    .ToList();
                var serviceUnitOptions = DistinctOptions(dgmScopedForOptions.Select(e => e.ServiceUnitName));
                var designationOptions = DistinctOptions(dgmScopedForOptions
                    .Where(e => MatchesOptional(e.ServiceUnitName, serviceUnit))
                    .Select(e => e.DesignationName));

                var scopedEmployees = ApplyEmployeeFilters(employeePool, agm, dgm, serviceUnit, designation).ToList();
                if (scopedEmployees.Count == 0)
                {
                    return Ok(new AttendanceCorrectionCandidatePageDTO
                    {
                        Page = page,
                        PageSize = pageSize,
                        TotalCount = 0,
                        TotalPages = 0,
                        AgmOptions = agmOptions,
                        DgmOptions = dgmOptions,
                        DgmOptionCounts = dgmOptionCounts,
                        DirectUnderAgmCount = directUnderAgmCount,
                        ServiceUnitOptions = serviceUnitOptions,
                        DesignationOptions = designationOptions
                    });
                }

                var sourceStatuses = new Dictionary<DateOnly, AttendanceSourceStatusDTO>();
                for (var date = f; date <= t; date = date.AddDays(1))
                {
                    sourceStatuses[date] = await _repo.GetSourceStatusAsync(date);
                }

                var records = await _repo.GetByRangeAsync(f, t, epfNo, allowedEpfs);
                var byKey = records
                    .Where(r => !string.IsNullOrWhiteSpace(r.EpfNo) && r.WorkDate.HasValue)
                    .GroupBy(r => Key(r.EpfNo!, r.WorkDate!.Value), StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

                var result = new List<AttendanceRecordDTO>();
                for (var date = f; date <= t; date = date.AddDays(1))
                {
                    if (!sourceStatuses.TryGetValue(date, out var sourceStatus) ||
                        !sourceStatus.IsSynced ||
                        !sourceStatus.IsWorkingDay)
                    {
                        continue;
                    }

                    foreach (var emp in scopedEmployees)
                    {
                        if (string.IsNullOrWhiteSpace(emp.EpfNo)) continue;
                        var key = Key(emp.EpfNo, date);
                        if (byKey.TryGetValue(key, out var existing))
                        {
                            result.Add(existing);
                            continue;
                        }

                        result.Add(new AttendanceRecordDTO
                        {
                            EmployeeId = emp.EmployeeId,
                            EpfNo = emp.EpfNo,
                            NameWithInitial = emp.NameWithInitial,
                            DesignationName = emp.DesignationName,
                            InHour = emp.InHour,
                            InMinute = emp.InMinute,
                            OutHour = emp.OutHour,
                            OutMinute = emp.OutMinute,
                            AGMWorkSpaceId = emp.AGMWorkSpaceId,
                            AGMWorkSpaceName = emp.AGMWorkSpaceName,
                            DGMWorkSpaceId = emp.DGMWorkSpaceId,
                            DGMWorkSpaceName = emp.DGMWorkSpaceName,
                            ServiceUnitId = emp.ServiceUnitId,
                            ServiceUnitName = emp.ServiceUnitName,
                            WorkDate = date
                        });
                    }
                }

                result = ApplyStatusFilter(result, status);
                var ordered = result
                    .OrderByDescending(r => r.WorkDate)
                    .ThenBy(r => AttendanceAccessService.NormalizeEpf(r.EpfNo))
                    .ToList();
                var totalCount = ordered.Count;
                var items = ordered
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .ToList();

                return Ok(new AttendanceCorrectionCandidatePageDTO
                {
                    Page = page,
                    PageSize = pageSize,
                    TotalCount = totalCount,
                    TotalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize),
                    Items = items,
                    AgmOptions = agmOptions,
                    DgmOptions = dgmOptions,
                    DgmOptionCounts = dgmOptionCounts,
                    DirectUnderAgmCount = directUnderAgmCount,
                    ServiceUnitOptions = serviceUnitOptions,
                    DesignationOptions = designationOptions
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to load attendance correction candidates.");
                return Problem(title: "Failed to load attendance correction candidates.", statusCode: 500);
            }
        }

        [HttpGet("sessions")]
        public async Task<IActionResult> GetSessions(
            [FromQuery] string? from = null,
            [FromQuery] string? to = null,
            [FromQuery] string? status = null,
            [FromQuery] string? epfNo = null)
        {
            if (!CanUseCorrections()) return Forbid();

            DateOnly? f = null;
            DateOnly? t = null;
            if (!string.IsNullOrWhiteSpace(from) && DateOnly.TryParse(from, out var fromDate)) f = fromDate;
            if (!string.IsNullOrWhiteSpace(to) && DateOnly.TryParse(to, out var toDate)) t = toDate;
            if (f.HasValue && t.HasValue && f > t) return BadRequest("from must not be after to");

            try
            {
                var employees = await _repo.GetEmployeesAsync();
                var allowedEpfs = await GetCorrectionAllowedEpfSetAsync(employees);
                if (allowedEpfs != null && allowedEpfs.Count == 0)
                {
                    if (!UsesLeaveClerkAssignmentScope()) return Forbid();
                    return Ok(Array.Empty<AttendanceCorrectionSessionDTO>());
                }

                var query = _db.AttendanceCorrectionSessions.AsNoTracking().AsQueryable();

                if (f.HasValue) query = query.Where(x => x.ToDate >= f.Value);
                if (t.HasValue) query = query.Where(x => x.FromDate <= t.Value);
                if (!string.IsNullOrWhiteSpace(status)) query = query.Where(x => x.Status == status);

                var sessions = await query
                    .OrderByDescending(x => x.CreatedAt)
                    .Take(100)
                    .ToListAsync();

                if (sessions.Count == 0) return Ok(Array.Empty<AttendanceCorrectionSessionDTO>());

                var sessionIds = sessions.Select(s => s.SessionId).ToArray();
                var normalizedFilter = string.IsNullOrWhiteSpace(epfNo) ? null : AttendanceAccessService.NormalizeEpf(epfNo);

                var correctionsQuery = _db.AttendanceCorrections.AsNoTracking()
                    .Where(c => sessionIds.Contains(c.SessionId));

                if (allowedEpfs != null)
                {
                    var allowedFilter = allowedEpfs.ToArray();
                    correctionsQuery = correctionsQuery.Where(c => allowedFilter.Contains(c.EpfNo));
                }
                if (normalizedFilter != null)
                    correctionsQuery = correctionsQuery.Where(c => c.EpfNo == normalizedFilter);

                var corrections = await correctionsQuery 
                    .OrderBy(c => c.WorkDate)
                    .ThenBy(c => c.EpfNo)
                    .ToListAsync();

                var correctionsBySession = corrections
                    .GroupBy(c => c.SessionId)
                    .ToDictionary(g => g.Key, g => (IReadOnlyCollection<AttendanceCorrection>)g.ToList());

                var result = sessions
                    .Select(s => ToSessionDto(
                        s,
                        correctionsBySession.TryGetValue(s.SessionId, out var items)
                            ? items
                            : Array.Empty<AttendanceCorrection>()))
                    .Where(s => s.ItemCount > 0)
                    .ToList();

                return Ok(result);  
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to load attendance correction sessions.");
                return Problem(title: "Failed to load attendance correction sessions.", statusCode: 500);
            }
        }

        [HttpPost("sessions")]
        public async Task<IActionResult> CreateSession([FromBody] AttendanceCorrectionSessionCreateDTO dto)
        {
            if (!CanManageCorrections()) return Forbid();
            if (!TryParseRange(dto.FromDate, dto.ToDate, out var f, out var t, out var error)) return error!;
            if (dto.Items.Count == 0) return BadRequest("At least one correction item is required.");
            if (dto.Items.Count > 250) return BadRequest("A session can contain up to 250 correction items.");

            try
            {
                var employees = await _repo.GetEmployeesAsync();
                var empMap = employees
                    .Where(e => !string.IsNullOrWhiteSpace(e.EpfNo))
                    .GroupBy(e => AttendanceAccessService.NormalizeEpf(e.EpfNo), StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

                var allowedEpfs = await GetCorrectionAllowedEpfSetAsync(employees);
                if (allowedEpfs != null && allowedEpfs.Count == 0) return Forbid();

                var now = DateTime.UtcNow;
                var user = GetUserInfo();
                var session = new AttendanceCorrectionSession
                {
                    SessionId = Guid.NewGuid(),
                    SessionNo = $"AC-{now:yyyyMMddHHmmss}",
                    Title = string.IsNullOrWhiteSpace(dto.Title) ? "Attendance correction session" : dto.Title.Trim(),
                    FromDate = f,
                    ToDate = t,
                    Status = "Applied",
                    Remarks = Trim(dto.Remarks, 1000),
                    CreatedAt = now,
                    CreatedByUserId = user.UserId,
                    CreatedByName = user.Name,
                    CreatedByEpfNo = user.EpfNo
                };

                var corrections = new List<AttendanceCorrection>();
                var uniqueItemKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var sourceStatuses = new Dictionary<DateOnly, AttendanceSourceStatusDTO>();
                foreach (var item in dto.Items)
                {
                    if (!DateOnly.TryParse(item.WorkDate, out var workDate))
                        return BadRequest($"Invalid work date for EPF {item.EpfNo}.");
                    if (workDate < f || workDate > t)
                        return BadRequest($"Correction date {workDate:yyyy-MM-dd} is outside session range.");
                    if (!sourceStatuses.TryGetValue(workDate, out var sourceStatus))
                    {
                        sourceStatus = await _repo.GetSourceStatusAsync(workDate);
                        sourceStatuses[workDate] = sourceStatus;
                    }
                    if (!sourceStatus.IsSynced || !sourceStatus.IsWorkingDay)
                        return BadRequest($"Corrections can only be saved for synced working days. Check source status for {workDate:yyyy-MM-dd}.");

                    var epf = AttendanceAccessService.NormalizeEpf(item.EpfNo);
                    if (string.IsNullOrWhiteSpace(epf)) return BadRequest("EPF number is required.");
                    if (allowedEpfs != null && !allowedEpfs.Contains(epf)) return Forbid();
                    if (!empMap.TryGetValue(epf, out var emp))
                        return BadRequest($"Employee not found for EPF {item.EpfNo}.");

                    var itemKey = Key(epf, workDate);
                    if (!uniqueItemKeys.Add(itemKey))
                        return BadRequest($"Duplicate correction row for EPF {epf} on {workDate:yyyy-MM-dd}.");

                    var checkIn = NormalizeTime(item.CorrectedCheckIn);
                    var checkOut = NormalizeTime(item.CorrectedCheckOut);
                    if (checkIn == null && checkOut == null)
                        return BadRequest($"At least one corrected time is required for EPF {epf} on {workDate:yyyy-MM-dd}.");

                    var current = (await _repo.GetByRangeAsync(
                        workDate,
                        workDate,
                        epf,
                        allowedEpfs: null,
                        applyCorrections: false)).FirstOrDefault();
                    if ((current == null || string.IsNullOrWhiteSpace(current.CheckIn)) && checkIn == null)
                        return BadRequest($"Corrected check-in is required for EPF {epf} on {workDate:yyyy-MM-dd}.");
                    if ((current == null || string.IsNullOrWhiteSpace(current.CheckOut)) && checkOut == null)
                        return BadRequest($"Corrected check-out is required for EPF {epf} on {workDate:yyyy-MM-dd}.");

                    corrections.Add(new AttendanceCorrection
                    {
                        CorrectionId = Guid.NewGuid(),
                        SessionId = session.SessionId,
                        EpfNo = epf,
                        EmployeeId = emp.EmployeeId,
                        EmployeeName = emp.NameWithInitial,
                        WorkDate = workDate,
                        OriginalCheckIn = current?.CheckIn,
                        OriginalCheckOut = current?.CheckOut,
                        CorrectedCheckIn = checkIn,
                        CorrectedCheckOut = checkOut,
                        ReasonType = string.IsNullOrWhiteSpace(item.ReasonType) ? "Site/Circuit" : item.ReasonType.Trim(),
                        Location = Trim(item.Location, 200),
                        Remarks = Trim(item.Remarks, 1000),
                        Status = "Applied",
                        IsActive = true,
                        CreatedAt = now,
                        CreatedByUserId = user.UserId,
                        CreatedByName = user.Name,
                        CreatedByEpfNo = user.EpfNo
                    });
                }

                var affectedKeys = corrections
                    .Select(c => Key(c.EpfNo, c.WorkDate))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
                var affectedEpfs = corrections.Select(c => c.EpfNo).Distinct().ToList();
                var affectedDates = corrections.Select(c => c.WorkDate).Distinct().ToList();
                var existing = await _db.AttendanceCorrections
                    .Where(c => c.IsActive && affectedEpfs.Contains(c.EpfNo) && affectedDates.Contains(c.WorkDate))
                    .ToListAsync();
                foreach (var old in existing.Where(c => affectedKeys.Contains(Key(c.EpfNo, c.WorkDate))))
                {
                    old.IsActive = false;
                    old.Status = "Superseded";
                    old.UpdatedAt = now;
                    old.UpdatedByName = user.Name;
                }

                _db.AttendanceCorrectionSessions.Add(session);
                _db.AttendanceCorrections.AddRange(corrections);
                await _db.SaveChangesAsync();

                return Ok(ToSessionDto(session, corrections));
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (DbUpdateException ex) when (IsActiveCorrectionUniqueViolation(ex))
            {
                return Conflict("An active correction already exists for one selected EPF/date. Refresh candidates and try again.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to create attendance correction session.");
                return Problem(title: "Failed to save attendance corrections.", statusCode: 500);
            }
        }

        [HttpPut("{correctionId:guid}")]
        public async Task<IActionResult> UpdateCorrection(Guid correctionId, [FromBody] AttendanceCorrectionUpdateDTO dto)
        {
            if (!CanManageCorrections()) return Forbid();

            var correction = await _db.AttendanceCorrections.FindAsync(correctionId);
            if (correction == null) return NotFound();

            var employee = (await _repo.GetEmployeesAsync(correction.EpfNo))
                .FirstOrDefault(e => string.Equals(AttendanceAccessService.NormalizeEpf(e.EpfNo), correction.EpfNo, StringComparison.OrdinalIgnoreCase));
            if (!await CanAccessCorrectionEmployeeAsync(employee, correction.EpfNo))
                return Forbid();

            string? checkIn;
            string? checkOut;
            try
            {
                checkIn = NormalizeTime(dto.CorrectedCheckIn);
                checkOut = NormalizeTime(dto.CorrectedCheckOut);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            if (dto.IsActive && checkIn == null && checkOut == null)
                return BadRequest("At least one corrected time is required.");
            if (dto.IsActive && string.IsNullOrWhiteSpace(correction.OriginalCheckIn) && checkIn == null)
                return BadRequest("Corrected check-in is required.");
            if (dto.IsActive && string.IsNullOrWhiteSpace(correction.OriginalCheckOut) && checkOut == null)
                return BadRequest("Corrected check-out is required.");

            var now = DateTime.UtcNow;
            var user = GetUserInfo();
            correction.CorrectedCheckIn = checkIn;
            correction.CorrectedCheckOut = checkOut;
            correction.ReasonType = string.IsNullOrWhiteSpace(dto.ReasonType) ? "Site/Circuit" : dto.ReasonType.Trim();
            correction.Location = Trim(dto.Location, 200);
            correction.Remarks = Trim(dto.Remarks, 1000);
            correction.IsActive = dto.IsActive;
            correction.Status = dto.IsActive ? "Applied" : "Void";
            correction.UpdatedAt = now;
            correction.UpdatedByName = user.Name;

            if (dto.IsActive)
            {
                var duplicates = await _db.AttendanceCorrections
                    .Where(c => c.CorrectionId != correction.CorrectionId &&
                                c.IsActive &&
                                c.EpfNo == correction.EpfNo &&
                                c.WorkDate == correction.WorkDate)
                    .ToListAsync();
                foreach (var old in duplicates)
                {
                    old.IsActive = false;
                    old.Status = "Superseded";
                    old.UpdatedAt = now;
                    old.UpdatedByName = user.Name;
                }
            }

            await _db.SaveChangesAsync();
            return Ok(ToCorrectionDto(correction, ""));
        }

        [HttpDelete("{correctionId:guid}")]
        public async Task<IActionResult> VoidCorrection(Guid correctionId)
        {
            if (!CanManageCorrections()) return Forbid();

            var correction = await _db.AttendanceCorrections.FindAsync(correctionId);
            if (correction == null) return NotFound();

            var employee = (await _repo.GetEmployeesAsync(correction.EpfNo))
                .FirstOrDefault(e => string.Equals(AttendanceAccessService.NormalizeEpf(e.EpfNo), correction.EpfNo, StringComparison.OrdinalIgnoreCase));
            if (!await CanAccessCorrectionEmployeeAsync(employee, correction.EpfNo))
                return Forbid();

            correction.IsActive = false;
            correction.Status = "Void";
            correction.UpdatedAt = DateTime.UtcNow;
            correction.UpdatedByName = GetUserInfo().Name;
            await _db.SaveChangesAsync();
            return NoContent();
        }

        private bool CanUseCorrections() =>
            _access.IsAdminUser(User) ||
            _access.IsLeaveAdminUser(User) ||
            _access.IsLeaveClerkUser(User) ||
            _access.HasAnyPermission(
                User,
                AttendancePermissions.AttendanceCorrectionsViewAssigned,
                AttendancePermissions.AttendanceCorrectionsManage);

        private bool CanManageCorrections() =>
            _access.IsAdminUser(User) ||
            _access.IsLeaveAdminUser(User) ||
            _access.IsLeaveClerkUser(User) ||
            _access.HasAnyPermission(User, AttendancePermissions.AttendanceCorrectionsManage);

        private bool UsesLeaveClerkAssignmentScope() =>
            _access.IsLeaveClerkUser(User) && !HasUnrestrictedCorrectionManagerScope();

        private bool HasUnrestrictedCorrectionManagerScope() =>
            _access.IsAdminUser(User) || _access.IsLeaveAdminUser(User);

        private async Task<HashSet<string>?> GetCorrectionAllowedEpfSetAsync(List<AttendanceEmployeeDTO> employees)
        {
            // Attendance administrators and LeaveAdmin users have organisation-wide
            // correction scope. Assignment-only managers do not implicitly receive
            // correction access; the permissions remain intentionally separate.
            if (HasUnrestrictedCorrectionManagerScope())
                return null;

            if (UsesLeaveClerkAssignmentScope())
                return await GetAssignedLeaveClerkEpfSetAsync(employees);

            if (_access.HasAnyPermission(
                    User,
                    AttendancePermissions.AttendanceCorrectionsViewAssigned,
                    AttendancePermissions.AttendanceCorrectionsManage))
            {
                return await _access.GetAssignedWorkUnitEpfSetAsync(User, employees);
            }

            return [];
        }

        private async Task<bool> CanAccessCorrectionEmployeeAsync(AttendanceEmployeeDTO? employee, string? requestedEpf)
        {
            if (HasUnrestrictedCorrectionManagerScope())
                return true;

            if (UsesLeaveClerkAssignmentScope())
            {
                var allowedEpfs = await GetAssignedLeaveClerkEpfSetAsync(employee == null ? [] : [employee]);
                return !string.IsNullOrWhiteSpace(requestedEpf) &&
                       allowedEpfs.Contains(AttendanceAccessService.NormalizeEpf(requestedEpf));
            }

            if (_access.HasPermission(User, AttendancePermissions.AttendanceCorrectionsManage))
                return await _access.IsInAssignedWorkUnitAsync(User, employee);

            return false;
        }

        private async Task<HashSet<string>> GetAssignedLeaveClerkEpfSetAsync(List<AttendanceEmployeeDTO> employees)
        {
            var clerkEmployeeId = await ResolveCallerLeaveEmployeeIdAsync();
            if (!clerkEmployeeId.HasValue) return [];

            var assignedEmployeeIds = await _leaveDb.AssignedEmployees
                .AsNoTracking()
                .Where(x => x.LeaveClerkEmployeeId == clerkEmployeeId.Value)
                .Select(x => x.EmployeeId)
                .Distinct()
                .ToListAsync();

            if (assignedEmployeeIds.Count == 0) return [];

            var assignedSet = assignedEmployeeIds.ToHashSet();
            var epfs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var leaveEpfs = await _leaveDb.Users
                .AsNoTracking()
                .Where(u => assignedEmployeeIds.Contains(u.EmployeeId))
                .Select(u => u.EPFNo)
                .ToListAsync();

            foreach (var epf in leaveEpfs)
            {
                if (!string.IsNullOrWhiteSpace(epf))
                    epfs.Add(AttendanceAccessService.NormalizeEpf(epf));
            }

            foreach (var employee in employees)
            {
                if (employee.EmployeeId.HasValue &&
                    assignedSet.Contains(employee.EmployeeId.Value) &&
                    !string.IsNullOrWhiteSpace(employee.EpfNo))
                {
                    epfs.Add(AttendanceAccessService.NormalizeEpf(employee.EpfNo));
                }
            }

            return epfs;
        }

        private async Task<Guid?> ResolveCallerLeaveEmployeeIdAsync()
        {
            var claimEmployeeId = _access.GetCallerEmployeeId(User);
            if (claimEmployeeId.HasValue) return claimEmployeeId.Value;

            var epf = _access.GetCallerEpf(User);
            if (string.IsNullOrWhiteSpace(epf)) return null;

            var normalized = AttendanceAccessService.NormalizeEpf(epf);
            return await _leaveDb.Users
                .AsNoTracking()
                .Where(u => u.IsActive && (u.EPFNo == epf || u.EPFNo == normalized))
                .Select(u => (Guid?)u.EmployeeId)
                .FirstOrDefaultAsync();
        }

        private static List<AttendanceRecordDTO> ApplyStatusFilter(List<AttendanceRecordDTO> records, string? status)
        {
            if (string.IsNullOrWhiteSpace(status) || string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
                return records;

            return status.Trim().ToLowerInvariant() switch
            {
                "absent" => records.Where(r => string.IsNullOrWhiteSpace(r.CheckIn) && string.IsNullOrWhiteSpace(r.CheckOut)).ToList(),
                "missing-in" => records.Where(r => string.IsNullOrWhiteSpace(r.CheckIn) && !string.IsNullOrWhiteSpace(r.CheckOut)).ToList(),
                "missing-out" => records.Where(r => !string.IsNullOrWhiteSpace(r.CheckIn) && string.IsNullOrWhiteSpace(r.CheckOut)).ToList(),
                "corrected" => records.Where(r => r.IsCorrected).ToList(),
                "needs-correction" => records.Where(r => string.IsNullOrWhiteSpace(r.CheckIn) || string.IsNullOrWhiteSpace(r.CheckOut)).ToList(),
                _ => records
            };
        }

        private static IEnumerable<AttendanceEmployeeDTO> ApplyEmployeeFilters(
            IEnumerable<AttendanceEmployeeDTO> employees,
            string? agm,
            string? dgm,
            string? serviceUnit,
            string? designation) =>
            employees
                .Where(e => MatchesOptional(e.AGMWorkSpaceName, agm))
                .Where(e => MatchesDgm(e.DGMWorkSpaceName, dgm))
                .Where(e => MatchesOptional(e.ServiceUnitName, serviceUnit))
                .Where(e => MatchesOptional(e.DesignationName, designation));

        private static bool MatchesDgm(string? value, string? filter) =>
            string.Equals(filter?.Trim(), DirectUnderAgmFilter, StringComparison.OrdinalIgnoreCase)
                ? string.IsNullOrWhiteSpace(value)
                : MatchesOptional(value, filter);

        private static bool MatchesOptional(string? value, string? filter) =>
            string.IsNullOrWhiteSpace(filter) ||
            string.Equals(value?.Trim(), filter.Trim(), StringComparison.OrdinalIgnoreCase);

        private static List<string> DistinctOptions(IEnumerable<string?> values) =>
            values
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Select(v => v!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(v => v)
                .ToList();

        private static bool IsActiveCorrectionUniqueViolation(DbUpdateException ex) =>
            ex.InnerException?.Message.Contains(
                "UX_AttendanceCorrections_ActiveEpfWorkDate",
                StringComparison.OrdinalIgnoreCase) == true;

        private static AttendanceCorrectionSessionDTO ToSessionDto(
            AttendanceCorrectionSession session,
            IReadOnlyCollection<AttendanceCorrection> corrections) =>
            new()
            {
                SessionId = session.SessionId,
                SessionNo = session.SessionNo,
                Title = session.Title,
                FromDate = session.FromDate.ToString("yyyy-MM-dd"),
                ToDate = session.ToDate.ToString("yyyy-MM-dd"),
                Status = session.Status,
                Remarks = session.Remarks,
                CreatedByName = session.CreatedByName,
                CreatedByEpfNo = session.CreatedByEpfNo,
                CreatedAt = session.CreatedAt,
                ItemCount = corrections.Count,
                Items = corrections.Select(c => ToCorrectionDto(c, session.SessionNo)).ToList()
            };

        private static AttendanceCorrectionDTO ToCorrectionDto(AttendanceCorrection c, string sessionNo) =>
            new()
            {
                CorrectionId = c.CorrectionId,
                SessionId = c.SessionId,
                SessionNo = sessionNo,
                EpfNo = c.EpfNo,
                EmployeeId = c.EmployeeId,
                EmployeeName = c.EmployeeName,
                WorkDate = c.WorkDate.ToString("yyyy-MM-dd"),
                OriginalCheckIn = c.OriginalCheckIn,
                OriginalCheckOut = c.OriginalCheckOut,
                CorrectedCheckIn = c.CorrectedCheckIn,
                CorrectedCheckOut = c.CorrectedCheckOut,
                ReasonType = c.ReasonType,
                Location = c.Location,
                Remarks = c.Remarks,
                Status = c.Status,
                IsActive = c.IsActive,
                CreatedByName = c.CreatedByName,
                CreatedByEpfNo = c.CreatedByEpfNo,
                CreatedAt = c.CreatedAt,
                UpdatedByName = c.UpdatedByName,
                UpdatedAt = c.UpdatedAt
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

        private static string? NormalizeTime(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var raw = value.Trim();
            string[] formats = ["H:mm", "HH:mm", "H:mm:ss", "HH:mm:ss"];
            if (!TimeOnly.TryParseExact(raw, formats, out var time))
                throw new ArgumentException($"Invalid time value '{value}'. Use HH:mm.");

            return time.ToString("HH:mm");
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

        private static string Key(string epfNo, DateOnly date) =>
            $"{AttendanceAccessService.NormalizeEpf(epfNo)}|{date:yyyyMMdd}";

        private static string? Trim(string? value, int maxLength)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var trimmed = value.Trim();
            return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
        }
    }
}
