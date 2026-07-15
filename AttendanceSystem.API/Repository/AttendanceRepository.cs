using AttendanceSystem.API.DB;
using AttendanceSystem.API.DTOs;
using CECBERP.CMN.Business.Entities;
using CECBERP.CMN.Business.Entities.CMN;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Caching.Memory;
using System.Data;
using System.Data.Common;

namespace AttendanceSystem.API.Repository
{
    public class AttendanceRepository
    {
        private const int StandardStartMinutes = 8 * 60 + 30;
        private const int StandardEndMinutes = 16 * 60 + 15;
        private const int NoonMinutes = 12 * 60;
        private const int HalfDayCutoffMinutes = 12 * 60 + 30;
        private const int LateMinutes = 30;
        private const int HalfShortLeaveMinutes = 45;
        private const int ShortLeaveMinutes = 90;
        private const int MinimumCheckoutGapMinutes = 30;
        // A checkout before 12:30 PM is normally treated as a stray duplicate scan, not a real
        // departure. But if the gap from check-in is this large, it's almost certainly a genuine
        // early/half-day departure, so it should still be kept as the checkout.
        private const int MinimumPreNoonCheckoutGapMinutes = 120;
        private const int EarliestValidCheckInMinutes = 5 * 60;
        private const int NightCheckoutFallbackMinutes = 20 * 60;
        private const int EarliestOTStartMinutes = 7 * 60;
        // On a non-working day (Saturday/Sunday/public holiday) the whole day worked counts as OT,
        // minus a standard lunch break, rather than measuring against the normal 08:30-16:15 shift.
        private const int NonWorkingDayBreakMinutes = 60;

        private static readonly (string Key, string Label)[] ArrivalStatusDefinitions =
        [
            ("onTime", "On Time"),
            ("late", "Late"),
            ("halfShortLeave", "Half Short Leave"),
            ("shortLeave", "Short Leave"),
            ("halfDay", "Half Day"),
            ("missingIn", "Missing In"),
            ("noCheckIn", "No Valid Check In")
        ];

        private readonly ERPDBContext _erpCtx;
        private readonly AttendanceERPDbContext _attendanceCtx;
        private readonly LeaveDbContext _leaveCtx;
        private readonly AppDbContext _appCtx;
        private readonly IMemoryCache _cache;
        private readonly ILogger<AttendanceRepository> _logger;
        private readonly bool _useConfiguredPublicHolidays;
        private DB.Models.AttendanceRuleSetting? _rules;

        private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(30);
        private const string CacheKeyEmployeeList = "employee_list";
        private const string CacheKeyEmployees   = "employees_with_schedules";
        private const string CacheKeyFpUsers     = "fp_users";
        private const string CacheKeyHolidays    = "public_holidays";
        private const string CacheKeyRules       = "attendance_rules";

        public AttendanceRepository(ERPDBContext erpCtx, AttendanceERPDbContext attendanceCtx, LeaveDbContext leaveCtx, AppDbContext appCtx, IMemoryCache cache, IConfiguration configuration, ILogger<AttendanceRepository> logger)
        {
            _erpCtx = erpCtx;
            _attendanceCtx = attendanceCtx;
            _leaveCtx = leaveCtx;
            _appCtx = appCtx;
            _cache = cache;
            _logger = logger;
            _useConfiguredPublicHolidays = configuration.GetValue("Attendance:UsePublicHolidays", false);
            _erpCtx.Database.SetCommandTimeout(180);
            _attendanceCtx.Database.SetCommandTimeout(180);
            _leaveCtx.Database.SetCommandTimeout(180);
            _appCtx.Database.SetCommandTimeout(30);
        }



        public Task<List<AttendanceRecordDTO>> GetTodayAsync(IReadOnlySet<string>? allowedEpfs = null) =>
            GetByDateAsync(DateOnly.FromDateTime(DateTime.Now), allowedEpfs);

        public async Task<List<AttendanceRecordDTO>> GetByDateAsync(DateOnly date, IReadOnlySet<string>? allowedEpfs = null)
        {
            var rawTo = date.AddDays(1);
            var query = PunchesQuery().Where(p => p.WorkDate >= date && p.WorkDate <= rawTo);
            var allowedCandidates = GetAllowedEpfCandidates(allowedEpfs);
            if (allowedEpfs != null)
            {
                if (allowedCandidates.Length == 0) return [];
                query = query.Where(p => p.EpfNo != null && allowedCandidates.Contains(p.EpfNo));
            }

            var punches = await query.OrderBy(p => p.EpfNo).ToListAsync();

            var records = (await BuildRecordsAsync(punches))
                .Where(r => r.WorkDate == date)
                .ToList();
            return await ApplyAttendanceCorrectionsAsync(records, date, date, null, allowedEpfs);
        }

        public async Task<List<AttendanceRecordDTO>> GetByEpfAsync(string epfNo)
        {
            epfNo = epfNo.Trim();
            var epfCandidates = GetEpfCandidates(epfNo);
            var punches = await PunchesQuery()
                .Where(p => p.EpfNo != null && epfCandidates.Contains(p.EpfNo))
                .OrderByDescending(p => p.WorkDate)
                .ToListAsync();
            var records = await BuildRecordsAsync(punches);
            if (records.Count == 0) return records;

            var from = records.Where(r => r.WorkDate.HasValue).Select(r => r.WorkDate!.Value).DefaultIfEmpty(DateOnly.MinValue).Min();
            var to = records.Where(r => r.WorkDate.HasValue).Select(r => r.WorkDate!.Value).DefaultIfEmpty(DateOnly.MinValue).Max();
            return from == DateOnly.MinValue ? records : await ApplyAttendanceCorrectionsAsync(records, from, to, epfNo, null);
        }

        public async Task<List<AttendanceRecordDTO>> GetByRangeAsync(
            DateOnly from,
            DateOnly to,
            string? epfNo = null,
            IReadOnlySet<string>? allowedEpfs = null,
            bool applyCorrections = true)
        {
            epfNo = epfNo?.Trim();
            var rawTo = to.AddDays(1);
            var query = PunchesQuery().Where(p => p.WorkDate >= from && p.WorkDate <= rawTo);
            if (!string.IsNullOrWhiteSpace(epfNo))
            {
                if (allowedEpfs != null && !allowedEpfs.Contains(NormalizeEpf(epfNo)))
                    return [];

                var epfCandidates = GetEpfCandidates(epfNo);
                query = query.Where(p => p.EpfNo != null && epfCandidates.Contains(p.EpfNo));
            }
            else if (allowedEpfs != null)
            {
                var allowedCandidates = GetAllowedEpfCandidates(allowedEpfs);
                if (allowedCandidates.Length == 0) return [];
                query = query.Where(p => p.EpfNo != null && allowedCandidates.Contains(p.EpfNo));
            }

            var punches = await query.OrderByDescending(p => p.WorkDate).ThenBy(p => p.EpfNo).ToListAsync();
            var records = (await BuildRecordsAsync(punches))
                .Where(r => r.WorkDate >= from && r.WorkDate <= to)
                .ToList();
            return applyCorrections
                ? await ApplyAttendanceCorrectionsAsync(records, from, to, epfNo, allowedEpfs)
                : records;
        }

        public async Task<AttendanceSourceStatusDTO> GetSourceStatusAsync(DateOnly date)
        {
            var statuses = await GetSourceStatusMapAsync(date, date);
            return statuses[date];
        }

        public async Task<AttendanceStatusDTO> GetStatusByEpfAndDateAsync(string epfNo, DateOnly date)
        {
            epfNo = epfNo.Trim();
            await GetRulesAsync();

            var sourceStatus = await GetSourceStatusAsync(date);
            var isWeekend = sourceStatus.IsWeekend;
            var isHoliday = sourceStatus.IsHoliday;
            var holidayName = sourceStatus.HolidayName;

            var records = await GetByRangeAsync(date, date, epfNo);
            var record = records.FirstOrDefault();

            var name = record?.NameWithInitial;
            if (name == null)
            {
                var emp = (await GetEmployeesAsync(epfNo))
                    .FirstOrDefault(e => string.Equals(e.EpfNo, epfNo, StringComparison.OrdinalIgnoreCase));
                name = emp?.NameWithInitial ?? epfNo;
            }

            if (!sourceStatus.IsSynced)
            {
                return new AttendanceStatusDTO
                {
                    EpfNo = epfNo,
                    Name = name,
                    Date = date.ToString("yyyy-MM-dd"),
                    Status = "Not Synced",
                    IsSynced = false,
                    IsPresent = false,
                    IsAbsent = false,
                    IsWeekend = false,
                    IsHoliday = false,
                    HolidayName = null
                };
            }

            var daily = BuildDailyRecord(date, record, isHoliday ? new HashSet<DateOnly> { date } : new HashSet<DateOnly>());

            string status;
            bool isPresent;
            if (isWeekend) { status = "Weekend"; isPresent = false; }
            else if (isHoliday) { status = "Holiday"; isPresent = false; }
            else if (IsNonPresentStatus(daily.Status)) { status = daily.Status; isPresent = false; }
            else { status = daily.Status; isPresent = true; }

            return new AttendanceStatusDTO
            {
                EpfNo = epfNo,
                Name = name,
                Date = date.ToString("yyyy-MM-dd"),
                Status = status,
                IsSynced = sourceStatus.IsSynced,
                IsPresent = isPresent,
                IsAbsent = !isPresent && !isWeekend && !isHoliday,
                IsWeekend = isWeekend,
                IsHoliday = isHoliday,
                HolidayName = holidayName,
                CheckIn = daily.CheckIn,
                CheckOut = daily.CheckOut,
                WorkHours = daily.WorkHours,
                LateBy = daily.LateBy
            };
        }

        #if false
        private record TimeNetEmpInfo(string EpfNo, string Name);

        // Caches TimeNet employee_id → (EpfNo, Name) so the JOIN stays off the remote server.
        private async Task<Dictionary<int, TimeNetEmpInfo>> GetTimeNetEmployeeMapCachedAsync()
        {
            if (_cache.TryGetValue(CacheKeyTimeNetEmps, out Dictionary<int, TimeNetEmpInfo>? cached))
                return cached!;

            var rows = await _timeNetCtx.hr_employee.AsNoTracking()
                .Where(e => e.emp_pin != null)
                .Select(e => new { e.id, e.emp_pin, e.emp_firstname, e.emp_lastname })
                .ToListAsync();
            var map = rows.ToDictionary(
                e => e.id,
                e => new TimeNetEmpInfo(
                    e.emp_pin!.Trim(),
                    $"{e.emp_firstname ?? ""} {e.emp_lastname ?? ""}".Trim()));
            _cache.Set(CacheKeyTimeNetEmps, map, CacheDuration);
            return map;
        }

        // Reads raw punches from TimeNet.db and returns one PunchRecord per employee per day.
        private async Task<List<PunchRecord>> TryGetTimeNetPunchRecordsAsync(DateOnly from, DateOnly to, string? epfNoFilter = null)
        {
            try { return await GetTimeNetPunchRecordsAsync(from, to, epfNoFilter); }
            catch { return []; }
        }

        private async Task<List<PunchRecord>> GetTimeNetPunchRecordsAsync(DateOnly from, DateOnly to, string? epfNoFilter = null)
        {
            var fromDt = from.ToDateTime(TimeOnly.MinValue);
            var toDt   = to.ToDateTime(new TimeOnly(23, 59, 59));

            var empMap = await GetTimeNetEmployeeMapCachedAsync();

            var punches = await _timeNetCtx.att_punches.AsNoTracking()
                .Where(p => p.punch_time >= fromDt && p.punch_time <= toDt)
                .ToListAsync();

            epfNoFilter = epfNoFilter?.Trim();
            return punches
                .Where(p => empMap.ContainsKey(p.employee_id))
                .Select(p => new
                {
                    p.punch_time,
                    p.workstate,
                    // Normalize to 6-digit zero-padded format to match CECB_ERP (TimeNet stores without leading zeros)
                    EpfNo = NormalizeEpf(empMap[p.employee_id].EpfNo),
                    empMap[p.employee_id].Name
                })
                .Where(p => string.IsNullOrWhiteSpace(epfNoFilter) ||
                            string.Equals(p.EpfNo, NormalizeEpf(epfNoFilter), StringComparison.OrdinalIgnoreCase))
                .GroupBy(p => new { p.EpfNo, p.Name, Date = DateOnly.FromDateTime(p.punch_time) })
                .Select(g =>
                {
                    var ordered    = g.OrderBy(p => p.punch_time).ToList();
                    var firstPunch = ordered.First();
                    var lastPunch  = ordered.Last();
                    var gapMins    = (int)(lastPunch.punch_time - firstPunch.punch_time).TotalMinutes;

                    // Checkout detection:
                    // 1. Explicit check-out punch (workstate=1) takes priority.
                    // 2. Auto-detect (workstate=255) last punch used when gap >= minimum.
                    // 3. Explicit check-in (workstate=0) as last punch = still in office.
                    var explicitOut = ordered.LastOrDefault(p => p.workstate == 1);
                    string? checkOut = null;
                    if (explicitOut != null)
                        checkOut = explicitOut.punch_time.ToString("HH:mm");
                    else if (gapMins >= MinimumCheckoutGapMinutes && lastPunch.workstate != 0)
                        checkOut = lastPunch.punch_time.ToString("HH:mm");

                    return new PunchRecord
                    {
                        EpfNo        = g.Key.EpfNo,
                        WorkDate     = g.Key.Date,
                        CheckIn      = firstPunch.punch_time.ToString("HH:mm"),
                        CheckOut     = checkOut,
                        ReceivedAt   = lastPunch.punch_time,
                        FallbackName = g.Key.Name
                    };
                })
                .ToList();
        }

        #endif

        // ---- REPORTS ----

        public async Task<EmployeeAttendanceSummaryDTO> GetEmployeeReportAsync(string epfNo, DateOnly from, DateOnly to)
        {
            epfNo = epfNo.Trim();
            await GetRulesAsync();
            var records = await GetByRangeAsync(from, to, epfNo);
            var emp = records.FirstOrDefault();

            // Fallback: fetch employee profile from ERP if no punch records exist in range
            AttendanceEmployeeDTO? profile = emp != null ? null :
                (await GetEmployeesAsync(epfNo)).FirstOrDefault(e =>
                    string.Equals(e.EpfNo, epfNo, StringComparison.OrdinalIgnoreCase));

            var workingDates = await GetWorkingDaysAsync(from, to);
            var sourceStatusMap = await GetSourceStatusMapAsync(from, to);
            var summary = new EmployeeAttendanceSummaryDTO
            {
                EpfNo = epfNo,
                Name = emp?.NameWithInitial ?? profile?.NameWithInitial ?? epfNo,
                Designation = emp?.DesignationName ?? profile?.DesignationName,
                AGMUnit = emp?.AGMWorkSpaceName ?? profile?.AGMWorkSpaceName,
                DGMUnit = emp?.DGMWorkSpaceName ?? profile?.DGMWorkSpaceName,
                ServiceUnit = emp?.ServiceUnitName ?? profile?.ServiceUnitName
            };

            var byDate = records
                .Where(r => r.WorkDate.HasValue)
                .GroupBy(r => r.WorkDate!.Value)
                .ToDictionary(g => g.Key, g => g.First());

            foreach (var date in workingDates)
            {
                if (sourceStatusMap.TryGetValue(date, out var sourceStatus) && !sourceStatus.IsSynced)
                {
                    summary.UnsyncedDays++;
                    summary.DailyRecords.Add(new DailyEmployeeRecordDTO
                    {
                        Date = date.ToString("yyyy-MM-dd"),
                        Status = "NotSynced",
                        IsSynced = false
                    });
                    continue;
                }

                summary.WorkingDays++;
                byDate.TryGetValue(date, out var r);
                var daily = BuildDailyRecord(date, r);
                summary.DailyRecords.Add(daily);

                if (IsNonPresentStatus(daily.Status))
                    summary.AbsentDays++;
                else
                {
                    summary.PresentDays++;
                    if (IsLateArrivalStatus(daily.Status))
                        summary.LateDays++;
                    else
                        summary.OntimeDays++;
                    summary.TotalWorkHours += daily.WorkHours ?? 0;
                }
            }

            summary.AverageWorkHours = summary.PresentDays > 0
                ? Math.Round(summary.TotalWorkHours / summary.PresentDays, 2) : 0;
            summary.TotalWorkHours = Math.Round(summary.TotalWorkHours, 2);
            summary.AttendanceRate = summary.WorkingDays > 0
                ? Math.Round((double)summary.PresentDays / summary.WorkingDays * 100, 1) : 0;
            await TrySaveMonthlyAttendanceSnapshotsAsync(from, to, new List<EmployeeAttendanceSummaryDTO> { summary });
            return summary;
        }

        public async Task<List<EmployeeAttendanceSummaryDTO>> GetAllEmployeeSummaryAsync(
            DateOnly from,
            DateOnly to,
            IReadOnlySet<string>? allowedEpfs = null)
        {
            await GetRulesAsync();
            var allRecords = await GetByRangeAsync(from, to, allowedEpfs: allowedEpfs);
            var allEmps = FilterEmployeesByAllowedEpfs(await GetEmployeesAsync(), allowedEpfs);
            var workingDates = await GetWorkingDaysAsync(from, to);
            var sourceStatusMap = await GetSourceStatusMapAsync(from, to);

            var recordsByEpf = allRecords
                .Where(r => !string.IsNullOrWhiteSpace(r.EpfNo) && r.WorkDate.HasValue)
                .GroupBy(r => r.EpfNo!)
                .ToDictionary(g => g.Key, g => g.GroupBy(r => r.WorkDate!.Value).ToDictionary(x => x.Key, x => x.First()));

            var summaries = allEmps.Select(emp =>
            {
                var epf = emp.EpfNo ?? "";
                recordsByEpf.TryGetValue(epf, out var byDate);

                var summary = new EmployeeAttendanceSummaryDTO
                {
                    EpfNo = epf,
                    Name = emp.NameWithInitial,
                    Designation = emp.DesignationName,
                    AGMUnit = emp.AGMWorkSpaceName,
                    DGMUnit = emp.DGMWorkSpaceName,
                    ServiceUnit = emp.ServiceUnitName
                };

                foreach (var date in workingDates)
                {
                    if (sourceStatusMap.TryGetValue(date, out var sourceStatus) && !sourceStatus.IsSynced)
                    {
                        summary.UnsyncedDays++;
                        continue;
                    }

                    summary.WorkingDays++;
                    var r = byDate != null && byDate.TryGetValue(date, out var rec) ? rec : null;
                    var daily = BuildDailyRecord(date, r);
                    if (IsNonPresentStatus(daily.Status)) summary.AbsentDays++;
                    else
                    {
                        summary.PresentDays++;
                        if (IsLateArrivalStatus(daily.Status)) summary.LateDays++;
                        else summary.OntimeDays++;
                        summary.TotalWorkHours += daily.WorkHours ?? 0;
                    }
                }

                summary.TotalWorkHours = Math.Round(summary.TotalWorkHours, 2);
                summary.AverageWorkHours = summary.PresentDays > 0 ? Math.Round(summary.TotalWorkHours / summary.PresentDays, 2) : 0;
                summary.AttendanceRate = summary.WorkingDays > 0 ? Math.Round((double)summary.PresentDays / summary.WorkingDays * 100, 1) : 0;
                return summary;
            }).OrderBy(s => s.EpfNo).ToList();

            await TrySaveMonthlyAttendanceSnapshotsAsync(from, to, summaries);
            return summaries;
        }

        public async Task<List<UnitAttendanceSummaryDTO>> GetAgmWiseReportAsync(
            DateOnly from,
            DateOnly to,
            IReadOnlySet<string>? allowedEpfs = null)
        {
            var summaries = await GetAllEmployeeSummaryAsync(from, to, allowedEpfs);
            var workingDays = summaries.Select(s => s.WorkingDays).DefaultIfEmpty(0).Max();

            // Build AGM → DGM → SU hierarchy
            var agmGroups = summaries
                .GroupBy(s => s.AGMUnit ?? "No AGM Unit")
                .OrderBy(g => g.Key);

            return agmGroups.Select(agmGroup =>
            {
                var agmSummary = BuildUnitSummary(agmGroup.Key, "AGM", agmGroup.ToList(), workingDays);

                agmSummary.Children = agmGroup
                    .GroupBy(s => s.DGMUnit ?? "Direct")
                    .OrderBy(g => g.Key)
                    .Select(dgmGroup =>
                    {
                        var dgmSummary = BuildUnitSummary(dgmGroup.Key, "DGM", dgmGroup.ToList(), workingDays);
                        dgmSummary.Children = dgmGroup
                            .GroupBy(s => s.ServiceUnit ?? "Direct")
                            .OrderBy(g => g.Key)
                            .Select(suGroup => BuildUnitSummary(suGroup.Key, "ServiceUnit", suGroup.ToList(), workingDays))
                            .ToList();
                        return dgmSummary;
                    }).ToList();

                return agmSummary;
            }).ToList();
        }

        public async Task<List<LateArrivalRowDTO>> GetLateArrivalReportAsync(
            DateOnly from,
            DateOnly to,
            IReadOnlySet<string>? allowedEpfs = null)
        {
            var records = await GetByRangeAsync(from, to, allowedEpfs: allowedEpfs);
            // Only flag lateness on actual working days — weekend/holiday swipes are not late
            var workingDates = (await GetWorkingDaysAsync(from, to)).ToHashSet();
            var result = new List<LateArrivalRowDTO>();

            foreach (var r in records.Where(r =>
                !string.IsNullOrWhiteSpace(r.CheckIn) &&
                r.WorkDate.HasValue &&
                workingDates.Contains(r.WorkDate!.Value)))
            {
                var startMins = (r.InHour.HasValue && r.InMinute.HasValue)
                    ? r.InHour.Value * 60 + r.InMinute.Value
                    : StandardStartMinutes;

                var checkInMins = ParseMinutes(r.CheckIn);
                if (!checkInMins.HasValue || checkInMins.Value <= startMins) continue;

                // Ignore records where check-in is after noon — those are half-day absences or
                // FPDataset sync anomalies (evening punch recorded as first punch), not late arrivals.
                if (checkInMins.Value > NoonMinutes) continue;

                var lateMins = checkInMins.Value - startMins;

                result.Add(new LateArrivalRowDTO
                {
                    EpfNo    = r.EpfNo,
                    Name     = r.NameWithInitial,
                    AGMUnit  = r.AGMWorkSpaceName,
                    DGMUnit  = r.DGMWorkSpaceName,
                    Unit     = r.ServiceUnitName ?? r.DGMWorkSpaceName ?? r.AGMWorkSpaceName,
                    Date     = r.WorkDate!.Value.ToString("yyyy-MM-dd"),
                    CheckIn  = r.CheckIn ?? "",
                    ScheduledStart = FormatMinutes(startMins),
                    LateMinutes    = lateMins,
                    LateBy   = lateMins >= 60 ? $"{lateMins / 60}h {lateMins % 60}m" : $"{lateMins}m"
                });
            }

            return result.OrderByDescending(r => r.LateMinutes).ToList();
        }

        public async Task<List<OverallDailySummaryDTO>> GetDailySummaryReportAsync(
            DateOnly from,
            DateOnly to,
            IReadOnlySet<string>? allowedEpfs = null)
        {
            var rules = await GetRulesAsync();
            var allRecords = await GetByRangeAsync(from, to, allowedEpfs: allowedEpfs);
            var allEmps = FilterEmployeesByAllowedEpfs(await GetEmployeesAsync(), allowedEpfs);
            var totalRegistered = allEmps.Count;
            var workingDates = await GetWorkingDaysAsync(from, to);
            var sourceStatusMap = await GetSourceStatusMapAsync(from, to);

            var byDate = allRecords
                .Where(r => r.WorkDate.HasValue)
                .GroupBy(r => r.WorkDate!.Value)
                .ToDictionary(g => g.Key, g => g.ToList());

            return workingDates.Select(date =>
            {
                var sourceStatus = sourceStatusMap[date];
                if (!sourceStatus.IsSynced)
                {
                    return new OverallDailySummaryDTO
                    {
                        Date = date.ToString("yyyy-MM-dd"),
                        TotalRegistered = totalRegistered,
                        Present = 0,
                        Absent = 0,
                        Late = 0,
                        OnTime = 0,
                        CheckedOut = 0,
                        IsSynced = false,
                        IsWorkingDay = sourceStatus.IsWorkingDay,
                        SourceStatus = sourceStatus.Status,
                        LastReceivedAt = sourceStatus.LastReceivedAt,
                        AttendanceRate = 0,
                        AverageWorkHours = 0
                    };
                }

                byDate.TryGetValue(date, out var dayRecords);
                var records = dayRecords ?? [];
                var present = records.Count;
                var late = records.Count(r => IsLate(r.CheckIn, r.InHour, r.InMinute, rules));
                var checkedOut = records.Count(r => !string.IsNullOrWhiteSpace(r.CheckOut));
                var totalMins = records.Sum(r => CalcWorkMins(r.CheckIn, r.CheckOut, r.CheckOutIsNextDay) ?? 0);

                return new OverallDailySummaryDTO
                {
                    Date = date.ToString("yyyy-MM-dd"),
                    TotalRegistered = totalRegistered,
                    Present = present,
                    Absent = totalRegistered - present,
                    Late = late,
                    OnTime = present - late,
                    CheckedOut = checkedOut,
                    IsSynced = true,
                    IsWorkingDay = sourceStatus.IsWorkingDay,
                    SourceStatus = sourceStatus.Status,
                    LastReceivedAt = sourceStatus.LastReceivedAt,
                    AttendanceRate = totalRegistered > 0 ? Math.Round((double)present / totalRegistered * 100, 1) : 0,
                    // Average only over employees who actually completed their day (have a checkout)
                    AverageWorkHours = checkedOut > 0 ? Math.Round((double)totalMins / 60 / checkedOut, 2) : 0
                };
            }).ToList();
        }

        public async Task<AttendanceRegisterDTO> GetAttendanceRegisterAsync(
            int year,
            int month,
            string? agmFilter = null,
            string? dgmFilter = null,
            IReadOnlySet<string>? allowedEpfs = null)
        {
            var from = new DateOnly(year, month, 1);
            var to = new DateOnly(year, month, DateTime.DaysInMonth(year, month));
            var holidays = await GetHolidayMapAsync(from, to);

            // Day headers for every calendar day
            var dayNames = new[] { "S", "M", "T", "W", "T", "F", "S" };
            var dayHeaders = Enumerable.Range(1, DateTime.DaysInMonth(year, month)).Select(d =>
            {
                var date = new DateOnly(year, month, d);
                holidays.TryGetValue(date, out var holidayName);
                return new RegisterDayHeader
                {
                    Day = d,
                    DayName = dayNames[(int)date.DayOfWeek],
                    IsWeekend = date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday,
                    IsHoliday = holidayName != null,
                    HolidayName = holidayName
                };
            }).ToList();

            // Get all punch records for the month
            var allRecords = await GetByRangeAsync(from, to, allowedEpfs: allowedEpfs);
            var punchMap = allRecords
                .Where(r => r.WorkDate.HasValue && !string.IsNullOrWhiteSpace(r.EpfNo))
                .GroupBy(r => r.EpfNo!)
                .ToDictionary(g => g.Key,
                    g => g.ToDictionary(r => r.WorkDate!.Value.Day, r => r));

            static string Clean(string? value) => string.IsNullOrWhiteSpace(value) ? "" : value.Trim();
            static string TopUnit(AttendanceEmployeeDTO emp)
            {
                var agm = Clean(emp.AGMWorkSpaceName);
                var dgm = Clean(emp.DGMWorkSpaceName);
                var service = Clean(emp.ServiceUnitName);
                return agm.Length > 0 ? agm : dgm.Length > 0 ? dgm : service.Length > 0 ? service : "Unassigned";
            }
            static string ChildUnit(AttendanceEmployeeDTO emp)
            {
                var dgm = Clean(emp.DGMWorkSpaceName);
                var service = Clean(emp.ServiceUnitName);
                return dgm.Length > 0 ? dgm : service.Length > 0 ? service : TopUnit(emp);
            }
            static bool MatchesUnit(AttendanceEmployeeDTO emp, string filter)
            {
                if (string.IsNullOrWhiteSpace(filter)) return true;
                return string.Equals(emp.AGMWorkSpaceName, filter, StringComparison.OrdinalIgnoreCase) ||
                       string.Equals(emp.DGMWorkSpaceName, filter, StringComparison.OrdinalIgnoreCase) ||
                       string.Equals(emp.ServiceUnitName, filter, StringComparison.OrdinalIgnoreCase);
            }

            // Get employees, optionally filtered by AGM/DGM/Service Unit.
            var allEmps = FilterEmployeesByAllowedEpfs(await GetEmployeesAsync(), allowedEpfs);
            if (!string.IsNullOrWhiteSpace(agmFilter))
                allEmps = allEmps.Where(e => MatchesUnit(e, agmFilter)).ToList();
            if (string.Equals(dgmFilter, "__DIRECT__", StringComparison.OrdinalIgnoreCase))
                allEmps = allEmps.Where(e => string.IsNullOrWhiteSpace(e.DGMWorkSpaceName)).ToList();
            else if (!string.IsNullOrWhiteSpace(dgmFilter))
                allEmps = allEmps.Where(e => MatchesUnit(e, dgmFilter)).ToList();

            var monthNames = new[] { "", "January", "February", "March", "April", "May", "June",
                                     "July", "August", "September", "October", "November", "December" };

            // Group by AGM → DGM → ServiceUnit
            var units = allEmps
                .GroupBy(TopUnit)
                .OrderBy(g => g.Key)
                .SelectMany(agmGrp =>
                {
                    // If filtered to one AGM, show DGM sub-groups
                    if (!string.IsNullOrWhiteSpace(agmFilter))
                    {
                        return agmGrp
                            .GroupBy(ChildUnit)
                            .OrderBy(g => g.Key)
                            .Select(dgmGrp => new RegisterUnitGroup
                            {
                                UnitName = dgmGrp.Key,
                                UnitLevel = "DGM",
                                Employees = BuildRegisterRows(dgmGrp.ToList(), punchMap, dayHeaders)
                            });
                    }
                    return new[] { new RegisterUnitGroup
                    {
                        UnitName = agmGrp.Key,
                        UnitLevel = "AGM",
                        Employees = BuildRegisterRows(agmGrp.ToList(), punchMap, dayHeaders)
                    }};
                })
                .ToList();

            return new AttendanceRegisterDTO
            {
                PeriodLabel = $"{monthNames[month].ToUpper()} {year}",
                Year = year,
                Month = month,
                DayHeaders = dayHeaders,
                Units = units
            };
        }

        private static List<RegisterEmployeeRow> BuildRegisterRows(
            List<AttendanceEmployeeDTO> emps,
            Dictionary<string, Dictionary<int, AttendanceRecordDTO>> punchMap,
            List<RegisterDayHeader> dayHeaders)
        {
            return emps.OrderBy(e => e.EpfNo).Select(emp =>
            {
                punchMap.TryGetValue(emp.EpfNo ?? "", out var dayPunches);
                var times = new Dictionary<int, RegisterTimeDTO>();
                foreach (var dh in dayHeaders)
                {
                    AttendanceRecordDTO? punch = null;
                    dayPunches?.TryGetValue(dh.Day, out punch);
                    times[dh.Day] = new RegisterTimeDTO
                    {
                        CheckIn = punch?.CheckIn,
                        CheckOut = punch?.CheckOut,
                        IsHoliday = dh.IsHoliday,
                        IsWeekend = dh.IsWeekend
                    };
                }
                return new RegisterEmployeeRow
                {
                    EpfNo = emp.EpfNo ?? "",
                    Name = emp.NameWithInitial ?? "",
                    Times = times
                };
            }).ToList();
        }

        public async Task<AbsentEmployeesReportDTO> GetAbsentEmployeesAsync(
            DateOnly date,
            IReadOnlySet<string>? allowedEpfs = null)
        {
            var sourceStatus = await GetSourceStatusAsync(date);

            if (sourceStatus.IsWeekend)
                return new AbsentEmployeesReportDTO
                {
                    Date = date.ToString("yyyy-MM-dd"),
                    IsSynced = false,
                    IsWorkingDay = false,
                    IsWeekend = true
                };

            if (!sourceStatus.IsSynced)
                return new AbsentEmployeesReportDTO
                {
                    Date = date.ToString("yyyy-MM-dd"),
                    IsSynced = false,
                    IsWorkingDay = sourceStatus.IsWorkingDay,
                    IsWeekend = false
                };

            var allEmps = FilterEmployeesByAllowedEpfs(await GetAllEmployeeListCachedAsync(), allowedEpfs);
            var presentRecords = await GetByDateAsync(date, allowedEpfs);

            var presentEpfs = presentRecords
                .Where(r => !string.IsNullOrWhiteSpace(r.EpfNo))
                .Select(r => NormalizeEpf(r.EpfNo))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var absentEmps = allEmps
                .Where(e => !string.IsNullOrWhiteSpace(e.EpfNo) && !presentEpfs.Contains(NormalizeEpf(e.EpfNo)))
                .OrderBy(e => NormalizeEpf(e.EpfNo))
                .ToList();

            return new AbsentEmployeesReportDTO
            {
                Date = date.ToString("yyyy-MM-dd"),
                IsSynced = true,
                IsWorkingDay = true,
                IsWeekend = false,
                TotalRegistered = allEmps.Count,
                PresentCount = presentEpfs.Count,
                AbsentCount = absentEmps.Count,
                Employees = absentEmps
            };
        }

        public async Task<List<OTSummaryDTO>> GetOTSummaryAsync(
            DateOnly from,
            DateOnly to,
            string? epfNo = null,
            IReadOnlySet<string>? allowedEpfs = null)
        {
            var rules = await GetRulesAsync();
            var holidays = await GetHolidayMapAsync(from, to);
            var allRecords = await GetByRangeAsync(from, to, allowedEpfs: allowedEpfs);
            var result = new List<OTSummaryDTO>();

            var normalizedFilter = string.IsNullOrWhiteSpace(epfNo) ? null : NormalizeEpf(epfNo.Trim());

            var byEpf = allRecords
                .Where(r => !string.IsNullOrWhiteSpace(r.EpfNo) && r.WorkDate.HasValue &&
                            (normalizedFilter == null || NormalizeEpf(r.EpfNo!) == normalizedFilter))
                .GroupBy(r => r.EpfNo!);

            foreach (var empGroup in byEpf)
            {
                var first = empGroup.First();
                var designation = empGroup
                    .Select(r => r.DesignationName)
                    .FirstOrDefault(d => !string.IsNullOrWhiteSpace(d));

                var otDays = new List<OTDayDTO>();
                foreach (var r in empGroup.OrderBy(r => r.WorkDate))
                {
                    // Use each record's own schedule so mid-range schedule changes are handled correctly
                    var startMins = ResolveMinutes(r.InHour, r.InMinute, ResolveDefaultStartMinutes(rules));
                    var endMins = ResolveMinutes(r.OutHour, r.OutMinute, ResolveDefaultEndMinutes(rules));

                    var checkInMins = ParseMinutes(r.CheckIn);
                    var outMins = NormalizeCheckOutMins(r.CheckOut, checkInMins, r.CheckOutIsNextDay);
                    var isNonWorkingDay = r.WorkDate!.Value.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday
                        || holidays.ContainsKey(r.WorkDate.Value);
                    var overtime = CalculateVoucherOvertime(startMins, endMins, checkInMins, outMins, rules, isNonWorkingDay);
                    if (overtime.TotalMins == 0) continue;

                    otDays.Add(new OTDayDTO
                    {
                        Date = r.WorkDate!.Value.ToString("yyyy-MM-dd"),
                        CheckIn = r.CheckIn ?? "",
                        CheckOut = r.CheckOut ?? "",
                        ScheduledStart = FormatMinutes(startMins),
                        ScheduledEnd = FormatMinutes(endMins),
                        MorningOT = FormatMinutes(overtime.MorningMins),
                        EveningOT = FormatMinutes(overtime.EveningMins),
                        TotalOT = FormatMinutes(overtime.TotalMins),
                        OTHours = Math.Round(overtime.TotalMins / 60.0, 4),
                        OTDuration = $"{overtime.TotalMins / 60}h {overtime.TotalMins % 60}m"
                    });
                }

                if (otDays.Count == 0) continue;
                var totalOTHours = Math.Round(otDays.Sum(d => d.OTHours), 2);
                var isEngineerPayCategory = IsEngineerPayCategory(designation);
                result.Add(new OTSummaryDTO
                {
                    EpfNo = first.EpfNo,
                    Name = first.NameWithInitial,
                    Designation = designation,
                    Unit = first.ServiceUnitName ?? first.DGMWorkSpaceName ?? first.AGMWorkSpaceName,
                    AGMUnit = first.AGMWorkSpaceName,
                    DGMUnit = first.DGMWorkSpaceName,
                    OTDays = otDays.Count,
                    TotalOTHours = totalOTHours,
                    PayableOTHours = CalculatePayableOTHours(totalOTHours, isEngineerPayCategory),
                    IsEngineerPayCategory = isEngineerPayCategory,
                    PayableOTRule = isEngineerPayCategory ? "ENGINEER_30_28" : "NORMAL",
                    OTRecords = otDays
                });
            }

            var ordered = result.OrderByDescending(e => e.TotalOTHours).ToList();
            await TrySaveMonthlyOTSummarySnapshotsAsync(from, to, ordered);
            return ordered;
        }

        // ---- Private report helpers ----

        private static UnitAttendanceSummaryDTO BuildUnitSummary(string name, string level, List<EmployeeAttendanceSummaryDTO> emps, int workingDays)
        {
            var totalPresent = emps.Sum(e => e.PresentDays);
            var maxPossible = emps.Count * workingDays;
            return new UnitAttendanceSummaryDTO
            {
                UnitName = name,
                UnitLevel = level,
                RegisteredEmployees = emps.Count,
                TotalWorkingDays = workingDays,
                TotalPresent = totalPresent,
                TotalAbsent = emps.Sum(e => e.AbsentDays),
                TotalLate = emps.Sum(e => e.LateDays),
                TotalUnsyncedDays = emps.Sum(e => e.UnsyncedDays),
                AttendanceRate = maxPossible > 0 ? Math.Round((double)totalPresent / maxPossible * 100, 1) : 0,
                AverageWorkHours = emps.Where(e => e.PresentDays > 0).Select(e => e.AverageWorkHours).DefaultIfEmpty(0).Average()
            };
        }

        private DailyEmployeeRecordDTO BuildDailyRecord(DateOnly date, AttendanceRecordDTO? r, HashSet<DateOnly>? holidays = null)
        {
            var isHoliday = holidays != null && holidays.Contains(date);
            if (r == null)
            {
                return new DailyEmployeeRecordDTO { Date = date.ToString("yyyy-MM-dd"), Status = isHoliday ? "Holiday" : "Absent" };
            }

            var rules = _rules ?? new DB.Models.AttendanceRuleSetting();
            var startMins = ResolveMinutes(r.InHour, r.InMinute, ResolveDefaultStartMinutes(rules));
            var endMins = ResolveMinutes(r.OutHour, r.OutMinute, ResolveDefaultEndMinutes(rules));

            var checkInMins = ParseMinutes(r.CheckIn);
            if (!checkInMins.HasValue || checkInMins.Value > HalfDayCutoffMinutes)
            {
                if (!isHoliday && !checkInMins.HasValue && HasCheckOutEvidence(r))
                    return BuildMissingInRecord(date, r);

                if (!isHoliday && IsFullDayLeaveRecord(r))
                    return BuildFullDayLeaveRecord(date, r);

                return new DailyEmployeeRecordDTO { Date = date.ToString("yyyy-MM-dd"), Status = isHoliday ? "Holiday" : "Absent" };
            }

            var workMins = CalcWorkMins(r.CheckIn, r.CheckOut, r.CheckOutIsNextDay);
            var arrivalDelay = checkInMins.Value - startMins;
            var checkOutMins = NormalizeCheckOutMins(r.CheckOut, checkInMins, r.CheckOutIsNextDay);
            var earlyDeparture = checkOutMins.HasValue ? endMins - checkOutMins.Value : 0;
            var delay = Math.Max(arrivalDelay, earlyDeparture);

            string status;
            string? lateBy = null;
            var thresholds = ResolveDelayThresholds(rules);
            if (delay <= 0) status = "OnTime";
            else if (delay <= thresholds.Late) { status = "Late"; lateBy = FormatAttendanceVariance(delay, earlyDeparture > arrivalDelay); }
            else if (delay <= thresholds.HalfShortLeave) { status = "HalfShortLeave"; lateBy = FormatAttendanceVariance(delay, earlyDeparture > arrivalDelay); }
            else if (delay <= thresholds.ShortLeave) { status = "ShortLeave"; lateBy = FormatAttendanceVariance(delay, earlyDeparture > arrivalDelay); }
            else { status = "HalfDay"; lateBy = FormatAttendanceVariance(delay, earlyDeparture > arrivalDelay); }

            var isNonWorkingDay = date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday
                || (holidays != null && holidays.Contains(date));
            var hasOvertime = CalculateVoucherOvertime(startMins, endMins, checkInMins, checkOutMins, rules, isNonWorkingDay).TotalMins > 0;

            return new DailyEmployeeRecordDTO
            {
                Date = date.ToString("yyyy-MM-dd"),
                CheckIn = r.CheckIn,
                CheckOut = r.CheckOut,
                WorkHours = workMins.HasValue ? Math.Round((double)workMins.Value / 60, 2) : null,
                Status = status,
                LateBy = lateBy,
                HasOvertime = hasOvertime
            };
        }

        private static DailyEmployeeRecordDTO BuildMissingInRecord(DateOnly date, AttendanceRecordDTO r) =>
            new()
            {
                Date = date.ToString("yyyy-MM-dd"),
                CheckIn = r.CheckIn,
                CheckOut = r.CheckOut,
                Status = "MissingIn",
                LateBy = "Missing check-in",
                HasOvertime = false
            };

        private static DailyEmployeeRecordDTO BuildFullDayLeaveRecord(DateOnly date, AttendanceRecordDTO r) =>
            new()
            {
                Date = date.ToString("yyyy-MM-dd"),
                CheckIn = r.CheckIn,
                CheckOut = r.CheckOut,
                Status = "FullDayLeave",
                LateBy = "No valid check-in",
                HasOvertime = false
            };

        private static bool HasCheckOutEvidence(AttendanceRecordDTO r) =>
            !string.IsNullOrWhiteSpace(r.CheckOut) &&
            NormalizeCheckOutMins(r.CheckOut, null, r.CheckOutIsNextDay).HasValue;

        private static bool IsFullDayLeaveRecord(AttendanceRecordDTO r)
        {
            var checkInMins = ParseMinutes(r.CheckIn);
            if (checkInMins.HasValue) return checkInMins.Value > HalfDayCutoffMinutes;

            var checkOutMins = NormalizeCheckOutMins(r.CheckOut, null, r.CheckOutIsNextDay);
            return checkOutMins.HasValue && checkOutMins.Value > HalfDayCutoffMinutes;
        }

        private static bool IsNonPresentStatus(string? status) =>
            status is "Absent" or "FullDayLeave";

        private static bool IsLateArrivalStatus(string? status) =>
            status is "Late" or "HalfShortLeave" or "ShortLeave" or "HalfDay";

        private async Task<List<DateOnly>> GetWorkingDaysAsync(DateOnly from, DateOnly to)
        {
            var holidays = await GetHolidayMapAsync(from, to);
            var days = new List<DateOnly>();
            for (var d = from; d <= to; d = d.AddDays(1))
                if (d.DayOfWeek != DayOfWeek.Saturday && d.DayOfWeek != DayOfWeek.Sunday && !holidays.ContainsKey(d))
                    days.Add(d);
            return days;
        }

        private async Task<Dictionary<DateOnly, AttendanceSourceStatusDTO>> GetSourceStatusMapAsync(DateOnly from, DateOnly to)
        {
            var holidays = await GetHolidayMapAsync(from, to);
            var punchStats = await _attendanceCtx.FPDataset.AsNoTracking()
                .Select(p => new
                {
                    PunchDate = p.FirstPunchDate ?? p.LastPunchDate,
                    p.EPFNo,
                    p.ReceivedAt
                })
                .Where(p => p.PunchDate.HasValue && p.PunchDate >= from && p.PunchDate <= to)
                .GroupBy(p => p.PunchDate)
                .Select(g => new
                {
                    Date = g.Key,
                    PunchRecordCount = g.Count(),
                    EmployeeCount = g.Select(p => p.EPFNo).Distinct().Count(),
                    LastReceivedAt = g.Max(p => p.ReceivedAt)
                })
                .ToListAsync();

            var punchMap = punchStats
                .Where(s => s.Date.HasValue)
                .ToDictionary(s => s.Date!.Value, s => s);

            var latestStats = await _attendanceCtx.FPDataset.AsNoTracking()
                .GroupBy(_ => 1)
                .Select(g => new
                {
                    LatestFirstPunchDate = g.Max(p => p.FirstPunchDate),
                    LatestLastPunchDate = g.Max(p => p.LastPunchDate),
                    LatestReceivedAt = g.Max(p => p.ReceivedAt)
                })
                .FirstOrDefaultAsync();
            var latestPunchDate = LatestDate(latestStats?.LatestFirstPunchDate, latestStats?.LatestLastPunchDate);
            var latestReceivedAt = latestStats?.LatestReceivedAt;

            var today = DateOnly.FromDateTime(DateTime.Now);
            var result = new Dictionary<DateOnly, AttendanceSourceStatusDTO>();
            for (var date = from; date <= to; date = date.AddDays(1))
            {
                holidays.TryGetValue(date, out var holidayName);
                punchMap.TryGetValue(date, out var stats);

                var isWeekend = date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
                var isHoliday = holidayName != null;
                var isWorkingDay = !isWeekend && !isHoliday;
                var hasPunchData = stats != null && stats.PunchRecordCount > 0;
                var isFuture = date > today;
                var isSynced = !isFuture && (!isWorkingDay || hasPunchData);

                string status;
                string message;
                if (isFuture)
                {
                    status = "FutureDate";
                    message = "Future dates are not synced yet.";
                }
                else if (!isWorkingDay)
                {
                    status = hasPunchData ? "Synced" : "NonWorkingDay";
                    message = hasPunchData
                        ? "AttendanceERP has punch data for this non-working date."
                        : isHoliday
                            ? "This is a configured company holiday; punch data is not required."
                            : "This is a weekend; punch data is not required.";
                }
                else if (hasPunchData)
                {
                    status = "Synced";
                    message = "AttendanceERP punch data is available for this date.";
                }
                else
                {
                    var sourceIsStale = latestPunchDate.HasValue && latestPunchDate.Value < date;
                    status = sourceIsStale ? "Stale" : "NotSynced";
                    message = sourceIsStale
                        ? $"No AttendanceERP punch data was found for this working date. Latest available punch date is {latestPunchDate!.Value:yyyy-MM-dd}; check the AttendanceERP import/sync job."
                        : latestPunchDate.HasValue
                            ? "No AttendanceERP punch data was found for this working date."
                            : "AttendanceERP FPDataset has no punch data; check the AttendanceERP import/sync configuration.";
                }

                result[date] = new AttendanceSourceStatusDTO
                {
                    Date = date.ToString("yyyy-MM-dd"),
                    IsWorkingDay = isWorkingDay,
                    IsWeekend = isWeekend,
                    IsHoliday = isHoliday,
                    HolidayName = holidayName,
                    HasPunchData = hasPunchData,
                    IsSynced = isSynced,
                    PunchRecordCount = stats?.PunchRecordCount ?? 0,
                    EmployeeCount = stats?.EmployeeCount ?? 0,
                    LastReceivedAt = stats?.LastReceivedAt,
                    LatestAvailablePunchDate = latestPunchDate?.ToString("yyyy-MM-dd"),
                    LatestAvailableReceivedAt = latestReceivedAt,
                    Status = status,
                    Message = message
                };
            }

            return result;
        }

        private async Task<DB.Models.AttendanceRuleSetting> GetRulesAsync()
        {
            if (_rules != null) return _rules;
            if (_cache.TryGetValue(CacheKeyRules, out DB.Models.AttendanceRuleSetting? cached))
                return _rules = cached!;
            _rules = await _appCtx.AttendanceRuleSettings.AsNoTracking().FirstOrDefaultAsync(r => r.Id == 1)
                     ?? new DB.Models.AttendanceRuleSetting();
            _cache.Set(CacheKeyRules, _rules, CacheDuration);
            return _rules;
        }

        private async Task<Dictionary<DateOnly, string?>> GetHolidayMapAsync(DateOnly from, DateOnly to)
        {
            var cacheKey = $"{CacheKeyHolidays}:{from:yyyyMMdd}:{to:yyyyMMdd}";
            if (_cache.TryGetValue(cacheKey, out Dictionary<DateOnly, string?>? cached))
                return cached!;

            var holidays = new Dictionary<DateOnly, string?>();
            if (!_useConfiguredPublicHolidays)
            {
                _cache.Set(cacheKey, holidays, CacheDuration);
                return holidays;
            }

            try
            {
                var conn = _appCtx.Database.GetDbConnection();
                var closeAfterRead = conn.State == ConnectionState.Closed;
                if (closeAfterRead)
                    await conn.OpenAsync();

                try
                {
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = "SELECT * FROM dbo.PublicHolidays";
                    using var reader = await cmd.ExecuteReaderAsync();

                    while (await reader.ReadAsync())
                    {
                        var name = ReadString(reader, "HolidayName", "Name", "Title", "Description");
                        var date = ReadDate(reader, "HolidayDate", "Date", "DayDate");
                        var isRecurring = ReadBool(reader, "IsRecurring", "Recurring", "EveryYear", "IsAnnual") ?? false;
                        var month = ReadInt(reader, "Month", "MonthNo", "HolidayMonth");
                        var day = ReadInt(reader, "Day", "DayNo", "HolidayDay");

                        if (date.HasValue)
                        {
                            if (isRecurring)
                                AddRecurringHoliday(holidays, from, to, date.Value.Month, date.Value.Day, name);
                            else
                                AddHoliday(holidays, from, to, date.Value, name);
                            continue;
                        }

                        if (month.HasValue && day.HasValue)
                            AddRecurringHoliday(holidays, from, to, month.Value, day.Value, name);
                    }
                }
                finally
                {
                    if (closeAfterRead)
                        await conn.CloseAsync();
                }
            }
            catch (Exception)
            {
                // Older local databases may not have PublicHolidays yet. Reports still work with weekends only.
            }

            _cache.Set(cacheKey, holidays, CacheDuration);
            return holidays;
        }

        private static void AddRecurringHoliday(Dictionary<DateOnly, string?> holidays, DateOnly from, DateOnly to, int month, int day, string? name)
        {
            if (month is < 1 or > 12 || day < 1) return;

            for (var year = from.Year; year <= to.Year; year++)
            {
                if (day > DateTime.DaysInMonth(year, month)) continue;
                AddHoliday(holidays, from, to, new DateOnly(year, month, day), name);
            }
        }

        private static void AddHoliday(Dictionary<DateOnly, string?> holidays, DateOnly from, DateOnly to, DateOnly date, string? name)
        {
            if (date < from || date > to) return;
            if (!holidays.ContainsKey(date) || !string.IsNullOrWhiteSpace(name))
                holidays[date] = string.IsNullOrWhiteSpace(name) ? "Holiday" : name.Trim();
        }

        private static string? ReadString(DbDataReader reader, params string[] names)
        {
            var value = ReadValue(reader, names);
            return value == null ? null : Convert.ToString(value);
        }

        private static int? ReadInt(DbDataReader reader, params string[] names)
        {
            var value = ReadValue(reader, names);
            if (value == null) return null;
            try { return Convert.ToInt32(value); }
            catch { return int.TryParse(Convert.ToString(value), out var parsed) ? parsed : null; }
        }

        private static bool? ReadBool(DbDataReader reader, params string[] names)
        {
            var value = ReadValue(reader, names);
            if (value == null) return null;
            if (value is bool b) return b;
            if (value is byte or short or int or long) return Convert.ToInt64(value) != 0;
            var text = Convert.ToString(value)?.Trim();
            if (string.IsNullOrWhiteSpace(text)) return null;
            if (bool.TryParse(text, out var parsed)) return parsed;
            return text is "1" or "Y" or "y" or "YES" or "yes";
        }

        private static DateOnly? ReadDate(DbDataReader reader, params string[] names)
        {
            var value = ReadValue(reader, names);
            if (value == null) return null;
            if (value is DateTime dt) return DateOnly.FromDateTime(dt);
            if (value is DateOnly date) return date;
            var text = Convert.ToString(value);
            if (DateOnly.TryParse(text, out var parsedDate)) return parsedDate;
            return DateTime.TryParse(text, out var parsedDateTime) ? DateOnly.FromDateTime(parsedDateTime) : null;
        }

        private static object? ReadValue(DbDataReader reader, params string[] names)
        {
            for (var i = 0; i < reader.FieldCount; i++)
            {
                if (!names.Any(name => string.Equals(reader.GetName(i), name, StringComparison.OrdinalIgnoreCase)))
                    continue;
                return reader.IsDBNull(i) ? null : reader.GetValue(i);
            }
            return null;
        }

        private static int? CalcWorkMins(string? checkIn, string? checkOut, bool checkOutIsNextDay = false)
        {
            var inMins = ParseMinutes(checkIn);
            var outMins = ParseMinutes(checkOut);
            if (!inMins.HasValue || !outMins.HasValue) return null;
            if (checkOutIsNextDay)
                outMins += 24 * 60;
            var diff = outMins.Value - inMins.Value;
            // Fingerprint system may store times in 12h format without AM/PM suffix
            // (e.g. "4:15" for 16:15). If checkout parses earlier than checkin, add 12h.
            if (!checkOutIsNextDay && diff < 0) diff += 720;
            return diff > 0 ? diff : null;
        }

        // Returns checkout in absolute minutes, applying 12h normalisation when the
        // raw parsed value is less than checkin (12h-format fingerprint data).
        private static int? NormalizeCheckOutMins(string? checkOut, int? checkInMins, bool checkOutIsNextDay = false)
        {
            var outMins = ParseMinutes(checkOut);
            if (!outMins.HasValue) return null;
            if (checkOutIsNextDay)
                return outMins.Value + 24 * 60;
            if (checkInMins.HasValue && outMins.Value < checkInMins.Value)
                outMins = outMins.Value + 720;
            return outMins;
        }

        private static OvertimeCalculation CalculateVoucherOvertime(
            int startMins,
            int endMins,
            int? checkInMins,
            int? checkOutMins,
            DB.Models.AttendanceRuleSetting rules,
            bool isNonWorkingDay = false)
        {
            var roundingMins = Math.Max(1, rules.OTRoundingMinutes);
            var morningMinimumMins = Math.Max(0, rules.EarlyOTGraceMinutes);
            var eveningMinimumMins = Math.Max(0, rules.EveningOTGraceMinutes);
            var dailyMinimumMins = Math.Max(roundingMins, morningMinimumMins + eveningMinimumMins);

            if (!checkInMins.HasValue || !checkOutMins.HasValue)
                return new OvertimeCalculation(0, 0, 0, 0);

            if (checkInMins.Value < EarliestValidCheckInMinutes)
                return new OvertimeCalculation(0, 0, 0, 0);

            var effectiveCheckInMins = Math.Max(checkInMins.Value, EarliestOTStartMinutes);

            if (isNonWorkingDay)
            {
                var workedMins = checkOutMins.Value - effectiveCheckInMins;
                var netMins = FloorToBlock(Math.Max(0, workedMins - NonWorkingDayBreakMinutes), roundingMins);
                return netMins < dailyMinimumMins
                    ? new OvertimeCalculation(0, 0, 0, 0)
                    : new OvertimeCalculation(0, netMins, 0, netMins);
            }

            var morningMins = 0;
            var earlyMins = startMins - effectiveCheckInMins;
            if (earlyMins >= morningMinimumMins && earlyMins > 0)
                morningMins = FloorToBlock(earlyMins, roundingMins);

            var eveningMins = 0;
            var effectiveOutMins = rules.OTCapHour > 0
                ? Math.Min(checkOutMins.Value, rules.OTCapHour * 60)
                : checkOutMins.Value;

            var afterWorkMins = effectiveOutMins - endMins;
            if (afterWorkMins >= eveningMinimumMins && afterWorkMins > 0)
                eveningMins = FloorToBlock(afterWorkMins, roundingMins);

            var lateDeductionMins = 0;
            if (checkInMins.Value > startMins)
                lateDeductionMins = CeilToBlock(checkInMins.Value - startMins, roundingMins);

            var completedNormalDay = checkOutMins.Value >= endMins;
            var totalMins = completedNormalDay
                ? Math.Max(0, morningMins + eveningMins - lateDeductionMins)
                : 0;

            if (totalMins < dailyMinimumMins)
                totalMins = 0;

            return new OvertimeCalculation(morningMins, eveningMins, lateDeductionMins, totalMins);
        }

        private static int FloorToBlock(int minutes, int blockMins) =>
            (int)Math.Floor(minutes / (double)blockMins) * blockMins;

        private static int CeilToBlock(int minutes, int blockMins) =>
            (int)Math.Ceiling(minutes / (double)blockMins) * blockMins;

        private static int ResolveMinutes(int? hour, int? minute, int fallback)
        {
            if (!hour.HasValue || !minute.HasValue) return fallback;
            if (hour.Value is < 0 or > 23 || minute.Value is < 0 or > 59) return fallback;
            return hour.Value * 60 + minute.Value;
        }

        private static int ResolveDefaultStartMinutes(DB.Models.AttendanceRuleSetting rules) =>
            ResolveMinutes(rules.DefaultInHour, rules.DefaultInMinute, StandardStartMinutes);

        private static int ResolveDefaultEndMinutes(DB.Models.AttendanceRuleSetting rules) =>
            ResolveMinutes(rules.DefaultOutHour, rules.DefaultOutMinute, StandardEndMinutes);

        private static (int Late, int HalfShortLeave, int ShortLeave) ResolveDelayThresholds(DB.Models.AttendanceRuleSetting rules)
        {
            var late = Math.Max(0, rules.LateMinutes);
            var halfShort = Math.Max(late, rules.HalfShortLeaveMinutes);
            var shortLeave = Math.Max(halfShort, rules.ShortLeaveMinutes);
            return (late, halfShort, shortLeave);
        }

        private static string FormatAttendanceVariance(int minutes, bool isEarlyDeparture) =>
            isEarlyDeparture
                ? $"{minutes}m early departure"
                : minutes < 60 ? $"{minutes}m" : $"{minutes / 60}h {minutes % 60}m";

        private static readonly HashSet<string> EngineerPayDesignations = new(StringComparer.OrdinalIgnoreCase)
        {
            "Civil Engineer",
            "Mechanical Engineer",
            "Electrical Engineer",
            "Earth Resources Engineer",
            "Material Engineer",
            "Systems Engineer"
        };

        private static bool IsEngineerPayCategory(string? designation)
        {
            if (string.IsNullOrWhiteSpace(designation)) return false;

            var value = designation.Trim();
            if (value.Contains("Trainee", StringComparison.OrdinalIgnoreCase)) return false;
            if (value.Contains("Engineering Assistant", StringComparison.OrdinalIgnoreCase)) return false;

            return EngineerPayDesignations.Contains(value);
        }

        private static double CalculatePayableOTHours(double totalOTHours, bool isEngineerPayCategory)
        {
            if (!isEngineerPayCategory) return totalOTHours;

            return Math.Floor(totalOTHours * 30.0 / 28.0);
        }

        private sealed record OvertimeCalculation(
            int MorningMins,
            int EveningMins,
            int LateDeductionMins,
            int TotalMins);

        private static bool IsLate(string? checkIn, int? inHour, int? inMinute, DB.Models.AttendanceRuleSetting rules)
        {
            var mins = ParseMinutes(checkIn);
            if (!mins.HasValue) return false;
            var start = ResolveMinutes(inHour, inMinute, ResolveDefaultStartMinutes(rules));
            return mins.Value > start;
        }

        private static string FormatMinutes(int totalMins) =>
            $"{totalMins / 60:D2}:{totalMins % 60:D2}";

        public async Task<List<DailyAttendanceCountDTO>> GetDailyCountAsync(
            int days,
            IReadOnlySet<string>? allowedEpfs = null)
        {
            var to = DateOnly.FromDateTime(DateTime.Now);
            var from = to.AddDays(-(days - 1));
            var sourceStatusMap = await GetSourceStatusMapAsync(from, to);

            var rawTo = to.AddDays(1);
            var query = PunchesQuery().Where(p => p.WorkDate >= from && p.WorkDate <= rawTo);
            var allowedCandidates = GetAllowedEpfCandidates(allowedEpfs);
            if (allowedEpfs != null)
            {
                if (allowedCandidates.Length == 0) return EmptyDailyCounts(days, from, sourceStatusMap);
                query = query.Where(p => p.EpfNo != null && allowedCandidates.Contains(p.EpfNo));
            }

            var punches = await query.ToListAsync();
            punches = MergePunches(punches)
                .Where(p => p.WorkDate >= from && p.WorkDate <= to)
                .ToList();

            var epfNos = punches.Select(p => p.EpfNo).Where(e => !string.IsNullOrWhiteSpace(e)).Select(e => e!).Distinct().ToList();
            var empMap = await GetEmployeeMapAsync(epfNos);

            var countByDate = punches
                .Where(p => !string.IsNullOrWhiteSpace(p.EpfNo) && empMap.ContainsKey(p.EpfNo!))
                .GroupBy(p => p.WorkDate!.Value)
                .ToDictionary(g => g.Key, g => g.Count());

            return Enumerable.Range(0, days)
                .Select(i => from.AddDays(i))
                .Select(d =>
                {
                    var sourceStatus = sourceStatusMap[d];
                    return new DailyAttendanceCountDTO
                    {
                        Date = d,
                        Count = sourceStatus.IsSynced && countByDate.TryGetValue(d, out var c) ? c : 0,
                        IsSynced = sourceStatus.IsSynced,
                        IsWorkingDay = sourceStatus.IsWorkingDay
                    };
                })
                .ToList();
        }

        public async Task<List<AttendanceArrivalStatusCountDTO>> GetArrivalStatusAsync(
            int days,
            IReadOnlySet<string>? allowedEpfs = null)
        {
            await GetRulesAsync();
            var to = DateOnly.FromDateTime(DateTime.Now);
            var from = to.AddDays(-(days - 1));

            var rawTo = to.AddDays(1);
            var query = PunchesQuery().Where(p => p.WorkDate >= from && p.WorkDate <= rawTo);
            var allowedCandidates = GetAllowedEpfCandidates(allowedEpfs);
            if (allowedEpfs != null)
            {
                if (allowedCandidates.Length == 0) return EmptyArrivalStatusCounts();
                query = query.Where(p => p.EpfNo != null && allowedCandidates.Contains(p.EpfNo));
            }

            var punches = await query.ToListAsync();
            punches = MergePunches(punches)
                .Where(p => p.WorkDate >= from && p.WorkDate <= to)
                .ToList();

            var epfNos = punches.Select(p => p.EpfNo).Where(e => !string.IsNullOrWhiteSpace(e)).Select(e => e!).Distinct().ToList();
            var empMap = await GetEmployeeMapAsync(epfNos);

            var countByStatus = punches
                .Where(p => !string.IsNullOrWhiteSpace(p.EpfNo) && empMap.ContainsKey(p.EpfNo!))
                .GroupBy(p => GetArrivalBandKey(p.CheckIn, p.CheckOut, p.CheckOutIsNextDay, empMap[p.EpfNo!]))
                .ToDictionary(g => g.Key, g => g.Count());

            return ArrivalStatusDefinitions
                .Select(s => new AttendanceArrivalStatusCountDTO
                {
                    Key = s.Key,
                    Label = s.Label,
                    Count = countByStatus.TryGetValue(s.Key, out var c) ? c : 0
                })
                .ToList();
        }

        public async Task<List<AttendanceEmployeeDTO>> GetEmployeesAsync(string? keyword = null)
        {
            var employees = await GetAllEmployeeListCachedAsync();
            if (!string.IsNullOrWhiteSpace(keyword))
            {
                keyword = keyword.Trim();
                var normalizedKeyword = NormalizeEpf(keyword);
                employees = employees.Where(e =>
                    (e.EpfNo != null && e.EpfNo.Contains(keyword, StringComparison.OrdinalIgnoreCase)) ||
                    (e.EpfNo != null && NormalizeEpf(e.EpfNo).Contains(normalizedKeyword, StringComparison.OrdinalIgnoreCase)) ||
                    (e.NameWithInitial != null && e.NameWithInitial.Contains(keyword, StringComparison.OrdinalIgnoreCase)) ||
                    (e.DesignationName != null && e.DesignationName.Contains(keyword, StringComparison.OrdinalIgnoreCase)) ||
                    (e.ServiceUnitName != null && e.ServiceUnitName.Contains(keyword, StringComparison.OrdinalIgnoreCase)))
                    .ToList();
            }
            return employees.OrderBy(e => NormalizeEpf(e.EpfNo)).ToList();
        }

        public async Task<ScheduleCacheRefreshResultDTO> RefreshScheduleCacheAsync()
        {
            _cache.Remove(CacheKeyEmployeeList);
            _cache.Remove(CacheKeyEmployees);
            _cache.Remove(CacheKeyFpUsers);

            var refreshedAt = DateTime.UtcNow;
            await TryCheckDataSourceAsync("AttendanceERP", () => _attendanceCtx.FPDataset.AsNoTracking().AnyAsync());
            await TryCheckDataSourceAsync("CECB_ERP", () => _erpCtx.employeeVersions.AsNoTracking().AnyAsync());
            await TryCheckDataSourceAsync("LeaveDB", () => _leaveCtx.InOutTimes.AsNoTracking().AnyAsync());

            var employees = await GetAllEmployeeListCachedAsync();
            var snapshotCount = await _appCtx.EmployeeScheduleSnapshots.CountAsync();

            return new ScheduleCacheRefreshResultDTO
            {
                EmployeeCount = employees.Count,
                SnapshotCount = snapshotCount,
                RefreshedAt = refreshedAt,
                Message = "Employee schedules were refreshed from ERP and LeaveDB."
            };
        }

        // --- Private helpers ---

        private IQueryable<PunchRecord> PunchesQuery() =>
            _attendanceCtx.FPDataset.AsNoTracking()
                .Select(p => new PunchRecord
                {
                    EpfNo = p.EPFNo,
                    WorkDate = p.FirstPunchDate ?? p.LastPunchDate,
                    CheckIn = p.FirstPunchTime,
                    CheckOut = p.LastPunchTime,
                    ReceivedAt = p.ReceivedAt
                });

        private IQueryable<AttendanceEmployeeDTO> EmployeesQuery() =>
            from e in _erpCtx.employeeVersions.AsNoTracking()
            join d in _erpCtx.designations.AsNoTracking() on e.DesignationId equals d.DesignationId into dg
            from d in dg.DefaultIfEmpty()
            join agm in _erpCtx.workSpaces.AsNoTracking() on e.AGMWorkSpaceId equals agm.WorkSpaceId into ag
            from agm in ag.DefaultIfEmpty()
            join dgm in _erpCtx.workSpaces.AsNoTracking() on e.DGMWorkSpaceId equals dgm.WorkSpaceId into dg2
            from dgm in dg2.DefaultIfEmpty()
            join su in _erpCtx.workSpaces.AsNoTracking() on e.ServiceUnitId equals su.WorkSpaceId into sug
            from su in sug.DefaultIfEmpty()
            where e.IsActive == true
            select new AttendanceEmployeeDTO
            {
                EmployeeId = e.EmployeeId,
                EpfNo = e.EPFNo,
                NameWithInitial = e.NameWithInitial,
                DesignationName = d != null ? d.DesignationName : null,
                AGMWorkSpaceId = e.AGMWorkSpaceId,
                AGMWorkSpaceName = agm != null ? agm.WorkSpaceName : null,
                DGMWorkSpaceId = e.DGMWorkSpaceId,
                DGMWorkSpaceName = dgm != null ? dgm.WorkSpaceName : null,
                ServiceUnitId = e.ServiceUnitId,
                ServiceUnitName = su != null ? su.WorkSpaceName : null
            };

        // Returns ERP employees plus attendance-only fingerprint employees, cached for 30 minutes.
        // Cached because the ERP join + LeaveDB schedule query is the main latency driver.
        private async Task<List<AttendanceEmployeeDTO>> GetAllEmployeeListCachedAsync()
        {
            if (_cache.TryGetValue(CacheKeyEmployeeList, out List<AttendanceEmployeeDTO>? cached))
                return cached!;

            var employees = await EmployeesQuery().ToListAsync();
            await ApplySchedulesAsync(employees);

            employees = employees
                .Where(e => !string.IsNullOrWhiteSpace(e.EpfNo))
                .GroupBy(e => NormalizeEpf(e.EpfNo), StringComparer.OrdinalIgnoreCase)
                .Select(g => g.First())
                .OrderBy(e => NormalizeEpf(e.EpfNo))
                .ToList();

            await TrySaveEmployeeScheduleSnapshotAsync(employees);

            _cache.Set(CacheKeyEmployeeList, employees, CacheDuration);
            return employees;
        }

        private async Task<Dictionary<string, AttendanceEmployeeDTO>> GetAllEmployeesCachedAsync()
        {
            if (_cache.TryGetValue(CacheKeyEmployees, out Dictionary<string, AttendanceEmployeeDTO>? cached))
                return cached!;

            var employees = await GetAllEmployeeListCachedAsync();
            var map = employees
                .Where(e => !string.IsNullOrWhiteSpace(e.EpfNo))
                .GroupBy(e => NormalizeEpf(e.EpfNo), StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
            _cache.Set(CacheKeyEmployees, map, CacheDuration);
            return map;
        }

        private async Task<Dictionary<string, AttendanceEmployeeDTO>> GetEmployeeMapAsync(List<string> epfNos)
        {
            if (epfNos.Count == 0) return [];
            var all = await GetAllEmployeesCachedAsync();
            var epfSet = epfNos.Select(NormalizeEpf).ToHashSet(StringComparer.OrdinalIgnoreCase);
            return all
                .Where(kv => epfSet.Contains(kv.Key))
                .ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase);
        }

        private async Task ApplySchedulesAsync(List<AttendanceEmployeeDTO> employees)
        {
            var ids = employees.Where(e => e.EmployeeId.HasValue).Select(e => e.EmployeeId!.Value).Distinct().ToList();
            if (ids.Count == 0) return;

            var schedules = await _leaveCtx.InOutTimes.AsNoTracking()
                .Where(s => s.IsActive && ids.Contains(s.EmployeeId))
                .Select(s => new { s.EmployeeId, s.InHour, s.InMinute, s.OutHour, s.OutMinute })
                .ToListAsync();

            var scheduleMap = schedules.GroupBy(s => s.EmployeeId).ToDictionary(g => g.Key, g => g.First());

            foreach (var emp in employees)
            {
                if (!emp.EmployeeId.HasValue || !scheduleMap.TryGetValue(emp.EmployeeId.Value, out var s)) continue;
                emp.InHour = s.InHour;
                emp.InMinute = s.InMinute;
                emp.OutHour = s.OutHour;
                emp.OutMinute = s.OutMinute;
            }
        }

        private async Task TrySaveEmployeeScheduleSnapshotAsync(List<AttendanceEmployeeDTO> employees)
        {
            try
            {
                var now = DateTime.UtcNow;
                var snapshots = await _appCtx.EmployeeScheduleSnapshots.ToDictionaryAsync(s => s.EmployeeId);
                foreach (var emp in employees.Where(e => e.EmployeeId.HasValue && !string.IsNullOrWhiteSpace(e.EpfNo)))
                {
                    var employeeId = emp.EmployeeId!.Value;
                    if (!snapshots.TryGetValue(employeeId, out var snapshot))
                    {
                        snapshot = new DB.Models.EmployeeScheduleSnapshot { EmployeeId = employeeId };
                        _appCtx.EmployeeScheduleSnapshots.Add(snapshot);
                    }

                    snapshot.EpfNo = NormalizeEpf(emp.EpfNo);
                    snapshot.NameWithInitial = emp.NameWithInitial;
                    snapshot.DesignationName = emp.DesignationName;
                    snapshot.AGMWorkSpaceId = emp.AGMWorkSpaceId;
                    snapshot.AGMWorkSpaceName = emp.AGMWorkSpaceName;
                    snapshot.DGMWorkSpaceId = emp.DGMWorkSpaceId;
                    snapshot.DGMWorkSpaceName = emp.DGMWorkSpaceName;
                    snapshot.ServiceUnitId = emp.ServiceUnitId;
                    snapshot.ServiceUnitName = emp.ServiceUnitName;
                    snapshot.InHour = emp.InHour;
                    snapshot.InMinute = emp.InMinute;
                    snapshot.OutHour = emp.OutHour;
                    snapshot.OutMinute = emp.OutMinute;
                    snapshot.ScheduleSource = emp.InHour.HasValue && emp.InMinute.HasValue ? "LeaveDB" : "Default";
                    snapshot.LastSyncedAt = now;
                }

                var leaveDbHealth = await _appCtx.DataSourceHealth.FindAsync("LeaveDB");
                if (leaveDbHealth != null)
                {
                    leaveDbHealth.LastCheckedAt = now;
                    leaveDbHealth.LastSuccessAt = now;
                    leaveDbHealth.Status = "OK";
                    leaveDbHealth.Message = "Employee schedules loaded into AttendanceSystemDB snapshot.";
                }

                await TrySaveEmployeeWorkspaceHistoryAsync(employees, now);
                await TrySyncEmployeeUserMappingsAsync(employees, now);
                await _appCtx.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to save employee schedule/workspace snapshots.");
            }
        }

        private async Task TrySyncEmployeeUserMappingsAsync(List<AttendanceEmployeeDTO> employees, DateTime now)
        {
            var employeeMap = employees
                .Where(e => e.EmployeeId.HasValue && !string.IsNullOrWhiteSpace(e.EpfNo))
                .GroupBy(e => NormalizeEpf(e.EpfNo), StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
            if (employeeMap.Count == 0) return;

            var epfs = employeeMap.Keys.ToList();
            var mappings = await _appCtx.EmployeeUserMappings
                .Where(m => epfs.Contains(m.EpfNo))
                .ToListAsync();

            foreach (var mapping in mappings)
            {
                if (!employeeMap.TryGetValue(mapping.EpfNo, out var employee))
                    continue;

                mapping.EmployeeId = employee.EmployeeId;
                mapping.FullName = employee.NameWithInitial ?? mapping.FullName;
                mapping.LastSyncedAt = now;
            }
        }

        private async Task TrySaveEmployeeWorkspaceHistoryAsync(List<AttendanceEmployeeDTO> employees, DateTime now)
        {
            var validEmployees = employees
                .Where(e => e.EmployeeId.HasValue && !string.IsNullOrWhiteSpace(e.EpfNo))
                .ToList();
            if (validEmployees.Count == 0) return;

            var employeeIds = validEmployees.Select(e => e.EmployeeId!.Value).Distinct().ToList();
            var openHistoryRows = await _appCtx.EmployeeWorkspaceHistories
                .Where(h => employeeIds.Contains(h.EmployeeId) && h.EffectiveTo == null)
                .ToListAsync();
            var openByEmployee = openHistoryRows
                .GroupBy(h => h.EmployeeId)
                .ToDictionary(g =>
                {
                    var ordered = g.OrderByDescending(h => h.EffectiveFrom).ToList();
                    foreach (var duplicateOpenRow in ordered.Skip(1))
                    {
                        duplicateOpenRow.EffectiveTo = now.AddTicks(-1);
                        duplicateOpenRow.LastSyncedAt = now;
                    }
                    return g.Key;
                }, g => g.OrderByDescending(h => h.EffectiveFrom).First());

            foreach (var emp in validEmployees)
            {
                var employeeId = emp.EmployeeId!.Value;
                if (!openByEmployee.TryGetValue(employeeId, out var open))
                {
                    _appCtx.EmployeeWorkspaceHistories.Add(CreateWorkspaceHistory(emp, now));
                    continue;
                }

                if (WorkspaceMatches(open, emp))
                {
                    open.EpfNo = NormalizeEpf(emp.EpfNo);
                    open.EmployeeName = emp.NameWithInitial;
                    open.DesignationName = emp.DesignationName;
                    open.AGMWorkSpaceName = emp.AGMWorkSpaceName;
                    open.DGMWorkSpaceName = emp.DGMWorkSpaceName;
                    open.ServiceUnitName = emp.ServiceUnitName;
                    open.LastSyncedAt = now;
                    continue;
                }

                open.EffectiveTo = now.AddTicks(-1);
                open.LastSyncedAt = now;
                _appCtx.EmployeeWorkspaceHistories.Add(CreateWorkspaceHistory(emp, now));
            }
        }

        private static DB.Models.EmployeeWorkspaceHistory CreateWorkspaceHistory(AttendanceEmployeeDTO emp, DateTime now) =>
            new()
            {
                EmployeeId = emp.EmployeeId!.Value,
                EpfNo = NormalizeEpf(emp.EpfNo),
                EmployeeName = emp.NameWithInitial,
                DesignationName = emp.DesignationName,
                AGMWorkSpaceId = emp.AGMWorkSpaceId,
                AGMWorkSpaceName = emp.AGMWorkSpaceName,
                DGMWorkSpaceId = emp.DGMWorkSpaceId,
                DGMWorkSpaceName = emp.DGMWorkSpaceName,
                ServiceUnitId = emp.ServiceUnitId,
                ServiceUnitName = emp.ServiceUnitName,
                EffectiveFrom = now,
                Source = "CECB_ERP",
                LastSyncedAt = now
            };

        private static bool WorkspaceMatches(DB.Models.EmployeeWorkspaceHistory history, AttendanceEmployeeDTO emp) =>
            history.AGMWorkSpaceId == emp.AGMWorkSpaceId &&
            history.DGMWorkSpaceId == emp.DGMWorkSpaceId &&
            history.ServiceUnitId == emp.ServiceUnitId;

        private async Task TrySaveMonthlyAttendanceSnapshotsAsync(DateOnly from, DateOnly to, List<EmployeeAttendanceSummaryDTO> summaries)
        {
            if (!IsFullCalendarMonth(from, to) || summaries.Count == 0) return;

            try
            {
                var year = from.Year;
                var month = from.Month;
                var now = DateTime.UtcNow;
                var fromDate = ToDateTime(from);
                var toDate = ToDateTime(to);

                var rows = summaries
                    .Where(s => !string.IsNullOrWhiteSpace(s.EpfNo))
                    .GroupBy(s => NormalizeEpf(s.EpfNo), StringComparer.OrdinalIgnoreCase)
                    .Select(g => new { EpfNo = g.Key, Summary = g.First() })
                    .ToList();
                if (rows.Count == 0) return;

                var epfs = rows.Select(r => r.EpfNo).ToList();
                var existingRows = await _appCtx.MonthlyAttendanceSnapshots
                    .Where(s => s.Year == year && s.Month == month && epfs.Contains(s.EpfNo))
                    .ToListAsync();
                var existing = existingRows.ToDictionary(s => s.EpfNo, StringComparer.OrdinalIgnoreCase);

                foreach (var row in rows)
                {
                    if (!existing.TryGetValue(row.EpfNo, out var snapshot))
                    {
                        snapshot = new DB.Models.MonthlyAttendanceSnapshot
                        {
                            Year = year,
                            Month = month,
                            EpfNo = row.EpfNo
                        };
                        _appCtx.MonthlyAttendanceSnapshots.Add(snapshot);
                    }

                    var summary = row.Summary;
                    snapshot.Name = summary.Name;
                    snapshot.Designation = summary.Designation;
                    snapshot.AGMUnit = summary.AGMUnit;
                    snapshot.DGMUnit = summary.DGMUnit;
                    snapshot.ServiceUnit = summary.ServiceUnit;
                    snapshot.WorkingDays = summary.WorkingDays;
                    snapshot.UnsyncedDays = summary.UnsyncedDays;
                    snapshot.PresentDays = summary.PresentDays;
                    snapshot.AbsentDays = summary.AbsentDays;
                    snapshot.LateDays = summary.LateDays;
                    snapshot.OntimeDays = summary.OntimeDays;
                    snapshot.TotalWorkHours = summary.TotalWorkHours;
                    snapshot.AverageWorkHours = summary.AverageWorkHours;
                    snapshot.AttendanceRate = summary.AttendanceRate;
                    snapshot.SourceFromDate = fromDate;
                    snapshot.SourceToDate = toDate;
                    snapshot.GeneratedAt = now;
                }

                await _appCtx.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to save monthly attendance snapshots for {Year}-{Month}.", from.Year, from.Month);
            }
        }

        private async Task TrySaveMonthlyOTSummarySnapshotsAsync(DateOnly from, DateOnly to, List<OTSummaryDTO> summaries)
        {
            if (!IsFullCalendarMonth(from, to) || summaries.Count == 0) return;

            try
            {
                var year = from.Year;
                var month = from.Month;
                var now = DateTime.UtcNow;
                var fromDate = ToDateTime(from);
                var toDate = ToDateTime(to);

                var rows = summaries
                    .Where(s => !string.IsNullOrWhiteSpace(s.EpfNo))
                    .GroupBy(s => NormalizeEpf(s.EpfNo), StringComparer.OrdinalIgnoreCase)
                    .Select(g => new { EpfNo = g.Key, Summary = g.First() })
                    .ToList();
                if (rows.Count == 0) return;

                var epfs = rows.Select(r => r.EpfNo).ToList();
                var existingRows = await _appCtx.MonthlyOTSummarySnapshots
                    .Where(s => s.Year == year && s.Month == month && epfs.Contains(s.EpfNo))
                    .ToListAsync();
                var existing = existingRows.ToDictionary(s => s.EpfNo, StringComparer.OrdinalIgnoreCase);

                foreach (var row in rows)
                {
                    if (!existing.TryGetValue(row.EpfNo, out var snapshot))
                    {
                        snapshot = new DB.Models.MonthlyOTSummarySnapshot
                        {
                            Year = year,
                            Month = month,
                            EpfNo = row.EpfNo
                        };
                        _appCtx.MonthlyOTSummarySnapshots.Add(snapshot);
                    }

                    var summary = row.Summary;
                    snapshot.Name = summary.Name;
                    snapshot.Designation = summary.Designation;
                    snapshot.Unit = summary.Unit;
                    snapshot.AGMUnit = summary.AGMUnit;
                    snapshot.DGMUnit = summary.DGMUnit;
                    snapshot.OTDays = summary.OTDays;
                    snapshot.TotalOTHours = summary.TotalOTHours;
                    snapshot.PayableOTHours = summary.PayableOTHours;
                    snapshot.IsEngineerPayCategory = summary.IsEngineerPayCategory;
                    snapshot.PayableOTRule = summary.PayableOTRule;
                    snapshot.SourceFromDate = fromDate;
                    snapshot.SourceToDate = toDate;
                    snapshot.GeneratedAt = now;
                }

                await _appCtx.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to save monthly OT summary snapshots for {Year}-{Month}.", from.Year, from.Month);
            }
        }

        private static bool IsFullCalendarMonth(DateOnly from, DateOnly to) =>
            from.Day == 1 &&
            from.Year == to.Year &&
            from.Month == to.Month &&
            to.Day == DateTime.DaysInMonth(from.Year, from.Month);

        private static DateTime ToDateTime(DateOnly date) =>
            date.ToDateTime(TimeOnly.MinValue);

        private static DateOnly? LatestDate(DateOnly? first, DateOnly? second)
        {
            if (!first.HasValue) return second;
            if (!second.HasValue) return first;
            return first.Value >= second.Value ? first : second;
        }

        private async Task TryCheckDataSourceAsync(string sourceName, Func<Task<bool>> check)
        {
            var now = DateTime.UtcNow;
            try
            {
                await check();
                await UpsertDataSourceHealthAsync(sourceName, now, "OK", "Connection check succeeded.", true);
            }
            catch (Exception ex)
            {
                await UpsertDataSourceHealthAsync(sourceName, now, "Error", ex.Message, false);
                throw;
            }
        }

        private async Task UpsertDataSourceHealthAsync(string sourceName, DateTime checkedAt, string status, string message, bool success)
        {
            var health = await _appCtx.DataSourceHealth.FindAsync(sourceName);
            if (health == null)
            {
                health = new DB.Models.DataSourceHealth { SourceName = sourceName };
                _appCtx.DataSourceHealth.Add(health);
            }

            health.LastCheckedAt = checkedAt;
            if (success)
                health.LastSuccessAt = checkedAt;
            health.Status = status;
            health.Message = message.Length > 500 ? message[..500] : message;
            await _appCtx.SaveChangesAsync();
        }

        private async Task<Dictionary<string, DB.Models.FPuserList>> GetFpUserMapCachedAsync()
        {
            if (_cache.TryGetValue(CacheKeyFpUsers, out Dictionary<string, DB.Models.FPuserList>? cached))
                return cached!;

            var fpUsers = await _attendanceCtx.FPuserlist.AsNoTracking().ToListAsync();
            var map = fpUsers
                .Where(u => !string.IsNullOrWhiteSpace(u.epf_no))
                .GroupBy(u => NormalizeEpf(u.epf_no), StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    g => g.Key,
                    g => g.OrderByDescending(u => u.ReceivedAt ?? DateTime.MinValue).First(),
                    StringComparer.OrdinalIgnoreCase);
            _cache.Set(CacheKeyFpUsers, map, CacheDuration);
            return map;
        }

        private async Task<List<AttendanceRecordDTO>> BuildRecordsAsync(List<PunchRecord> punches)
        {
            if (punches.Count == 0) return [];
            punches = MergePunches(punches);

            var epfNos = punches.Select(p => p.EpfNo).Where(e => !string.IsNullOrWhiteSpace(e)).Select(e => e!).Distinct().ToList();
            var empMap    = await GetEmployeeMapAsync(epfNos);
            var fpUserMap = await GetFpUserMapCachedAsync();

            return punches
                .Where(p => !string.IsNullOrWhiteSpace(p.EpfNo))
                .Select(p =>
                {
                    var epfKey = NormalizeEpf(p.EpfNo);
                    empMap.TryGetValue(epfKey, out var emp);
                    if (emp == null)
                        return null;

                    fpUserMap.TryGetValue(epfKey, out var fpUser);
                    var fpName = FormatName(fpUser?.firstName, fpUser?.lastName);
                    var displayName = FirstNonBlank(emp?.NameWithInitial, p.FallbackName, fpName);

                    return new AttendanceRecordDTO
                    {
                        EmployeeId = emp?.EmployeeId,
                        EpfNo = FirstNonBlank(emp?.EpfNo, epfKey, p.EpfNo),
                        NameWithInitial = displayName,
                        FirstName = fpUser?.firstName,
                        LastName = fpUser?.lastName,
                        DesignationName = emp?.DesignationName,
                        InHour = emp?.InHour,
                        InMinute = emp?.InMinute,
                        OutHour = emp?.OutHour,
                        OutMinute = emp?.OutMinute,
                        AGMWorkSpaceId = emp?.AGMWorkSpaceId,
                        AGMWorkSpaceName = emp?.AGMWorkSpaceName,
                        DGMWorkSpaceId = emp?.DGMWorkSpaceId,
                        DGMWorkSpaceName = emp?.DGMWorkSpaceName,
                        ServiceUnitId = emp?.ServiceUnitId,
                        ServiceUnitName = emp?.ServiceUnitName,
                        WorkDate = p.WorkDate,
                        CheckIn = p.CheckIn,
                        CheckOut = p.CheckOut,
                        CheckOutIsNextDay = p.CheckOutIsNextDay,
                        ReceivedAt = p.ReceivedAt
                    };
                })
                .Where(r => r != null)
                .Select(r => r!)
                .ToList();
        }

        private async Task<List<AttendanceRecordDTO>> ApplyAttendanceCorrectionsAsync(
            List<AttendanceRecordDTO> records,
            DateOnly from,
            DateOnly to,
            string? epfNoFilter,
            IReadOnlySet<string>? allowedEpfs)
        {
            var query = _appCtx.AttendanceCorrections.AsNoTracking()
                .Join(
                    _appCtx.AttendanceCorrectionSessions.AsNoTracking(),
                    correction => correction.SessionId,
                    session => session.SessionId,
                    (correction, session) => new { correction, session })
                .Where(x =>
                    x.correction.IsActive &&
                    x.correction.Status == "Applied" &&
                    x.session.Status != "Cancelled" &&
                    x.correction.WorkDate >= from &&
                    x.correction.WorkDate <= to);

            if (!string.IsNullOrWhiteSpace(epfNoFilter))
            {
                var epfCandidates = GetEpfCandidates(epfNoFilter);
                query = query.Where(x => epfCandidates.Contains(x.correction.EpfNo));
            }

            if (allowedEpfs != null)
            {
                if (allowedEpfs.Count == 0)
                    return records;

                var allowedFilter = allowedEpfs
                    .Where(e => !string.IsNullOrWhiteSpace(e))
                    .Select(NormalizeEpf)
                    .ToArray();
                query = query.Where(x => allowedFilter.Contains(x.correction.EpfNo));
            }

            var corrections = await query
                .OrderBy(x => x.correction.WorkDate)
                .ThenBy(x => x.correction.EpfNo)
                .ThenBy(x => x.correction.CreatedAt)
                .ToListAsync();

            if (corrections.Count == 0)
                return records;

            var correctionEpfs = corrections
                .Select(x => x.correction.EpfNo)
                .Where(e => !string.IsNullOrWhiteSpace(e))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            var empMap = await GetEmployeeMapAsync(correctionEpfs);

            var byKey = records
                .Where(r => !string.IsNullOrWhiteSpace(r.EpfNo) && r.WorkDate.HasValue)
                .GroupBy(r => $"{NormalizeEpf(r.EpfNo)}|{r.WorkDate!.Value:yyyyMMdd}", StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            foreach (var item in corrections)
            {
                var correction = item.correction;
                var epf = NormalizeEpf(correction.EpfNo);
                var key = $"{epf}|{correction.WorkDate:yyyyMMdd}";

                if (!byKey.TryGetValue(key, out var record))
                {
                    empMap.TryGetValue(epf, out var emp);
                    if (emp == null)
                        continue;

                    record = new AttendanceRecordDTO
                    {
                        EmployeeId = emp.EmployeeId,
                        EpfNo = emp.EpfNo,
                        NameWithInitial = FirstNonBlank(correction.EmployeeName, emp.NameWithInitial),
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
                        WorkDate = correction.WorkDate,
                        ReceivedAt = correction.CreatedAt
                    };

                    records.Add(record);
                    byKey[key] = record;
                }

                record.IsCorrected = true;
                record.CorrectionId = correction.CorrectionId;
                record.CorrectionSessionId = correction.SessionId;
                record.OriginalCheckIn = FirstNonBlank(correction.OriginalCheckIn, record.OriginalCheckIn, record.CheckIn);
                record.OriginalCheckOut = FirstNonBlank(correction.OriginalCheckOut, record.OriginalCheckOut, record.CheckOut);
                if (!string.IsNullOrWhiteSpace(correction.CorrectedCheckIn))
                    record.CheckIn = NormalizeTimeText(correction.CorrectedCheckIn);
                if (!string.IsNullOrWhiteSpace(correction.CorrectedCheckOut))
                {
                    record.CheckOut = NormalizeTimeText(correction.CorrectedCheckOut);
                    record.CheckOutIsNextDay = IsAfterMidnightCarryoverMins(ParseMinutes(record.CheckOut));
                }
                record.CorrectionReason = correction.ReasonType;
                record.CorrectionLocation = correction.Location;
                record.CorrectionRemarks = correction.Remarks;
                record.ReceivedAt = correction.UpdatedAt ?? correction.CreatedAt;
            }

            return records
                .OrderByDescending(r => r.WorkDate)
                .ThenBy(r => NormalizeEpf(r.EpfNo))
                .ToList();
        }

        private static string? NormalizeTimeText(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var mins = ParseMinutes(value);
            return mins.HasValue ? FormatMinutes(mins.Value) : value.Trim();
        }

        private static string? FormatName(string? firstName, string? lastName)
        {
            var name = $"{firstName ?? ""} {lastName ?? ""}".Trim();
            return string.IsNullOrWhiteSpace(name) ? null : name;
        }

        private static string? FirstNonBlank(params string?[] values) =>
            values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v))?.Trim();

        private static List<PunchRecord> MergePunches(List<PunchRecord> punches) =>
            ExpandCarryoverPunches(punches)
                .GroupBy(p => new { EpfNo = NormalizeEpf(p.EpfNo), p.WorkDate })
                .Select(g =>
                {
                    var records = g.ToList();

                    // Business rule: 05:00-12:30 punches are arrivals; after 12:30 PM are departures.
                    // If the FP system only captured an afternoon punch (morning swipe missed), it records
                    // that departure time as FirstPunchTime — which must NOT be treated as a check-in.

                    if (records.Count == 1)
                    {
                        var s = records[0];
                        var inMins = ParseMinutes(s.CheckIn);

                        if (TryGetPromotedLastPunchCheckIn(s, out var promotedCheckIn, out _))
                            return new PunchRecord
                            {
                                EpfNo = g.Key.EpfNo,
                                WorkDate = g.Key.WorkDate,
                                CheckIn = promotedCheckIn,
                                CheckOut = null,
                                ReceivedAt = s.ReceivedAt
                            };

                        // Afternoon-only punch: morning arrival was not captured.
                        // Treat FirstPunchTime as a check-out, leave check-in as null.
                        if (inMins.HasValue && inMins.Value > HalfDayCutoffMinutes)
                            return new PunchRecord
                            {
                                EpfNo = g.Key.EpfNo,
                                WorkDate = g.Key.WorkDate,
                                CheckIn = null,
                                CheckOut = s.CheckIn,
                                ReceivedAt = s.ReceivedAt
                            };

                        if (!IsValidCheckInMins(inMins))
                        {
                            var carryoverOutNorm = NormalizeCheckOutMins(s.CheckOut, null, s.CheckOutIsNextDay);
                            return new PunchRecord
                            {
                                EpfNo = g.Key.EpfNo,
                                WorkDate = g.Key.WorkDate,
                                CheckIn = null,
                                CheckOut = carryoverOutNorm.HasValue && carryoverOutNorm.Value >= HalfDayCutoffMinutes ? s.CheckOut : null,
                                CheckOutIsNextDay = s.CheckOutIsNextDay,
                                ReceivedAt = s.ReceivedAt
                            };
                        }

                        var outNorm = NormalizeCheckOutMins(s.CheckOut, inMins, s.CheckOutIsNextDay);
                        var gap = inMins.HasValue && outNorm.HasValue ? outNorm.Value - inMins.Value : 0;
                        var validCheckOut = outNorm.HasValue &&
                            (outNorm.Value >= HalfDayCutoffMinutes || gap >= MinimumPreNoonCheckoutGapMinutes);
                        return new PunchRecord
                        {
                            EpfNo = g.Key.EpfNo,
                            WorkDate = g.Key.WorkDate,
                            CheckIn = s.CheckIn,
                            CheckOut = validCheckOut && gap >= MinimumCheckoutGapMinutes ? s.CheckOut : null,
                            CheckOutIsNextDay = validCheckOut && gap >= MinimumCheckoutGapMinutes && s.CheckOutIsNextDay,
                            ReceivedAt = s.ReceivedAt
                        };
                    }

                    // Multiple records: only 05:00-12:30 punches are arrivals.
                    // Afternoon FirstPunchTime values are treated as departure candidates.
                    var checkIns = records
                        .SelectMany(GetCheckInCandidates)
                        .OrderBy(t => t.Minutes!.Value)
                        .ToList();

                    var checkIn = checkIns.Count > 0 ? checkIns.First().Original : null;
                    var checkInMins = checkIns.Count > 0 ? checkIns.First().Minutes : null;

                    // Checkout candidates: LastPunchTimes (normalized) + any post-cutoff FirstPunchTimes.
                    // Morning LastPunchTime values are ignored so a second morning scan is not shown as checkout.
                    var checkOuts = records
                        .Where(p => !string.IsNullOrWhiteSpace(p.CheckOut))
                        .Select(p => (Original: p.CheckOut!, Minutes: NormalizeCheckOutMins(p.CheckOut, checkInMins, p.CheckOutIsNextDay), p.CheckOutIsNextDay))
                        .Concat(
                            records
                                .Where(p => !ShouldPromoteLastPunchToCheckIn(p))
                                .Where(p => !string.IsNullOrWhiteSpace(p.CheckIn))
                                .Select(p => (Original: p.CheckIn!, Minutes: ParseMinutes(p.CheckIn)))
                                .Where(t => t.Minutes.HasValue && t.Minutes.Value > HalfDayCutoffMinutes)
                                .Select(t => (t.Original, Minutes: (int?)t.Minutes!.Value, CheckOutIsNextDay: false))
                        )
                        .Where(t => t.Minutes.HasValue && (
                            t.Minutes.Value >= HalfDayCutoffMinutes ||
                            (checkInMins.HasValue && t.Minutes.Value - checkInMins.Value >= MinimumPreNoonCheckoutGapMinutes)))
                        .ToList();

                    string? checkOut = null;
                    var checkOutIsNextDay = false;
                    if (checkOuts.Count > 0)
                    {
                        var regularCheckOuts = checkOuts
                            .Where(t => t.Minutes!.Value < NightCheckoutFallbackMinutes)
                            .OrderByDescending(t => t.Minutes!.Value)
                            .ToList();
                        var nightCheckOuts = checkOuts
                            .Where(t => t.Minutes!.Value >= NightCheckoutFallbackMinutes)
                            .OrderByDescending(t => t.Minutes!.Value)
                            .ToList();
                        var selectedCheckOut = regularCheckOuts.Count > 0
                            ? regularCheckOuts[0]
                            : nightCheckOuts[0];

                        if (checkInMins.HasValue)
                        {
                            var gap = selectedCheckOut.Minutes!.Value - checkInMins.Value;
                            if (gap < 0) gap += 24 * 60;
                            if (gap >= MinimumCheckoutGapMinutes)
                            {
                                checkOut = selectedCheckOut.Original;
                                checkOutIsNextDay = selectedCheckOut.CheckOutIsNextDay;
                            }
                        }
                        else
                        {
                            // No morning check-in recorded: latest afternoon punch is a standalone departure
                            checkOut = selectedCheckOut.Original;
                            checkOutIsNextDay = selectedCheckOut.CheckOutIsNextDay;
                        }
                    }

                    return new PunchRecord
                    {
                        EpfNo = g.Key.EpfNo,
                        WorkDate = g.Key.WorkDate,
                        CheckIn = checkIn,
                        CheckOut = checkOut,
                        CheckOutIsNextDay = checkOutIsNextDay,
                        ReceivedAt = g.Max(p => p.ReceivedAt)
                    };
                })
                .ToList();

        private static IEnumerable<PunchRecord> ExpandCarryoverPunches(IEnumerable<PunchRecord> punches)
        {
            foreach (var punch in punches)
            {
                if (!punch.WorkDate.HasValue)
                {
                    yield return punch;
                    continue;
                }

                var firstMins = ParseMinutes(punch.CheckIn);
                var lastMins = ParseMinutes(punch.CheckOut);
                var firstIsAfterMidnightOut = IsAfterMidnightCarryoverMins(firstMins);
                var firstIsNightOutWithMorningIn = IsNightCheckoutMins(firstMins) && IsValidCheckInMins(lastMins);

                if (!firstIsAfterMidnightOut && !firstIsNightOutWithMorningIn)
                {
                    yield return punch;
                    continue;
                }

                var currentDate = punch.WorkDate.Value;
                var previousDate = currentDate.AddDays(-1);
                var previousOut = punch.CheckIn;
                var previousOutIsNextDay = firstIsAfterMidnightOut;

                if (firstIsAfterMidnightOut && IsAfterMidnightCarryoverMins(lastMins) && !string.IsNullOrWhiteSpace(punch.CheckOut))
                    previousOut = punch.CheckOut;

                if (!string.IsNullOrWhiteSpace(previousOut))
                    yield return new PunchRecord
                    {
                        EpfNo = punch.EpfNo,
                        WorkDate = previousDate,
                        CheckOut = previousOut,
                        CheckOutIsNextDay = previousOutIsNextDay,
                        ReceivedAt = punch.ReceivedAt,
                        FallbackName = punch.FallbackName
                    };

                if (string.IsNullOrWhiteSpace(punch.CheckOut) || IsAfterMidnightCarryoverMins(lastMins))
                    continue;

                if (IsValidCheckInMins(lastMins))
                {
                    yield return new PunchRecord
                    {
                        EpfNo = punch.EpfNo,
                        WorkDate = currentDate,
                        CheckIn = punch.CheckOut,
                        ReceivedAt = punch.ReceivedAt,
                        FallbackName = punch.FallbackName
                    };
                }
                else
                {
                    yield return new PunchRecord
                    {
                        EpfNo = punch.EpfNo,
                        WorkDate = currentDate,
                        CheckOut = punch.CheckOut,
                        ReceivedAt = punch.ReceivedAt,
                        FallbackName = punch.FallbackName
                    };
                }
            }
        }

        private static IEnumerable<(string Original, int? Minutes)> GetCheckInCandidates(PunchRecord punch)
        {
            var firstMins = ParseMinutes(punch.CheckIn);
            if (IsValidCheckInMins(firstMins) && !string.IsNullOrWhiteSpace(punch.CheckIn))
                yield return (punch.CheckIn!, firstMins);

            if (TryGetPromotedLastPunchCheckIn(punch, out var promotedCheckIn, out var promotedMins))
                yield return (promotedCheckIn, promotedMins);
        }

        private static bool TryGetPromotedLastPunchCheckIn(PunchRecord punch, out string checkIn, out int? checkInMins)
        {
            checkIn = "";
            checkInMins = null;

            if (!ShouldPromoteLastPunchToCheckIn(punch) || string.IsNullOrWhiteSpace(punch.CheckOut))
                return false;

            checkIn = punch.CheckOut!;
            checkInMins = ParseMinutes(punch.CheckOut);
            return true;
        }

        private static bool ShouldPromoteLastPunchToCheckIn(PunchRecord punch)
        {
            var firstMins = ParseMinutes(punch.CheckIn);
            var lastMins = ParseMinutes(punch.CheckOut);
            return !IsValidCheckInMins(firstMins) && IsValidCheckInMins(lastMins);
        }

        private static bool IsValidCheckInMins(int? mins) =>
            mins.HasValue && mins.Value >= EarliestValidCheckInMinutes && mins.Value <= HalfDayCutoffMinutes;

        private static bool IsAfterMidnightCarryoverMins(int? mins) =>
            mins.HasValue && mins.Value < EarliestValidCheckInMinutes;

        private static bool IsNightCheckoutMins(int? mins) =>
            mins.HasValue && mins.Value >= NightCheckoutFallbackMinutes;

        // Pads numeric EPF numbers to 6 digits so AttendanceERP and CECB_ERP EPFs compare consistently.
        private static string NormalizeEpf(string? epf)
        {
            if (string.IsNullOrWhiteSpace(epf)) return epf ?? "";
            var trimmed = epf.Trim();
            return int.TryParse(trimmed, out _) ? trimmed.PadLeft(6, '0') : trimmed;
        }

        private static string[] GetEpfCandidates(string? epf)
        {
            if (string.IsNullOrWhiteSpace(epf)) return [];
            var trimmed = epf.Trim();
            var normalized = NormalizeEpf(trimmed);
            var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { trimmed, normalized };
            if (int.TryParse(normalized, out var numeric))
                candidates.Add(numeric.ToString());
            return candidates.ToArray();
        }

        private static string[] GetAllowedEpfCandidates(IReadOnlySet<string>? allowedEpfs)
        {
            if (allowedEpfs == null || allowedEpfs.Count == 0) return [];

            return allowedEpfs
                .Where(e => !string.IsNullOrWhiteSpace(e))
                .SelectMany(GetEpfCandidates)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        private static List<AttendanceEmployeeDTO> FilterEmployeesByAllowedEpfs(
            List<AttendanceEmployeeDTO> employees,
            IReadOnlySet<string>? allowedEpfs)
        {
            if (allowedEpfs == null)
                return employees;
            if (allowedEpfs.Count == 0)
                return [];

            return employees
                .Where(e => !string.IsNullOrWhiteSpace(e.EpfNo) && allowedEpfs.Contains(NormalizeEpf(e.EpfNo)))
                .ToList();
        }

        private static List<DailyAttendanceCountDTO> EmptyDailyCounts(
            int days,
            DateOnly from,
            Dictionary<DateOnly, AttendanceSourceStatusDTO> sourceStatusMap) =>
            Enumerable.Range(0, days)
                .Select(i => from.AddDays(i))
                .Select(d =>
                {
                    var sourceStatus = sourceStatusMap[d];
                    return new DailyAttendanceCountDTO
                    {
                        Date = d,
                        Count = 0,
                        IsSynced = sourceStatus.IsSynced,
                        IsWorkingDay = sourceStatus.IsWorkingDay
                    };
                })
                .ToList();

        private static List<AttendanceArrivalStatusCountDTO> EmptyArrivalStatusCounts() =>
            ArrivalStatusDefinitions
                .Select(s => new AttendanceArrivalStatusCountDTO
                {
                    Key = s.Key,
                    Label = s.Label,
                    Count = 0
                })
                .ToList();

        private static int? ParseMinutes(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var v = value.Trim().ToUpperInvariant();
            var isPm = v.EndsWith("PM");
            var isAm = v.EndsWith("AM");
            var core = (isPm || isAm) ? v[..^2].Trim() : v;
            var parts = core.Split(new[] { ':', '.' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2 || !int.TryParse(parts[0], out var h) || !int.TryParse(parts[1], out var m) || m > 59) return null;
            if (isPm && h < 12) h += 12;
            else if (isAm && h == 12) h = 0;
            if (h > 23) return null;
            return h * 60 + m;
        }

        private string GetArrivalBandKey(string? checkIn, string? checkOut, bool checkOutIsNextDay, AttendanceEmployeeDTO emp)
        {
            var mins = ParseMinutes(checkIn);
            if (!mins.HasValue)
                return NormalizeCheckOutMins(checkOut, null, checkOutIsNextDay).HasValue ? "missingIn" : "noCheckIn";

            var rules = _rules ?? new DB.Models.AttendanceRuleSetting();
            var start = ResolveMinutes(emp.InHour, emp.InMinute, ResolveDefaultStartMinutes(rules));
            var end = ResolveMinutes(emp.OutHour, emp.OutMinute, ResolveDefaultEndMinutes(rules));
            var arrivalDelay = mins.Value - start;
            var checkOutMins = NormalizeCheckOutMins(checkOut, mins, checkOutIsNextDay);
            var earlyDeparture = checkOutMins.HasValue ? end - checkOutMins.Value : 0;
            var delay = Math.Max(arrivalDelay, earlyDeparture);
            var thresholds = ResolveDelayThresholds(rules);
            if (delay <= 0) return "onTime";
            if (delay <= thresholds.Late) return "late";
            if (delay <= thresholds.HalfShortLeave) return "halfShortLeave";
            if (delay <= thresholds.ShortLeave) return "shortLeave";
            return mins.Value <= HalfDayCutoffMinutes ? "halfDay" : "noCheckIn";
        }

        private class PunchRecord
        {
            public string? EpfNo { get; set; }
            public DateOnly? WorkDate { get; set; }
            public string? CheckIn { get; set; }
            public string? CheckOut { get; set; }
            public bool CheckOutIsNextDay { get; set; }
            public DateTime? ReceivedAt { get; set; }
            public string? FallbackName { get; set; }
        }
    }
}
