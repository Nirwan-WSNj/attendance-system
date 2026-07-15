import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
    BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
    PieChart, Pie, Cell, ResponsiveContainer
} from "recharts";
import { attendanceApi, reportApi } from "../config/apiClient";
import { getAuthCacheScope } from "../config/authService";

const parseMinutes = (timeStr) => {
    if (!timeStr) return null;
    const s = String(timeStr).trim().toUpperCase();
    const isPm = s.endsWith("PM");
    const isAm = s.endsWith("AM");
    const core = (isPm || isAm) ? s.slice(0, -2).trim() : s;
    const parts = core.split(/[:.]/);
    if (parts.length < 2) return null;
    let h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m) || m > 59) return null;
    if (isPm && h < 12) h += 12;
    if (isAm && h === 12) h = 0;
    if (h > 23) return null;
    return h * 60 + m;
};

const HALF_DAY_CUTOFF = 12 * 60 + 30;
const EARLIEST_VALID_CHECK_IN = 5 * 60;
const MIN_PRE_NOON_CHECKOUT_GAP_MINS = 120;

const STATUS_COLORS = {
    onTime: "#10B981",
    late: "#F59E0B",
    halfShortLeave: "#F97316",
    shortLeave: "#EF4444",
    halfDay: "#BE123C",
    missingIn: "#D97706",
    noCheckIn: "#64748B"
};

const STATUS_LABELS = {
    onTime: "On Time",
    late: "Late",
    halfShortLeave: "Half Short Leave",
    shortLeave: "Short Leave",
    halfDay: "Half Day",
    missingIn: "Missing In",
    noCheckIn: "No Valid Check In"
};

const PERIOD_OPTIONS = [
    { label: "14 Days", days: 14 },
    { label: "30 Days", days: 30 },
    { label: "90 Days", days: 90 }
];

function KpiCard({ label, value, icon, color, subtitle }) {
    return (
        <div className={`bg-white rounded-xl shadow p-5 border-l-4 ${color}`}>
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
                    <p className="text-3xl font-bold text-gray-800 mt-1">{value ?? 0}</p>
                    {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
                </div>
                <span className="text-3xl opacity-80">{icon}</span>
            </div>
        </div>
    );
}

const PAGE_SIZE = 25;
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;
const DASHBOARD_CACHE_KEY = "attendance-dashboard-cache-v2";

const dashboardCacheKey = (authScope) => `${DASHBOARD_CACHE_KEY}:${authScope}`;

const readCacheValue = (key) => {
    try {
        const value = sessionStorage.getItem(key);
        if (value != null) return value;
    } catch {
        // Fall back to localStorage when sessionStorage is unavailable.
    }
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

const writeCacheValue = (key, value) => {
    try {
        sessionStorage.setItem(key, value);
        return;
    } catch {
        // Fall back to localStorage when sessionStorage is unavailable.
    }
    try {
        localStorage.setItem(key, value);
    } catch {
        // Browser storage can be unavailable in private/incognito modes.
    }
};

const getDisplayName = (r) =>
    r.nameWithInitial || `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Unknown Employee";

const formatDateLabel = (date) => {
    if (!date) return "";
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-LK", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });
};

const reclassifyTimes = (r) => {
    const candidates = [r.checkIn, r.checkOut]
        .filter(Boolean)
        .map(t => ({ original: t, mins: parseMinutes(t) }))
        .filter(c => c.mins != null)
        .sort((a, b) => a.mins - b.mins);

    if (candidates.length === 0) return { ...r, checkIn: null, checkOut: null };

    const first = candidates[0];
    const last = candidates[candidates.length - 1];

    if (first.mins < EARLIEST_VALID_CHECK_IN) {
        const currentDayCheckIn = candidates.find(c => c.mins >= EARLIEST_VALID_CHECK_IN && c.mins <= HALF_DAY_CUTOFF);
        if (currentDayCheckIn) return { ...r, checkIn: currentDayCheckIn.original, checkOut: null };

        const standaloneCheckOut = [...candidates].reverse().find(c => c.mins > HALF_DAY_CUTOFF) ?? first;
        return { ...r, checkIn: null, checkOut: standaloneCheckOut.original };
    }

    if (candidates.length === 1) {
        if (!r.checkIn && r.checkOut) return { ...r, checkIn: null, checkOut: first.original };

        return first.mins <= HALF_DAY_CUTOFF
            ? { ...r, checkIn: first.original, checkOut: null }
            : { ...r, checkIn: null, checkOut: first.original };
    }

    if (first.mins <= HALF_DAY_CUTOFF) {
        const isCheckoutValid = last.mins > HALF_DAY_CUTOFF || (last.mins - first.mins) >= MIN_PRE_NOON_CHECKOUT_GAP_MINS;
        return { ...r, checkIn: first.original, checkOut: isCheckoutValid ? last.original : null };
    }

    return { ...r, checkIn: null, checkOut: last.original };
};

const readDashboardCache = (key, date, period) => {
    try {
        const cached = JSON.parse(readCacheValue(key) || "null");
        if (!cached || cached.date !== date || cached.period !== period) return null;
        if (Date.now() - cached.cachedAt > DASHBOARD_CACHE_TTL_MS) return null;
        return cached;
    } catch {
        return null;
    }
};

const writeDashboardCache = (key, payload) => {
    writeCacheValue(key, JSON.stringify({
        ...payload,
        cachedAt: Date.now()
    }));
};

export default function Dashboard() {
    const [todayData, setTodayData] = useState([]);
    const [dailyCount, setDailyCount] = useState([]);
    const [arrivalStatus, setArrivalStatus] = useState([]);
    const [totalRegistered, setTotalRegistered] = useState(0);
    const [period, setPeriod] = useState(14);
    const [loading, setLoading] = useState(true);
    const [secondaryLoading, setSecondaryLoading] = useState(true);
    const [error, setError] = useState("");
    const [page, setPage] = useState(1);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [filterText, setFilterText] = useState("");
    const [filterAGM,  setFilterAGM]  = useState("");
    const [filterDGM,  setFilterDGM]  = useState("");
    const [sortCol, setSortCol] = useState("checkIn");
    const [sortDir, setSortDir] = useState("asc");
    const [attendanceDate, setAttendanceDate] = useState(null);
    const [sourceStatus, setSourceStatus] = useState(null);

    const todayIso = new Date().toISOString().slice(0, 10);
    const today = formatDateLabel(todayIso);
    const attendanceDateLabel = formatDateLabel(attendanceDate);
    const isSourceSynced = sourceStatus?.isSynced !== false;

    const load = useCallback(async () => {
        const cacheKey = dashboardCacheKey(getAuthCacheScope());
        const cached = readDashboardCache(cacheKey, todayIso, period);
        if (cached) {
            setAttendanceDate(todayIso);
            setTodayData(Array.isArray(cached.todayData) ? cached.todayData : []);
            setDailyCount(Array.isArray(cached.dailyCount) ? cached.dailyCount : []);
            setArrivalStatus(Array.isArray(cached.arrivalStatus) ? cached.arrivalStatus : []);
            setTotalRegistered(cached.totalRegistered ?? 0);
            setSourceStatus(cached.sourceStatus ?? null);
            setLastUpdated(new Date(cached.cachedAt));
            setLoading(false);
        } else {
            setLoading(true);
        }
        setSecondaryLoading(true);
        setError("");
        try {
            const sourceStatusPromise = attendanceApi.getSourceStatus(todayIso).catch(() => null);
            const secondaryPromise = Promise.allSettled([
                attendanceApi.getDailyCount(period),
                attendanceApi.getArrivalStatus(period),
                reportApi.getDailySummary(todayIso, todayIso)
            ]);

            const tod = await attendanceApi.getToday();
            const activeRows = Array.isArray(tod) ? tod.map(reclassifyTimes) : [];

            setAttendanceDate(todayIso);
            setTodayData(activeRows);
            setPage(1);
            setLoading(false);
            setLastUpdated(new Date());

            sourceStatusPromise.then(status => {
                if (status) setSourceStatus(status);
            });

            const [dailyResult, arrivalResult, summaryResult] = await secondaryPromise;
            const daily = dailyResult.status === "fulfilled" ? dailyResult.value : [];
            const arrival = arrivalResult.status === "fulfilled" ? arrivalResult.value : [];
            const summary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
            const activeSummary = Array.isArray(summary) ? summary[0] : null;
            const dailyRows = Array.isArray(daily) ? daily.map(d => ({
                date: typeof d.date === "string" ? d.date : String(d.date),
                count: d.count ?? d.presentCount ?? 0,
                isSynced: d.isSynced !== false,
                isWorkingDay: d.isWorkingDay !== false
            })) : [];

            setDailyCount(dailyRows);
            setArrivalStatus(Array.isArray(arrival) ? arrival : []);
            setTotalRegistered(activeSummary?.totalRegistered ?? 0);
            const fallbackSourceStatus = activeSummary ? {
                isSynced: activeSummary.isSynced !== false,
                message: activeSummary.sourceStatus === "NotSynced"
                    ? "No AttendanceERP punch data was found for this working date."
                    : ""
            } : null;
            setSourceStatus(current => current ?? fallbackSourceStatus);
            writeDashboardCache(cacheKey, {
                date: todayIso,
                period,
                todayData: activeRows,
                dailyCount: dailyRows,
                arrivalStatus: Array.isArray(arrival) ? arrival : [],
                totalRegistered: activeSummary?.totalRegistered ?? 0,
                sourceStatus: fallbackSourceStatus
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
            setSecondaryLoading(false);
        }
    }, [period, todayIso]);

    useEffect(() => {
        load();
        const timer = setInterval(load, AUTO_REFRESH_MS);
        return () => clearInterval(timer);
    }, [load]);

    const presentCount = isSourceSynced ? todayData.length : 0;
    const checkedOut = isSourceSynced ? todayData.filter(r => !!r.checkOut).length : 0;
    const notCheckedOut = presentCount - checkedOut;
    // Absent is only meaningful after 12:00 PM — before that employees may still arrive
    const isAfterNoon = new Date().getHours() >= 12;
    const absentCount = !isSourceSynced
        ? "Not synced"
        : isAfterNoon && totalRegistered > 0
            ? Math.max(0, totalRegistered - presentCount)
            : 0;

    // schedStart: require BOTH inHour and inMinute — matches backend GetArrivalBandKey exactly.
    // If either is null (no schedule), fall back to 8:30 AM default (same as StandardStartMinutes).
    const schedStartMins = (r) =>
        (r.inHour != null && r.inMinute != null) ? r.inHour * 60 + r.inMinute : 8 * 60 + 30;
    const schedEndMins = (r) =>
        (r.outHour != null && r.outMinute != null) ? r.outHour * 60 + r.outMinute : 16 * 60 + 15;
    const attendanceVariance = (r, inMins) => {
        const arrivalDelay = inMins - schedStartMins(r);
        const outMins = parseMinutes(r.checkOut);
        const earlyDeparture = outMins == null ? 0 : schedEndMins(r) - outMins;
        return Math.max(arrivalDelay, earlyDeparture);
    };

    const isFullDayLeaveRecord = (r) => {
        const inMins = parseMinutes(r.checkIn);
        if (inMins != null) return inMins > HALF_DAY_CUTOFF;
        const outMins = parseMinutes(r.checkOut);
        return outMins != null && outMins > HALF_DAY_CUTOFF;
    };

    // Compute today's arrival status breakdown from live data
    const statusCounts = todayData.reduce((acc, r) => {
        const inMins = parseMinutes(r.checkIn);
        if (inMins == null) {
            if (parseMinutes(r.checkOut) != null) acc.missingIn++;
            else if (isFullDayLeaveRecord(r)) acc.fullDayLeave++;
            else acc.noCheckIn++;
            return acc;
        }
        const delay = attendanceVariance(r, inMins);
        if (delay <= 0)       acc.onTime++;
        else if (delay <= 30) acc.late++;
        else if (delay <= 45) acc.halfShortLeave++;
        else if (delay <= 90) acc.shortLeave++;
        else if (inMins <= HALF_DAY_CUTOFF) acc.halfDay++;
        else acc.fullDayLeave++;
        return acc;
    }, { onTime: 0, late: 0, halfShortLeave: 0, shortLeave: 0, halfDay: 0, missingIn: 0, fullDayLeave: 0, noCheckIn: 0 });

    const getRowStatus = (r) => {
        const inMins = parseMinutes(r.checkIn);
        if (inMins == null) {
            if (parseMinutes(r.checkOut) != null) {
                return { label: "Missing In", cls: "bg-amber-100 text-amber-700" };
            }

            return isFullDayLeaveRecord(r)
                ? { label: "Full Day Leave", cls: "bg-slate-100 text-slate-700" }
                : { label: "No Valid Check In", cls: "bg-gray-100 text-gray-500" };
        }
        const d = attendanceVariance(r, inMins);
        if (d <= 0)  return { label: "On Time",          cls: "bg-green-100 text-green-700"  };
        if (d <= 30) return { label: "Late",              cls: "bg-yellow-100 text-yellow-700" };
        if (d <= 45) return { label: "Half Short Leave",  cls: "bg-orange-100 text-orange-700" };
        if (d <= 90) return { label: "Short Leave",       cls: "bg-red-100 text-red-600"      };
        return inMins <= HALF_DAY_CUTOFF
            ? { label: "Half Day",        cls: "bg-rose-100 text-rose-700"    }
            : { label: "Full Day Leave", cls: "bg-slate-100 text-slate-700"  };
    };

    const agmOptions = useMemo(() =>
        [...new Set(todayData.map(r => r.agmWorkSpaceName).filter(Boolean))].sort(),
        [todayData]);

    const agmRecords = useMemo(() =>
        todayData.filter(r => !filterAGM || r.agmWorkSpaceName === filterAGM),
        [todayData, filterAGM]);

    const dgmOptions = useMemo(() =>
        [...new Set(agmRecords.map(r => r.dgmWorkSpaceName).filter(Boolean))]
            .sort()
            .map(name => ({ name, count: agmRecords.filter(r => r.dgmWorkSpaceName === name).length })),
        [agmRecords]);

    const directUnderAgmCount = useMemo(() =>
        agmRecords.filter(r => !r.dgmWorkSpaceName).length,
        [agmRecords]);

    const tableData = useMemo(() => {
        const text = filterText.toLowerCase();
        const statusOrder = { "On Time": 0, "Late": 1, "Half Short Leave": 2, "Short Leave": 3, "Half Day": 4, "Missing In": 5, "Full Day Leave": 6, "No Valid Check In": 7 };
        return todayData
            .filter(r => {
                if (text) {
                    if (!getDisplayName(r).toLowerCase().includes(text) &&
                        !(r.epfNo ?? "").toLowerCase().includes(text)) return false;
                }
                if (filterAGM && r.agmWorkSpaceName !== filterAGM) return false;
                if (filterDGM === "__DIRECT__") { if (r.dgmWorkSpaceName) return false; }
                else if (filterDGM && r.dgmWorkSpaceName !== filterDGM) return false;
                return true;
            })
            .sort((a, b) => {
                let av, bv;
                if      (sortCol === "epfNo")   { av = a.epfNo ?? ""; bv = b.epfNo ?? ""; }
                else if (sortCol === "name")    { av = getDisplayName(a); bv = getDisplayName(b); }
                else if (sortCol === "checkIn") { av = parseMinutes(a.checkIn) ?? 9999; bv = parseMinutes(b.checkIn) ?? 9999; }
                else if (sortCol === "status")  { av = statusOrder[getRowStatus(a).label] ?? 9; bv = statusOrder[getRowStatus(b).label] ?? 9; }
                else { return 0; }
                if (av < bv) return sortDir === "asc" ? -1 : 1;
                if (av > bv) return sortDir === "asc" ?  1 : -1;
                return 0;
            });
    }, [todayData, filterText, filterAGM, filterDGM, sortCol, sortDir]); // eslint-disable-line

    useEffect(() => { setPage(1); }, [filterText, filterAGM, filterDGM, sortCol]);

    const toggleSort = (col) => {
        if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortCol(col); setSortDir("asc"); }
    };

    const SortTh = ({ col, label }) => (
        <th onClick={() => toggleSort(col)}
            className="px-4 py-3 text-left cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap">
            {label}{" "}
            <span className="text-gray-400">{sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
        </th>
    );

    const pieData = arrivalStatus
        .filter(s => s.count > 0)
        .map(s => ({
            name: STATUS_LABELS[s.key] ?? s.label ?? s.key,
            value: s.count,
            color: STATUS_COLORS[s.key] ?? "#94A3B8"
        }));

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Attendance Dashboard</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {today}{!isSourceSynced ? " - AttendanceERP not synced" : ""}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {lastUpdated && (
                        <span className="text-xs text-gray-400">
                            Last updated {lastUpdated.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" })}
                            &nbsp;· auto-refreshes every 5 min
                        </span>
                    )}
                    <button
                        onClick={load}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                    >
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
                    ⚠️ {error}
                </div>
            )}

            {!loading && !error && !isSourceSynced && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                    {sourceStatus?.message || "No AttendanceERP punch data was found for this working date."}
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Present Today"        value={loading ? "…" : presentCount}  icon="✅" color="border-green-500" />
                <KpiCard label="Checked Out"          value={loading ? "…" : checkedOut}    icon="🚪" color="border-blue-500" />
                <KpiCard label="Not Yet Checked Out"  value={loading ? "…" : notCheckedOut} icon="🏢" color="border-orange-400" />
                <KpiCard
                    label="Absent Today"
                    value={loading || secondaryLoading ? "…" : absentCount}
                    icon="🔴"
                    color="border-red-500"
                    subtitle={!isAfterNoon ? "Marked after 12:00 PM" : totalRegistered > 0 ? `of ${totalRegistered} registered` : ""}
                />
            </div>

            {/* Arrival Status Breakdown */}
            {!loading && isSourceSynced && presentCount > 0 && (
                <div className="bg-white rounded-xl shadow p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Arrival Time Status — Today</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 text-center">
                        {[
                            { label: "On Time",         value: statusCounts.onTime,         bg: "bg-green-50",  text: "text-green-700"  },
                            { label: "Late",            value: statusCounts.late,            bg: "bg-yellow-50", text: "text-yellow-700" },
                            { label: "Half Short Leave",value: statusCounts.halfShortLeave,  bg: "bg-orange-50", text: "text-orange-700" },
                            { label: "Short Leave",     value: statusCounts.shortLeave,      bg: "bg-red-50",    text: "text-red-600"   },
                            { label: "Half Day",        value: statusCounts.halfDay,         bg: "bg-rose-50",   text: "text-rose-700"  },
                            { label: "Missing In",      value: statusCounts.missingIn,       bg: "bg-amber-50",  text: "text-amber-700" },
                            { label: "Full Day Leave",  value: statusCounts.fullDayLeave,    bg: "bg-slate-50",  text: "text-slate-700" },
                            { label: "No Valid Check In", value: statusCounts.noCheckIn,     bg: "bg-gray-50",   text: "text-gray-500"  },
                        ].map(s => (
                            <div key={s.label} className={`${s.bg} rounded-lg py-3 px-2`}>
                                <p className={`text-2xl font-bold ${s.text}`}>{s.value}</p>
                                <p className="text-xs text-gray-500 mt-0.5 leading-tight">{s.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Period selector */}
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600">Period:</span>
                {PERIOD_OPTIONS.map(o => (
                    <button
                        key={o.days}
                        onClick={() => setPeriod(o.days)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                            period === o.days
                                ? "bg-blue-600 text-white"
                                : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                    >
                        {o.label}
                    </button>
                ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Daily attendance bar chart */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow p-5">
                    <h2 className="text-base font-semibold text-gray-700 mb-4">Daily Attendance Count</h2>
                    {secondaryLoading ? (
                        <div className="h-48 flex items-center justify-center text-gray-400">Loading…</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={dailyCount} margin={{ top: 5, right: 10, left: -10, bottom: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10 }}
                                    angle={-40}
                                    textAnchor="end"
                                    interval={Math.max(0, Math.floor(dailyCount.length / 7) - 1)}
                                />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Present" />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Arrival status pie */}
                <div className="bg-white rounded-xl shadow p-5">
                    <h2 className="text-base font-semibold text-gray-700 mb-3">Arrival Status</h2>
                    {secondaryLoading || !pieData.length ? (
                        <div className="h-48 flex items-center justify-center text-gray-400">
                            {secondaryLoading ? "Loading…" : "No data"}
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={270}>
                            <PieChart margin={{ top: 20, right: 10, bottom: 10, left: 10 }}>
                                <Pie data={pieData} cx="50%" cy="48%" outerRadius={65} dataKey="value" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                                    {pieData.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v, n) => [v, n]} />
                                <Legend iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 16 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Today's table */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-base font-semibold text-gray-700">
                            {!isSourceSynced ? "Today's Attendance Source" : "Today's Present Employees"}
                        </h2>
                        <span className="text-sm text-gray-400">
                            {!isSourceSynced
                                ? "Not synced"
                                : tableData.length !== presentCount
                                ? `${tableData.length} of ${presentCount} records`
                                : `${presentCount} records`}
                        </span>
                    </div>
                    {/* Filters */}
                    <div className="flex flex-wrap gap-2">
                        <input
                            type="text"
                            placeholder="Search EPF or name…"
                            value={filterText}
                            onChange={e => setFilterText(e.target.value)}
                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <select
                            value={filterAGM}
                            onChange={e => { setFilterAGM(e.target.value); setFilterDGM(""); }}
                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        >
                            <option value="">All AGM Units</option>
                            {agmOptions.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <select
                            value={filterDGM}
                            onChange={e => setFilterDGM(e.target.value)}
                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        >
                            <option value="">All DGM Units</option>
                            {directUnderAgmCount > 0 && (
                                <option value="__DIRECT__">Direct under AGM ({directUnderAgmCount})</option>
                            )}
                            {dgmOptions.map(d => <option key={d.name} value={d.name}>{d.name} ({d.count})</option>)}
                        </select>
                        {(filterText || filterAGM || filterDGM) && (
                            <button
                                onClick={() => { setFilterText(""); setFilterAGM(""); setFilterDGM(""); }}
                                className="px-3 py-1.5 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
                            >
                                ✕ Clear
                            </button>
                        )}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                                <SortTh col="epfNo"   label="EPF No"   />
                                <SortTh col="name"    label="Name"     />
                                <SortTh col="checkIn" label="Check In" />
                                <th className="px-4 py-3 text-left">Check Out</th>
                                <SortTh col="status"  label="Status"   />
                                <th className="px-4 py-3 text-left">AGM Unit</th>
                                <th className="px-4 py-3 text-left">DGM / Unit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
                            ) : !isSourceSynced ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-amber-600">AttendanceERP not synced for {attendanceDateLabel || today}</td></tr>
                            ) : tableData.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No records found</td></tr>
                            ) : tableData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r, i) => {
                                const st = getRowStatus(r);
                                const inMins = parseMinutes(r.checkIn);
                                const schedStart = r.inHour != null ? r.inHour * 60 + (r.inMinute ?? 0) : 8 * 60 + 30;
                                const isLate = inMins != null && inMins > schedStart;
                                return (
                                    <tr key={i} className="hover:bg-gray-50">
                                        <td className="px-4 py-2.5 font-mono text-gray-600">{r.epfNo ?? ""}</td>
                                        <td className="px-4 py-2.5 text-gray-800">{getDisplayName(r)}</td>
                                        <td className="px-4 py-2.5">
                                            <span className={`font-medium ${isLate ? "text-yellow-600" : "text-green-600"}`}>
                                                {r.checkIn ?? ""}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-gray-600">{r.checkOut ?? ""}</td>
                                        <td className="px-4 py-2.5">
                                            <span className={`px-2 py-0.5 rounded-full text-xs ${st.cls}`}>{st.label}</span>
                                        </td>
                                        <td className="px-4 py-2.5 text-gray-500 text-xs">{r.agmWorkSpaceName ?? ""}</td>
                                        <td className="px-4 py-2.5 text-gray-500 text-xs">{r.dgmWorkSpaceName ?? r.serviceUnitName ?? ""}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {/* Pagination */}
                {tableData.length > PAGE_SIZE && (
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                        <span>
                            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, tableData.length)} of {tableData.length}
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                ‹ Prev
                            </button>
                            <span className="px-3 py-1 font-medium text-gray-700">
                                {page} / {Math.ceil(tableData.length / PAGE_SIZE)}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(Math.ceil(tableData.length / PAGE_SIZE), p + 1))}
                                disabled={page === Math.ceil(tableData.length / PAGE_SIZE)}
                                className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Next ›
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
