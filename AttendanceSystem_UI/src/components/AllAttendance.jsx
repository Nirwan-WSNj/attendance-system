import React, { useEffect, useState, useCallback, useMemo } from "react";
import { attendanceApi, hrApi } from "../config/apiClient";
import { getAuthCacheScope } from "../config/authService";
import { getAccessLabel } from "../config/permissions";

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

const calcMins = (checkIn, checkOut) => {
    const inMins = parseMinutes(checkIn);
    const outMins = parseMinutes(checkOut);
    if (inMins == null || outMins == null) return null;
    let mins = outMins - inMins;
    if (mins < 0) mins += 720;
    return mins > 0 ? mins : null;
};

const fmtMins = (mins) => {
    if (mins == null || mins <= 0) return "—";
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const schedStartMins = (r) =>
    (r.inHour != null && r.inMinute != null) ? r.inHour * 60 + r.inMinute : 8 * 60 + 30;
const schedEndMins = (r) =>
    (r.outHour != null && r.outMinute != null) ? r.outHour * 60 + r.outMinute : 16 * 60 + 15;

// Times up to 12:30 PM are valid check-ins; after 12:30 PM is treated as no valid check-in.
const EARLIEST_VALID_CHECK_IN = 5 * 60;
const NOON_CUTOFF = 12 * 60 + 30;
// A second pre-noon time is only trusted as a real checkout (vs. a stray duplicate scan)
// if it's at least this far after the check-in.
const MIN_PRE_NOON_CHECKOUT_GAP_MINS = 120;

const isFullDayLeaveRecord = (r) => {
    const inMins = parseMinutes(r.checkIn);
    if (inMins != null) return inMins > NOON_CUTOFF;
    const outMins = parseMinutes(r.checkOut);
    return outMins != null && outMins > NOON_CUTOFF;
};

const getArrivalStatus = (r) => {
    if (!r.checkIn && !r.checkOut) return null;
    const mins = parseMinutes(r.checkIn);
    if (mins == null) {
        if (parseMinutes(r.checkOut) != null) {
            return { label: "Missing In", cls: "bg-amber-100 text-amber-700" };
        }

        return isFullDayLeaveRecord(r)
            ? { label: "Full Day Leave", cls: "bg-slate-100 text-slate-700" }
            : { label: "No Valid Check In", cls: "border border-gray-300 text-gray-500" };
    }

    const outMins = parseMinutes(r.checkOut);
    const arrivalDelay = mins - schedStartMins(r);
    const earlyDeparture = outMins == null ? 0 : schedEndMins(r) - outMins;
    const delay = Math.max(arrivalDelay, earlyDeparture);
    if (delay <= 0) return { label: "On Time", cls: "bg-green-100 text-green-700" };
    if (delay <= 30) return { label: "Late", cls: "bg-yellow-100 text-yellow-700" };
    if (delay <= 45) return { label: "Half Short Leave", cls: "bg-orange-100 text-orange-700" };
    if (delay <= 90) return { label: "Short Leave", cls: "bg-red-100 text-red-600" };
    return mins <= NOON_CUTOFF
        ? { label: "Half Day", cls: "bg-rose-100 text-rose-700" }
        : { label: "Full Day Leave", cls: "bg-slate-100 text-slate-700" };
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
        const currentDayCheckIn = candidates.find(c => c.mins >= EARLIEST_VALID_CHECK_IN && c.mins <= NOON_CUTOFF);
        if (currentDayCheckIn) return { ...r, checkIn: currentDayCheckIn.original, checkOut: null };

        const standaloneCheckOut = [...candidates].reverse().find(c => c.mins > NOON_CUTOFF) ?? first;
        return { ...r, checkIn: null, checkOut: standaloneCheckOut.original };
    }

    if (candidates.length === 1) {
        if (!r.checkIn && r.checkOut) return { ...r, checkIn: null, checkOut: first.original };

        return first.mins <= NOON_CUTOFF
            ? { ...r, checkIn: first.original, checkOut: null }
            : { ...r, checkIn: null, checkOut: first.original };
    }

    if (first.mins <= NOON_CUTOFF) {
        const isCheckoutValid = last.mins > NOON_CUTOFF || (last.mins - first.mins) >= MIN_PRE_NOON_CHECKOUT_GAP_MINS;
        return { ...r, checkIn: first.original, checkOut: isCheckoutValid ? last.original : null };
    }

    return { ...r, checkIn: null, checkOut: last.original };
};

const today = new Date().toISOString().slice(0, 10);
const PAGE_SIZE = 50;
const ATTENDANCE_CACHE_TTL_MS = 5 * 60 * 1000;
const ATTENDANCE_CACHE_PREFIX = "all-attendance-cache-v2";
const ARRIVAL_STATUS_OPTIONS = [
    "On Time",
    "Late",
    "Half Short Leave",
    "Short Leave",
    "Half Day",
    "Missing In",
    "Full Day Leave",
    "No Valid Check In",
];
const ARRIVAL_STATUS_FILTER_CLASSES = {
    "On Time": {
        active: "bg-green-600 text-white border-green-600 shadow-sm",
        inactive: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
    },
    Late: {
        active: "bg-yellow-500 text-white border-yellow-500 shadow-sm",
        inactive: "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100",
    },
    "Half Short Leave": {
        active: "bg-orange-500 text-white border-orange-500 shadow-sm",
        inactive: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100",
    },
    "Short Leave": {
        active: "bg-red-600 text-white border-red-600 shadow-sm",
        inactive: "bg-red-50 text-red-600 border-red-200 hover:bg-red-100",
    },
    "Half Day": {
        active: "bg-rose-600 text-white border-rose-600 shadow-sm",
        inactive: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100",
    },
    "Missing In": {
        active: "bg-amber-600 text-white border-amber-600 shadow-sm",
        inactive: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
    },
    "Full Day Leave": {
        active: "bg-slate-600 text-white border-slate-600 shadow-sm",
        inactive: "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100",
    },
    "No Valid Check In": {
        active: "bg-gray-600 text-white border-gray-600 shadow-sm",
        inactive: "bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100",
    },
};

const arrivalStatusFilterClass = (label, isActive) => {
    const styles = ARRIVAL_STATUS_FILTER_CLASSES[label] ?? ARRIVAL_STATUS_FILTER_CLASSES["No Valid Check In"];
    return styles[isActive ? "active" : "inactive"];
};

const formatDateLabel = (value) => {
    if (!value) return "";
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-LK", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
};

const attendanceCacheKey = (authScope, mode, date) =>
    date ? `${ATTENDANCE_CACHE_PREFIX}:${authScope}:${mode}:${date}` : null;

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

const readAttendanceCache = (key) => {
    if (!key) return null;
    try {
        const cached = JSON.parse(readCacheValue(key) || "null");
        if (!cached || Date.now() - cached.cachedAt > ATTENDANCE_CACHE_TTL_MS) return null;
        return cached;
    } catch {
        return null;
    }
};

const writeAttendanceCache = (key, payload) => {
    if (!key) return;
    writeCacheValue(key, JSON.stringify({ ...payload, cachedAt: Date.now() }));
};

export default function AllAttendance() {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [viewMode, setViewMode] = useState("today"); // today | bydate | range
    const [date, setDate] = useState(today);
    const [from, setFrom] = useState(today);
    const [to, setTo] = useState(today);
    const [epfFilter, setEpfFilter] = useState("");
    const [search, setSearch] = useState("");
    const [agmFilter, setAgmFilter] = useState("");
    const [dgmFilter, setDgmFilter] = useState("");
    const [designationFilter, setDesignationFilter] = useState("");
    const [epfSearch, setEpfSearch] = useState("");
    const [page, setPage] = useState(1);
    const [allEmployees, setAllEmployees] = useState([]);
    const [activeTab, setActiveTab] = useState("present"); // present | absent
    const [arrivalStatusFilter, setArrivalStatusFilter] = useState("");
    const [sortField, setSortField] = useState("");
    const [sortDir, setSortDir] = useState("asc");
    const [lastUpdated, setLastUpdated] = useState(null);
    const [loadedDate, setLoadedDate] = useState(today);
    const [sourceStatus, setSourceStatus] = useState(null);

    const loadEmployees = useCallback(async () => {
        const data = await hrApi.getAllEmployees();
        setAllEmployees(Array.isArray(data) ? data : []);
    }, []);

    useEffect(() => {
        loadEmployees().catch(() => {});
    }, [loadEmployees]);

    const load = useCallback(async () => {
        const activeDate = viewMode === "today" ? today : viewMode === "bydate" ? date : null;
        const cacheKey = viewMode === "range"
            ? null
            : attendanceCacheKey(getAuthCacheScope(), viewMode, activeDate);
        const cached = readAttendanceCache(cacheKey);
        if (cached) {
            setRecords(Array.isArray(cached.records) ? cached.records : []);
            setLoadedDate(cached.loadedDate ?? activeDate);
            setSourceStatus(cached.sourceStatus ?? null);
            setLastUpdated(new Date(cached.cachedAt));
            setLoading(false);
        } else {
            setLoading(true);
        }
        setError("");
        setPage(1);
        try {
            let data;
            if (viewMode === "today") {
                data = await attendanceApi.getToday();
                attendanceApi.getSourceStatus(activeDate)
                    .then(status => setSourceStatus(status))
                    .catch(() => setSourceStatus(null));
            } else if (viewMode === "bydate") {
                data = await attendanceApi.getByDate(date);
                attendanceApi.getSourceStatus(activeDate)
                    .then(status => setSourceStatus(status))
                    .catch(() => setSourceStatus(null));
            } else {
                data = await attendanceApi.getRange(from, to, epfFilter ? { epfNo: epfFilter } : {});
                setSourceStatus(null);
            }
            const rows = Array.isArray(data) ? data.map(reclassifyTimes) : [];
            setRecords(rows);
            setLoadedDate(activeDate);
            setLastUpdated(new Date());
            writeAttendanceCache(cacheKey, {
                records: rows,
                loadedDate: activeDate,
                sourceStatus: null
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [viewMode, date, from, to, epfFilter]);

    useEffect(() => { load(); }, [load]);

    // Merge absent employees (only for single-day views)
    const effectiveDate = viewMode === "range" ? null : loadedDate;
    const isSourceSynced = !effectiveDate || sourceStatus?.isSynced !== false;
    const displayRecords = useMemo(() => {
        if (!effectiveDate || !isSourceSynced || allEmployees.length === 0) return records;
        const presentEpfs = new Set(records.map(r => r.epfNo).filter(Boolean));
        const absentRows = allEmployees
            .filter(e => e.epfNo && !presentEpfs.has(e.epfNo))
            .map(e => ({
                epfNo: e.epfNo,
                nameWithInitial: e.nameWithInitial,
                firstName: e.firstName,
                lastName: e.lastName,
                designationName: e.designationName,
                agmWorkSpaceName: e.agmWorkSpaceName,
                dgmWorkSpaceName: e.dgmWorkSpaceName,
                serviceUnitName: e.serviceUnitName,
                workDate: effectiveDate,
                checkIn: null,
                checkOut: null,
                inHour: e.inHour,
                inMinute: e.inMinute,
                _absent: true,
            }));
        return [...records, ...absentRows];
    }, [records, allEmployees, effectiveDate, isSourceSynced]);
    const hasNoSourceDataForDate = !!effectiveDate && !loading && !isSourceSynced;

    // Build filter options from loaded records
    const agmOptions = [...new Set(displayRecords.map(r => r.agmWorkSpaceName).filter(Boolean))].sort();
    const hasAgmData = agmOptions.length > 0;

    // DGM options narrow when an AGM is selected; includes counts
    const agmRecords = displayRecords.filter(r => !agmFilter || r.agmWorkSpaceName === agmFilter);
    const dgmOptions = [...new Set(agmRecords.map(r => r.dgmWorkSpaceName).filter(Boolean))]
        .sort()
        .map(name => ({ name, count: agmRecords.filter(r => r.dgmWorkSpaceName === name).length }));
    const directUnderAgmCount = agmRecords.filter(r => !r.dgmWorkSpaceName).length;

    // Designation options narrow when AGM and/or DGM is selected
    const designationOptions = [...new Set(
        displayRecords
            .filter(r => !agmFilter || r.agmWorkSpaceName === agmFilter)
            .filter(r => {
                if (!dgmFilter) return true;
                if (dgmFilter === "__DIRECT__") return !r.dgmWorkSpaceName;
                return r.dgmWorkSpaceName === dgmFilter;
            })
            .map(r => r.designationName)
            .filter(Boolean)
    )].sort();

    const applyBaseFilters = (r) => {
        if (agmFilter && r.agmWorkSpaceName !== agmFilter) return false;
        if (dgmFilter === "__DIRECT__") { if (r.dgmWorkSpaceName) return false; }
        else if (dgmFilter && r.dgmWorkSpaceName !== dgmFilter) return false;
        if (designationFilter && r.designationName !== designationFilter) return false;
        if (epfSearch && !(r.epfNo ?? "").toLowerCase().includes(epfSearch.toLowerCase())) return false;
        if (search) {
            const t = search.toLowerCase();
            const name = r.nameWithInitial ?? `${r.firstName ?? ""} ${r.lastName ?? ""}`;
            if (!name.toLowerCase().includes(t)) return false;
        }
        return true;
    };

    const baseFiltered = displayRecords.filter(applyBaseFilters);
    const presentCount = baseFiltered.filter(r => !!(r.checkIn || r.checkOut)).length;
    const absentCount = baseFiltered.filter(r => !r.checkIn && !r.checkOut).length;
    const arrivalStatusCounts = Object.fromEntries(ARRIVAL_STATUS_OPTIONS.map(label => [label, 0]));
    baseFiltered.forEach(r => {
        const status = getArrivalStatus(r);
        if (status && Object.prototype.hasOwnProperty.call(arrivalStatusCounts, status.label)) {
            arrivalStatusCounts[status.label] += 1;
        }
    });

    const filtered = baseFiltered.filter(r => {
        const isPresent = !!(r.checkIn || r.checkOut);
        if (activeTab === "present" && !isPresent) return false;
        if (activeTab === "absent" && isPresent) return false;
        if (arrivalStatusFilter) {
            const status = getArrivalStatus(r);
            if (status?.label !== arrivalStatusFilter) return false;
        }
        return true;
    });

    const toggleSort = (field) => {
        if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortField(field); setSortDir("asc"); }
        setPage(1);
    };

    const sorted = useMemo(() => {
        if (!sortField) return filtered;
        return [...filtered].sort((a, b) => {
            const av = String(a[sortField] ?? "");
            const bv = String(b[sortField] ?? "");
            return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        });
    }, [filtered, sortField, sortDir]);

    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const pageData = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <div className="p-6 space-y-5">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-800">All Attendance Records</h1>
                {effectiveDate && (
                    <p className="text-xs text-gray-400 mt-0.5">
                        Showing {formatDateLabel(effectiveDate)}
                        {!isSourceSynced ? " - AttendanceERP not synced" : ""}
                    </p>
                )}
                <p className="text-sm text-gray-500 mt-0.5">{getAccessLabel()} attendance view</p>
            </div>

            {/* Filter Panel */}
            <div className="bg-white rounded-xl shadow p-4 space-y-3">
                {/* Mode tabs */}
                <div className="flex gap-2">
                    {[
                        { key: "today", label: "Today" },
                        { key: "bydate", label: "By Date" },
                        { key: "range", label: "Date Range" }
                    ].map(m => (
                        <button
                            key={m.key}
                            onClick={() => setViewMode(m.key)}
                            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                                viewMode === m.key
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap items-end gap-3">
                    {viewMode === "bydate" && (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                            <input
                                type="date"
                                value={date}
                                max={today}
                                onChange={e => setDate(e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    )}

                    {viewMode === "range" && (
                        <>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                                <input
                                    type="date"
                                    value={from}
                                    max={to}
                                    onChange={e => setFrom(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                                <input
                                    type="date"
                                    value={to}
                                    min={from}
                                    max={today}
                                    onChange={e => setTo(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </>
                    )}

                    {hasAgmData && (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">AGM Section</label>
                            <select
                                value={agmFilter}
                                onChange={e => { setAgmFilter(e.target.value); setDgmFilter(""); setDesignationFilter(""); setPage(1); }}
                                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 min-w-[160px]"
                            >
                                <option value="">All AGM Sections</option>
                                {agmOptions.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                    )}

                    {agmFilter && (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">DGM Unit</label>
                            <select
                                value={dgmFilter}
                                onChange={e => { setDgmFilter(e.target.value); setDesignationFilter(""); setPage(1); }}
                                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 min-w-[200px]"
                            >
                                <option value="">All DGM Units</option>
                                {directUnderAgmCount > 0 && (
                                    <option value="__DIRECT__">Direct under AGM ({directUnderAgmCount})</option>
                                )}
                                {dgmOptions.map(d => (
                                    <option key={d.name} value={d.name}>{d.name} ({d.count})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {designationOptions.length > 0 && (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Designation</label>
                            <select
                                value={designationFilter}
                                onChange={e => { setDesignationFilter(e.target.value); setPage(1); }}
                                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 min-w-[160px]"
                            >
                                <option value="">All Designations</option>
                                {designationOptions.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">EPF No</label>
                        <input
                            type="text"
                            value={epfSearch}
                            onChange={e => { setEpfSearch(e.target.value); setPage(1); }}
                            placeholder="EPF…"
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-28 bg-gray-50"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                        <input
                            type="text"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                            placeholder="Name…"
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40 bg-gray-50"
                        />
                    </div>

                    <button
                        onClick={load}
                        className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition self-end"
                    >
                        Search
                    </button>

                    {(agmFilter || dgmFilter || designationFilter || epfSearch || search || arrivalStatusFilter) && (
                        <button
                            onClick={() => { setAgmFilter(""); setDgmFilter(""); setDesignationFilter(""); setEpfSearch(""); setSearch(""); setArrivalStatusFilter(""); setPage(1); }}
                            className="px-3 py-2 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50 self-end"
                        >
                            ✕ Clear
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">⚠️ {error}</div>
            )}

            {hasNoSourceDataForDate && !error && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                    {sourceStatus?.message || `No AttendanceERP punch data found for ${formatDateLabel(effectiveDate)}.`} Absent employees are not calculated until that date is synced.
                </div>
            )}

            {/* Present / Absent tabs + last updated */}
            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    <button
                        onClick={() => { setActiveTab("present"); setPage(1); }}
                        className={`px-5 py-2 rounded-full text-sm font-semibold transition ${activeTab === "present" ? "bg-blue-600 text-white shadow" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}
                    >
                        Present {presentCount}
                    </button>
                    <button
                        onClick={() => { setActiveTab("absent"); setArrivalStatusFilter(""); setPage(1); }}
                        className={`px-5 py-2 rounded-full text-sm font-semibold transition ${activeTab === "absent" ? "bg-gray-700 text-white shadow" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}
                        disabled={!effectiveDate || hasNoSourceDataForDate}
                        title={
                            !effectiveDate
                                ? "Absent view only available for Today / By Date"
                                : hasNoSourceDataForDate
                                    ? "Absent view is available after AttendanceERP data syncs for this date"
                                    : ""
                        }
                    >
                        Absent {absentCount}
                    </button>
                </div>
                {lastUpdated && (
                    <span className="text-xs text-gray-400">
                        Last updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                )}
            </div>

            {activeTab === "present" && (
                <div className="bg-white rounded-xl shadow px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-600 mr-1">Arrival Status</span>
                        <button
                            onClick={() => { setArrivalStatusFilter(""); setPage(1); }}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${!arrivalStatusFilter ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                        >
                            All {presentCount}
                        </button>
                        {ARRIVAL_STATUS_OPTIONS.map(label => (
                            <button
                                key={label}
                                onClick={() => { setActiveTab("present"); setArrivalStatusFilter(label); setPage(1); }}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${arrivalStatusFilterClass(label, arrivalStatusFilter === label)}`}
                            >
                                {label} {arrivalStatusCounts[label] ?? 0}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-gray-700">Records</h2>
                    <span className="text-sm text-gray-400">
                        Page {page} of {totalPages} ({sorted.length} total)
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                                {[
                                    ...(viewMode === "range" ? [{ label: "Date", field: "workDate" }] : []),
                                    { label: "EPF No", field: "epfNo" },
                                    { label: "Name", field: "nameWithInitial" },
                                    { label: "Designation", field: "designationName" },
                                    { label: "AGM Unit", field: "agmWorkSpaceName" },
                                    { label: "DGM Unit", field: "dgmWorkSpaceName" },
                                    { label: "Check In", field: "checkIn" },
                                    { label: "Arrival Status", field: null },
                                    { label: "Check Out", field: "checkOut" },
                                ].map(col => (
                                    <th
                                        key={col.label}
                                        className={`px-4 py-3 text-left ${col.field ? "cursor-pointer select-none hover:text-gray-700" : ""}`}
                                        onClick={() => col.field && toggleSort(col.field)}
                                    >
                                        {col.label}
                                        {col.field && (
                                            <span className="ml-1 text-gray-300">
                                                {sortField === col.field ? (sortDir === "asc" ? "↑" : "↓") : "↑↓"}
                                            </span>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={viewMode === "range" ? 9 : 8} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
                            ) : pageData.length === 0 ? (
                                <tr><td colSpan={viewMode === "range" ? 9 : 8} className="px-4 py-8 text-center text-gray-400">No records found</td></tr>
                            ) : pageData.map((r, i) => {
                                const checkIn = r.checkIn || null;
                                const checkOut = r.checkOut || null;
                                const arrivalStatus = getArrivalStatus(r);
                                const displayName = r.nameWithInitial || `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Unknown Employee";
                                const isAbsent = !checkIn && !checkOut;
                                const correctionTitle = r.isCorrected
                                    ? `Corrected from ${r.originalCheckIn || "-"} / ${r.originalCheckOut || "-"}`
                                    : "";
                                const arrivalBadge = arrivalStatus
                                    ? <span className={`px-2 py-0.5 rounded-full text-xs ${arrivalStatus.cls}`}>{arrivalStatus.label}</span>
                                    : null;

                                return (
                                    <tr key={i} className="hover:bg-gray-50">
                                        {viewMode === "range" && (
                                            <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">{r.workDate ? formatDateLabel(r.workDate) : ""}</td>
                                        )}
                                        <td className="px-4 py-2.5 font-mono text-blue-600 text-xs">{r.epfNo ?? ""}</td>
                                        <td className="px-4 py-2.5 font-semibold text-gray-800">
                                            <div className="flex items-center gap-2 min-w-[180px]">
                                                <span className="truncate">{displayName}</span>
                                                {r.isCorrected && (
                                                    <span title={correctionTitle} className="shrink-0 px-2 py-0.5 rounded-full text-[11px] bg-blue-50 text-blue-700 border border-blue-100">
                                                        Corrected
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-gray-500 text-xs">{r.designationName ?? ""}</td>
                                        <td className="px-4 py-2.5 text-gray-500 text-xs">{r.agmWorkSpaceName ?? ""}</td>
                                        <td className="px-4 py-2.5 text-gray-500 text-xs">{r.dgmWorkSpaceName ?? ""}</td>
                                        <td className="px-4 py-2.5">
                                            {checkIn
                                                ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">{checkIn}</span>
                                                : !isAbsent
                                                    ? <span className="px-2 py-0.5 rounded-full text-xs border border-gray-300 text-gray-400">—</span>
                                                    : null
                                            }
                                        </td>
                                        <td className="px-4 py-2.5">{arrivalBadge}</td>
                                        <td className="px-4 py-2.5">
                                            {checkOut
                                                ? <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-medium">{checkOut}</span>
                                                : !isAbsent
                                                    ? <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-500 font-medium">No Out Punch</span>
                                                    : null
                                            }
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                        >
                            ← Prev
                        </button>
                        <span className="text-sm text-gray-500">Page {page} / {totalPages}</span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                        >
                            Next →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
