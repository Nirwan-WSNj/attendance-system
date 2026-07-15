import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    CheckSquare,
    ClipboardCheck,
    History,
    RefreshCw,
    Save,
    Search,
    Square,
    XCircle
} from "lucide-react";
import { correctionApi } from "../config/apiClient";
import {
    canEditCorrections,
    isAttendanceAdmin,
    isLeaveAdmin,
    isLeaveClerk
} from "../config/permissions";
import AttendanceCorrectionsWorkspaceView from "./AttendanceCorrectionsWorkspaceView";

const formatLocalDateInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const today = formatLocalDateInput(new Date());
const addDays = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return formatLocalDateInput(d);
};

const createInitialFilters = (status = "needs-correction") => ({
    from: addDays(-7),
    to: today,
    status,
    epfNo: "",
    keyword: "",
    agm: "",
    dgm: "",
    serviceUnit: "",
    designation: "",
    page: 1,
    pageSize: 50
});

const FILTER_FIELDS = [
    "from",
    "to",
    "status",
    "epfNo",
    "keyword",
    "agm",
    "dgm",
    "serviceUnit",
    "designation"
];

const getDateRangeError = ({ from, to }) => {
    if (!from || !to) return "Select both From and To dates.";
    const fromParts = from.split("-").map(Number);
    const toParts = to.split("-").map(Number);
    if (fromParts.length !== 3 || toParts.length !== 3 || fromParts.some(Number.isNaN) || toParts.some(Number.isNaN)) {
        return "Enter a valid report period.";
    }

    const fromUtc = Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]);
    const toUtc = Date.UTC(toParts[0], toParts[1] - 1, toParts[2]);
    const dayDifference = Math.round((toUtc - fromUtc) / 86400000);
    if (dayDifference < 0) return "From date cannot be after To date.";
    if (dayDifference > 31) return "Attendance range cannot exceed 31 days.";
    if (to > today) return "To date cannot be in the future.";
    return "";
};

const VIEW_OPTIONS = [
    { value: "needs-correction", label: "Needs Attention" },
    { value: "corrected", label: "Changes Applied" },
    { value: "all", label: "All Records" }
];

const ISSUE_STATUS_OPTIONS = [
    { value: "needs-correction", label: "All Issue Types" },
    { value: "absent", label: "Absent" },
    { value: "missing-in", label: "Missing In" },
    { value: "missing-out", label: "Missing Out" }
];

const ISSUE_STATUS_VALUES = new Set(ISSUE_STATUS_OPTIONS.map((option) => option.value));

const REASON_TYPES = [
    "Site/Circuit",
    "Official Duty",
    "Forgot Punch",
    "Machine Issue",
    "Manual Correction",
    "Other"
];

const keyOf = (row) => `${row.epfNo || ""}|${row.workDate || ""}`;

const normalizeTimeValue = (value) => {
    if (!value) return "";
    const text = String(value).trim();
    const match = text.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return "";
    return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const displayDate = (value) => {
    if (!value) return "";
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-LK", {
        year: "numeric",
        month: "short",
        day: "2-digit"
    });
};

const displayDateTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("en-LK", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
};

const getHistoryStatus = (item) => {
    const status = item?.status || (item?.isActive ? "Applied" : "Inactive");
    const normalized = status.toLowerCase();
    if (item?.isActive || normalized === "applied") {
        return { label: "Applied", cls: "bg-green-50 text-green-700 border-green-200" };
    }
    if (normalized === "void") {
        return { label: "Void", cls: "bg-red-50 text-red-700 border-red-200" };
    }
    if (normalized === "superseded") {
        return { label: "Superseded", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    }
    return { label: status, cls: "bg-gray-50 text-gray-600 border-gray-200" };
};

const getRowStatus = (row) => {
    if (row.isCorrected) {
        if (!row.checkIn) return { label: "Missing In", cls: "bg-amber-50 text-amber-700 border-amber-200" };
        if (!row.checkOut) return { label: "Missing Out", cls: "bg-red-50 text-red-600 border-red-200" };
        return { label: "Already Corrected", cls: "bg-blue-50 text-blue-700 border-blue-200" };
    }
    if (!row.checkIn && !row.checkOut) return { label: "Absent", cls: "bg-gray-50 text-gray-600 border-gray-200" };
    if (!row.checkIn) return { label: "Missing In", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    if (!row.checkOut) return { label: "Missing Out", cls: "bg-red-50 text-red-600 border-red-200" };
    return { label: "Present", cls: "bg-green-50 text-green-700 border-green-200" };
};

const makeDraft = (row) => ({
    correctedCheckIn: normalizeTimeValue(row.checkIn),
    correctedCheckOut: normalizeTimeValue(row.checkOut),
    reasonType: row.correctionReason || "Site/Circuit",
    location: row.correctionLocation || "",
    remarks: row.correctionRemarks || ""
});

const labelClass = "block text-xs font-medium text-gray-500 mb-1";
const controlClass = "w-full h-10 px-3 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";
const filterGridClass = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3";

export default function AttendanceCorrections() {
    const isClerkWorkspace = isLeaveClerk() && !isAttendanceAdmin() && !isLeaveAdmin();
    const initialStatus = isClerkWorkspace ? "all" : "needs-correction";
    const [filters, setFilters] = useState(() => createInitialFilters(initialStatus));
    const [appliedFilters, setAppliedFilters] = useState(() => createInitialFilters(initialStatus));
    const [pageInfo, setPageInfo] = useState({
        page: 1,
        pageSize: 50,
        totalCount: 0,
        totalPages: 0
    });
    const [filterOptions, setFilterOptions] = useState({
        agmOptions: [],
        dgmOptions: [],
        dgmOptionCounts: {},
        directUnderAgmCount: 0,
        serviceUnitOptions: [],
        designationOptions: []
    });
    const [records, setRecords] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [drafts, setDrafts] = useState({});
    const [selected, setSelected] = useState(() => new Set());
    const [expandedSessionId, setExpandedSessionId] = useState("");
    const [workspaceTab, setWorkspaceTab] = useState(isClerkWorkspace ? "team" : "queue");
    const [showMoreFilters, setShowMoreFilters] = useState(false);
    const [sessionTitle, setSessionTitle] = useState("Site/Circuit attendance correction");
    const [sessionRemarks, setSessionRemarks] = useState("");
    const [loading, setLoading] = useState(false);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [candidatesReady, setCandidatesReady] = useState(false);
    const [saving, setSaving] = useState(false);
    const [voidingId, setVoidingId] = useState("");
    const [filterError, setFilterError] = useState("");
    const [candidateError, setCandidateError] = useState("");
    const [sessionsError, setSessionsError] = useState("");
    const [actionError, setActionError] = useState("");
    const [message, setMessage] = useState("");
    const candidateRequestId = useRef(0);
    const sessionRequestId = useRef(0);
    const canEdit = canEditCorrections();
    const hasAdministrativeScope = isAttendanceAdmin() || isLeaveAdmin();
    const usesClerkAssignmentScope = isClerkWorkspace;
    const scopeInfo = usesClerkAssignmentScope
        ? {
            title: "Your assigned team",
            description: "Only employees assigned to you for attendance review are shown."
        }
        : hasAdministrativeScope
            ? {
                title: "Administrative correction scope",
                description: "Results follow your administrator access; clerk assignments do not narrow this view."
            }
            : {
                title: "Assigned work-unit scope",
                description: "This queue is limited to employees covered by your attendance permissions."
            };
    const mutating = saving || Boolean(voidingId);
    const hasPendingFilters = FILTER_FIELDS.some((field) => filters[field] !== appliedFilters[field]);
    const canInteractWithRows = canEdit && candidatesReady && !loading && !hasPendingFilters && !mutating;
    const workspaceDefaultStatus = isClerkWorkspace && workspaceTab === "team"
        ? "all"
        : "needs-correction";

    const hasActiveFilters = !!(
        filters.epfNo ||
        filters.keyword ||
        filters.agm ||
        filters.dgm ||
        filters.serviceUnit ||
        filters.designation ||
        filters.status !== workspaceDefaultStatus
    );

    const setFilter = (name, value) => {
        setFilterError("");
        setActionError("");
        setMessage("");
        setSelected(new Set());
        setFilters((prev) => {
            const next = { ...prev, [name]: value };
            if (name !== "page") next.page = 1;
            if (name === "agm") {
                next.dgm = "";
                next.serviceUnit = "";
                next.designation = "";
            }
            if (name === "dgm") {
                next.serviceUnit = "";
                next.designation = "";
            }
            if (name === "serviceUnit") {
                next.designation = "";
            }
            return next;
        });
    };

    const changeWorkspaceTab = (tab) => {
        if (mutating) return;
        setWorkspaceTab(tab);
        setActionError("");
        setMessage("");
        setSelected(new Set());

        if (!isClerkWorkspace || tab === "history") return;

        const status = tab === "team" ? "all" : "needs-correction";
        const next = { ...filters, status, page: 1 };
        setFilters(next);
        setAppliedFilters(next);
    };

    const loadSessions = useCallback(async (query) => {
        const requestId = ++sessionRequestId.current;
        setSessionsLoading(true);
        setSessionsError("");
        setSessions([]);
        setExpandedSessionId("");
        try {
            const data = await correctionApi.getSessions({
                from: query.from,
                to: query.to,
                epfNo: query.epfNo
            });
            if (requestId !== sessionRequestId.current) return;
            setSessions(Array.isArray(data) ? data : []);
        } catch (err) {
            if (requestId !== sessionRequestId.current) return;
            setSessionsError(err?.message || "Failed to load change history.");
            setSessions([]);
        } finally {
            if (requestId === sessionRequestId.current) setSessionsLoading(false);
        }
    }, []);

    const loadCandidates = useCallback(async (query) => {
        const requestId = ++candidateRequestId.current;
        setLoading(true);
        setCandidatesReady(false);
        setCandidateError("");
        setRecords([]);
        setDrafts({});
        setSelected(new Set());
        setPageInfo({
            page: query.page,
            pageSize: query.pageSize,
            totalCount: 0,
            totalPages: 0
        });
        try {
            const data = await correctionApi.getCandidates(query);
            if (requestId !== candidateRequestId.current) return;
            const rows = Array.isArray(data) ? data : data?.items || [];
            const serverPage = Array.isArray(data) ? query.page : data?.page || query.page;
            const serverPageSize = Array.isArray(data) ? query.pageSize : data?.pageSize || query.pageSize;
            const totalCount = Array.isArray(data) ? rows.length : data?.totalCount || 0;
            const totalPages = Array.isArray(data) ? (rows.length > 0 ? 1 : 0) : data?.totalPages || 0;
            const safePage = totalPages === 0 ? 1 : Math.min(serverPage, totalPages);

            if (query.page !== safePage) {
                setFilters((prev) => ({ ...prev, page: safePage }));
                setAppliedFilters((prev) => ({ ...prev, page: safePage }));
                return;
            }

            setPageInfo({
                page: serverPage,
                pageSize: serverPageSize,
                totalCount,
                totalPages
            });
            if (!Array.isArray(data)) {
                setFilterOptions({
                    agmOptions: data?.agmOptions || [],
                    dgmOptions: data?.dgmOptions || [],
                    dgmOptionCounts: data?.dgmOptionCounts || {},
                    directUnderAgmCount: data?.directUnderAgmCount || 0,
                    serviceUnitOptions: data?.serviceUnitOptions || [],
                    designationOptions: data?.designationOptions || []
                });
            }
            setRecords(rows);
            setDrafts(Object.fromEntries(rows.map((row) => [keyOf(row), makeDraft(row)])));
            setSelected(new Set());
            setCandidatesReady(true);
        } catch (err) {
            if (requestId !== candidateRequestId.current) return;
            setCandidateError(err?.message || "Failed to load attendance records.");
            setRecords([]);
            setDrafts({});
            setSelected(new Set());
            setCandidatesReady(false);
        } finally {
            if (requestId === candidateRequestId.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCandidates(appliedFilters);
        loadSessions(appliedFilters);
    }, [appliedFilters, loadCandidates, loadSessions]);

    useEffect(() => () => {
        candidateRequestId.current += 1;
        sessionRequestId.current += 1;
    }, []);

    const applyFilters = () => {
        const validationError = getDateRangeError(filters);
        if (validationError) {
            setFilterError(validationError);
            return;
        }

        const next = { ...filters, page: 1 };
        setFilterError("");
        setCandidateError("");
        setActionError("");
        setMessage("");
        setSelected(new Set());
        setFilters(next);
        setAppliedFilters(next);
    };

    const clearSecondaryFilters = () => {
        const next = {
            ...filters,
            status: workspaceDefaultStatus,
            epfNo: "",
            keyword: "",
            agm: "",
            dgm: "",
            serviceUnit: "",
            designation: "",
            page: 1
        };
        const validationError = getDateRangeError(next);
        setFilters(next);
        setSelected(new Set());
        setActionError("");
        setMessage("");
        if (validationError) {
            setFilterError(validationError);
            return;
        }
        setFilterError("");
        setAppliedFilters(next);
    };

    const refreshAll = () => {
        setFilterError("");
        setCandidateError("");
        setActionError("");
        setMessage("");
        setFilters(appliedFilters);
        loadCandidates(appliedFilters);
        loadSessions(appliedFilters);
    };

    const goToPage = (page) => {
        const nextPage = Math.max(1, Math.min(pageInfo.totalPages || 1, page));
        const next = { ...appliedFilters, page: nextPage };
        setFilters(next);
        setAppliedFilters(next);
        setActionError("");
        setMessage("");
    };

    const changePageSize = (pageSize) => {
        const next = { ...appliedFilters, page: 1, pageSize };
        setFilters(next);
        setAppliedFilters(next);
        setActionError("");
        setMessage("");
    };

    const selectedRows = useMemo(
        () => records.filter((row) => selected.has(keyOf(row))),
        [records, selected]
    );
    const moreFilterCount = [
        ISSUE_STATUS_VALUES.has(filters.status) && filters.status !== "needs-correction",
        filters.epfNo,
        filters.keyword,
        filters.agm,
        filters.dgm,
        filters.serviceUnit,
        filters.designation
    ].filter(Boolean).length;

    const expandedSession = sessions.find((s) => s.sessionId === expandedSessionId);

    const toggleRow = (row) => {
        if (!canInteractWithRows) return;
        const key = keyOf(row);
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
        setDrafts((prev) => ({ ...prev, [key]: prev[key] || makeDraft(row) }));
    };

    const toggleAll = () => {
        if (!canInteractWithRows) return;
        setSelected((prev) => {
            if (records.length > 0 && prev.size === records.length) return new Set();
            return new Set(records.map(keyOf));
        });
    };

    const updateDraft = (row, field, value) => {
        if (!canInteractWithRows) return;
        const key = keyOf(row);
        setSelected((prev) => {
            if (prev.has(key)) return prev;
            const next = new Set(prev);
            next.add(key);
            return next;
        });
        setDrafts((prev) => ({
            ...prev,
            [key]: {
                ...(prev[key] || makeDraft(row)),
                [field]: value
            }
        }));
    };

    const saveSession = async () => {
        if (!canEdit) {
            setActionError("You do not have permission to apply attendance changes.");
            return;
        }

        if (!candidatesReady || loading || hasPendingFilters) {
            setActionError(hasPendingFilters
                ? "Search with the changed filters before applying attendance changes."
                : "Wait until the attendance list has finished loading.");
            return;
        }

        if (selectedRows.length === 0) {
            setActionError("Select at least one row.");
            return;
        }

        const invalidRow = selectedRows.find((row) => {
            const draft = drafts[keyOf(row)] || makeDraft(row);
            const status = getRowStatus(row).label;
            if (status === "Absent") return !draft.correctedCheckIn || !draft.correctedCheckOut;
            if (status === "Missing In") return !draft.correctedCheckIn;
            if (status === "Missing Out") return !draft.correctedCheckOut;
            return !draft.correctedCheckIn && !draft.correctedCheckOut;
        });

        if (invalidRow) {
            const status = getRowStatus(invalidRow).label;
            const required =
                status === "Absent"
                    ? "corrected check-in and check-out"
                    : status === "Missing In"
                        ? "corrected check-in"
                        : status === "Missing Out"
                            ? "corrected check-out"
                            : "corrected in or out time";
            setActionError(`Enter ${required} for EPF ${invalidRow.epfNo} on ${invalidRow.workDate}.`);
            return;
        }

        const items = selectedRows.map((row) => {
            const draft = drafts[keyOf(row)] || makeDraft(row);
            return {
                epfNo: row.epfNo,
                workDate: row.workDate,
                correctedCheckIn: draft.correctedCheckIn || null,
                correctedCheckOut: draft.correctedCheckOut || null,
                reasonType: draft.reasonType || "Site/Circuit",
                location: draft.location || null,
                remarks: draft.remarks || null
            };
        });

        const employeeCount = new Set(selectedRows.map((row) => row.epfNo)).size;
        const replacementCount = selectedRows.filter((row) => row.isCorrected).length;
        const presentCount = selectedRows.filter((row) => getRowStatus(row).label === "Present").length;
        const confirmationLines = [
            `Apply ${selectedRows.length} attendance change(s) for ${employeeCount} employee(s)?`,
            `Period: ${displayDate(appliedFilters.from)} to ${displayDate(appliedFilters.to)}`
        ];
        if (replacementCount > 0) {
            confirmationLines.push(`${replacementCount} selected row(s) already have an applied attendance change and will replace it.`);
        }
        if (presentCount > 0) {
            confirmationLines.push(`${presentCount} selected row(s) currently have both punches; confirm that a manual attendance change is intended.`);
        }
        confirmationLines.push("This action will be recorded in Change History.");
        if (!window.confirm(confirmationLines.join("\n\n"))) return;

        setSaving(true);
        setActionError("");
        setMessage("");
        try {
            const saved = await correctionApi.createSession({
                title: isClerkWorkspace ? "Team attendance changes" : "Attendance correction changes",
                fromDate: appliedFilters.from,
                toDate: appliedFilters.to,
                remarks: null,
                items
            });
            setSelected(new Set());
            setSessionRemarks("");
            await Promise.all([
                loadCandidates(appliedFilters),
                loadSessions(appliedFilters)
            ]);
            setMessage(`${saved.itemCount} attendance change(s) applied successfully.`);
        } catch (err) {
            setActionError(err?.message || "Failed to apply attendance changes.");
        } finally {
            setSaving(false);
        }
    };

    const voidCorrection = async (item) => {
        if (!canEdit) {
            setActionError("You do not have permission to undo attendance changes.");
            return;
        }
        const employee = item.employeeName || `EPF ${item.epfNo}`;
        const correctedTimes = `${item.correctedCheckIn || "-"} / ${item.correctedCheckOut || "-"}`;
        const confirmation = [
            "Undo this attendance change?",
            `${employee} (EPF ${item.epfNo})`,
            `${displayDate(item.workDate)} · Corrected in/out: ${correctedTimes}`,
            "The corrected values will stop applying and the attendance record will return to its source punches."
        ].join("\n\n");
        if (!window.confirm(confirmation)) return;
        setVoidingId(item.correctionId);
        setActionError("");
        setMessage("");
        try {
            await correctionApi.voidCorrection(item.correctionId);
            await Promise.all([
                loadCandidates(appliedFilters),
                loadSessions(appliedFilters)
            ]);
            setMessage(`Attendance change for EPF ${item.epfNo} was undone.`);
        } catch (err) {
            setActionError(err?.message || "Failed to undo the attendance change.");
        } finally {
            setVoidingId("");
        }
    };

    if (["team", "attention", "queue", "history"].includes(workspaceTab)) {
        return (
            <AttendanceCorrectionsWorkspaceView
                vm={{
                    filters,
                    appliedFilters,
                    pageInfo,
                    filterOptions,
                    records,
                    sessions,
                    drafts,
                    selected,
                    workspaceTab,
                    showMoreFilters,
                    loading,
                    sessionsLoading,
                    saving,
                    voidingId,
                    filterError,
                    candidateError,
                    sessionsError,
                    actionError,
                    message,
                    canEdit,
                    canInteractWithRows,
                    isClerkWorkspace,
                    usesClerkAssignmentScope,
                    scopeInfo,
                    mutating,
                    hasPendingFilters,
                    hasActiveFilters,
                    selectedRows,
                    moreFilterCount,
                    today,
                    issueStatusValues: ISSUE_STATUS_VALUES,
                    viewOptions: VIEW_OPTIONS,
                    issueStatusOptions: ISSUE_STATUS_OPTIONS,
                    reasonTypes: REASON_TYPES,
                    changeWorkspaceTab,
                    setShowMoreFilters,
                    setFilter,
                    applyFilters,
                    clearSecondaryFilters,
                    refreshAll,
                    loadCandidates,
                    loadSessions,
                    toggleAll,
                    toggleRow,
                    updateDraft,
                    goToPage,
                    changePageSize,
                    setSelected,
                    saveSession,
                    voidCorrection,
                    keyOf,
                    makeDraft,
                    getRowStatus,
                    getHistoryStatus,
                    displayDate,
                    displayDateTime
                }}
            />
        );
    }

    return (
        <div className="p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Attendance Corrections</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Review, apply, and audit attendance corrections</p>
                </div>
                <button
                    onClick={refreshAll}
                    disabled={loading || sessionsLoading || mutating}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    title="Refresh"
                >
                    <RefreshCw size={16} />
                    Refresh
                </button>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                <div className="text-sm font-semibold text-blue-800">{scopeInfo.title}</div>
                <div className="mt-0.5 text-sm text-blue-700">{scopeInfo.description}</div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="space-y-3">
                    <div className={filterGridClass}>
                        <div>
                            <label className={labelClass}>From</label>
                            <input
                                type="date"
                                value={filters.from}
                                max={filters.to}
                                onChange={(e) => setFilter("from", e.target.value)}
                                className={controlClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>To</label>
                            <input
                                type="date"
                                value={filters.to}
                                min={filters.from}
                                max={today}
                                onChange={(e) => setFilter("to", e.target.value)}
                                className={controlClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>View</label>
                            <select
                                value={ISSUE_STATUS_VALUES.has(filters.status) ? "needs-correction" : filters.status}
                                onChange={(e) => setFilter("status", e.target.value)}
                                className={controlClass}
                            >
                                {VIEW_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                        {ISSUE_STATUS_VALUES.has(filters.status) && (
                            <div>
                                <label className={labelClass}>Issue Type</label>
                                <select
                                    value={filters.status}
                                    onChange={(e) => setFilter("status", e.target.value)}
                                    className={controlClass}
                                >
                                    {ISSUE_STATUS_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div>
                            <label className={labelClass}>EPF No</label>
                            <input
                                type="text"
                                value={filters.epfNo}
                                onChange={(e) => setFilter("epfNo", e.target.value)}
                                placeholder="005220"
                                className={controlClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Employee Name</label>
                            <input
                                type="text"
                                value={filters.keyword}
                                onChange={(e) => setFilter("keyword", e.target.value)}
                                placeholder="Name"
                                className={controlClass}
                            />
                        </div>
                        <button
                            onClick={applyFilters}
                            disabled={loading || mutating}
                            className="h-10 mt-5 inline-flex items-center justify-center gap-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                            <Search size={16} />
                            Search
                        </button>
                    </div>

                    <div className={filterGridClass}>
                        {filterOptions.agmOptions.length > 0 && (
                            <div>
                                <label className={labelClass}>AGM Section</label>
                                <select
                                    value={filters.agm}
                                    onChange={(e) => setFilter("agm", e.target.value)}
                                    className={controlClass}
                                >
                                    <option value="">All AGM Sections</option>
                                    {filterOptions.agmOptions.map((value) => (
                                        <option key={value} value={value}>{value}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {filters.agm && (
                            <div>
                                <label className={labelClass}>DGM Unit</label>
                                <select
                                    value={filters.dgm}
                                    onChange={(e) => setFilter("dgm", e.target.value)}
                                    className={controlClass}
                                >
                                    <option value="">All DGM Units</option>
                                    {filterOptions.directUnderAgmCount > 0 && (
                                        <option value="__DIRECT__">Direct under AGM ({filterOptions.directUnderAgmCount})</option>
                                    )}
                                    {filterOptions.dgmOptions.map((value) => (
                                        <option key={value} value={value}>
                                            {value}
                                            {filterOptions.dgmOptionCounts[value] ? ` (${filterOptions.dgmOptionCounts[value]})` : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {filters.dgm && filterOptions.serviceUnitOptions.length > 0 && (
                            <div>
                                <label className={labelClass}>Service Unit</label>
                                <select
                                    value={filters.serviceUnit}
                                    onChange={(e) => setFilter("serviceUnit", e.target.value)}
                                    className={controlClass}
                                >
                                    <option value="">All Units</option>
                                    {filterOptions.serviceUnitOptions.map((value) => (
                                        <option key={value} value={value}>{value}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {filterOptions.designationOptions.length > 0 && (
                            <div>
                                <label className={labelClass}>Designation</label>
                                <select
                                    value={filters.designation}
                                    onChange={(e) => setFilter("designation", e.target.value)}
                                    className={controlClass}
                                >
                                    <option value="">All Designations</option>
                                    {filterOptions.designationOptions.map((value) => (
                                        <option key={value} value={value}>{value}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <button
                            onClick={clearSecondaryFilters}
                            disabled={!hasActiveFilters || loading || mutating}
                            className="h-10 mt-5 2xl:col-start-6 inline-flex items-center justify-center gap-2 px-4 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
                        >
                            <XCircle size={16} />
                            Clear
                        </button>
                    </div>
                    {filterError && (
                        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {filterError}
                        </div>
                    )}
                    {hasPendingFilters && !filterError && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            Filters have changed. Select Search to apply them before editing or saving corrections.
                        </div>
                    )}
                </div>
            </div>

            {candidateError && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    <span>{candidateError}</span>
                    <button onClick={() => loadCandidates(appliedFilters)} disabled={loading || mutating} className="font-semibold underline disabled:opacity-50">
                        Retry queue
                    </button>
                </div>
            )}
            {actionError && <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{actionError}</div>}
            {message && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{message}</div>}
            {!canEdit && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-700">
                    View-only access. You can review correction candidates and sessions, but saving and voiding are disabled.
                </div>
            )}

            <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <ClipboardCheck size={18} className="text-blue-600" />
                            <h2 className="text-base font-semibold text-gray-700">Correction Candidates</h2>
                        </div>
                        <span className="text-sm text-gray-400">
                            {pageInfo.totalCount} rows | page {pageInfo.totalPages === 0 ? 0 : pageInfo.page} of {pageInfo.totalPages}
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1180px] text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                                    <th className="sticky left-0 z-20 bg-gray-50 px-3 py-3 text-left w-10">
                                        <button
                                            onClick={toggleAll}
                                            disabled={!canInteractWithRows || records.length === 0}
                                            title={canEdit ? "Select all rows on this page" : "View-only access"}
                                            className={canInteractWithRows ? "text-blue-600" : "text-gray-300 cursor-not-allowed"}
                                        >
                                            {records.length > 0 && selected.size === records.length ? <CheckSquare size={18} /> : <Square size={18} />}
                                        </button>
                                    </th>
                                    <th className="px-3 py-3 text-left">Date</th>
                                    <th className="px-3 py-3 text-left">EPF</th>
                                    <th className="px-3 py-3 text-left">Name</th>
                                    <th className="px-3 py-3 text-left">Unit</th>
                                    <th className="px-3 py-3 text-left">Current In</th>
                                    <th className="px-3 py-3 text-left">Current Out</th>
                                    <th className="px-3 py-3 text-left">Correct In</th>
                                    <th className="px-3 py-3 text-left">Correct Out</th>
                                    <th className="px-3 py-3 text-left">Reason</th>
                                    <th className="px-3 py-3 text-left">Location</th>
                                    <th className="sticky right-0 z-20 bg-gray-50 border-l border-gray-100 px-3 py-3 text-left">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={12} className="px-4 py-10 text-center text-gray-400">Loading...</td>
                                    </tr>
                                ) : records.length === 0 ? (
                                    <tr>
                                        <td colSpan={12} className="px-4 py-10 text-center text-gray-500">
                                            {usesClerkAssignmentScope
                                                ? "No correction candidates were found in your assigned employee scope. If employees are missing, ask an administrator to review Correction Access assignments."
                                                : "No correction candidates match the applied filters."}
                                        </td>
                                    </tr>
                                ) : records.map((row) => {
                                    const key = keyOf(row);
                                    const draft = drafts[key] || makeDraft(row);
                                    const status = getRowStatus(row);
                                    const isSelected = selected.has(key);
                                    const stickyCellClass = isSelected ? "bg-blue-50" : "bg-white group-hover:bg-gray-50";

                                    return (
                                        <tr key={key} className={`group ${isSelected ? "bg-blue-50/50" : "hover:bg-gray-50"}`}>
                                            <td className={`sticky left-0 z-10 px-3 py-2.5 ${stickyCellClass}`}>
                                                <button
                                                    onClick={() => toggleRow(row)}
                                                    disabled={!canInteractWithRows}
                                                    title={canEdit ? "Select row" : "View-only access"}
                                                    className={canInteractWithRows ? "text-blue-600" : "text-gray-300 cursor-not-allowed"}
                                                >
                                                    {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                                </button>
                                            </td>
                                            <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{displayDate(row.workDate)}</td>
                                            <td className="px-3 py-2.5 font-mono text-xs text-blue-600">{row.epfNo}</td>
                                            <td className="px-3 py-2.5 min-w-[190px]">
                                                <div className="font-semibold text-gray-800 truncate">{row.nameWithInitial || "Unknown"}</div>
                                                <div className="text-xs text-gray-400 truncate">{row.designationName || ""}</div>
                                            </td>
                                            <td className="px-3 py-2.5 min-w-[170px] text-xs text-gray-500">
                                                <div className="truncate">{row.agmWorkSpaceName || ""}</div>
                                                <div className="truncate">{row.dgmWorkSpaceName || row.serviceUnitName || ""}</div>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <span className="font-mono text-xs text-gray-700">{(row.isCorrected ? row.originalCheckIn : row.checkIn) || "-"}</span>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <span className="font-mono text-xs text-gray-700">{(row.isCorrected ? row.originalCheckOut : row.checkOut) || "-"}</span>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <input
                                                    type="time"
                                                    value={draft.correctedCheckIn}
                                                    onChange={(e) => updateDraft(row, "correctedCheckIn", e.target.value)}
                                                    disabled={!canInteractWithRows}
                                                    className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                                                />
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <input
                                                    type="time"
                                                    value={draft.correctedCheckOut}
                                                    onChange={(e) => updateDraft(row, "correctedCheckOut", e.target.value)}
                                                    disabled={!canInteractWithRows}
                                                    className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                                                />
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <select
                                                    value={draft.reasonType}
                                                    onChange={(e) => updateDraft(row, "reasonType", e.target.value)}
                                                    disabled={!canInteractWithRows}
                                                    className="w-36 px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                                                >
                                                    {REASON_TYPES.map((reason) => (
                                                        <option key={reason} value={reason}>{reason}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <input
                                                    type="text"
                                                    value={draft.location}
                                                    onChange={(e) => updateDraft(row, "location", e.target.value)}
                                                    placeholder="Site / route"
                                                    disabled={!canInteractWithRows}
                                                    className="w-36 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                                                />
                                            </td>
                                            <td className={`sticky right-0 z-10 border-l border-gray-100 px-3 py-2.5 ${stickyCellClass}`}>
                                                <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${status.cls}`}>
                                                    {status.label}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 py-3 border-t border-gray-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                            <label className="inline-flex items-center gap-2">
                                <span>Rows</span>
                                <select
                                    value={appliedFilters.pageSize}
                                    onChange={(e) => changePageSize(Number(e.target.value))}
                                    disabled={loading || mutating || hasPendingFilters}
                                    className="h-9 px-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {[25, 50, 100, 200].map((value) => (
                                        <option key={value} value={value}>{value}</option>
                                    ))}
                                </select>
                            </label>
                            <span>Showing {records.length} of {pageInfo.totalCount}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => goToPage(pageInfo.page - 1)}
                                disabled={loading || mutating || hasPendingFilters || pageInfo.page <= 1}
                                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                            >
                                Prev
                            </button>
                            <span className="text-sm text-gray-500">
                                Page {pageInfo.totalPages === 0 ? 0 : pageInfo.page} of {pageInfo.totalPages}
                            </span>
                            <button
                                onClick={() => goToPage(pageInfo.page + 1)}
                                disabled={loading || mutating || hasPendingFilters || pageInfo.totalPages === 0 || pageInfo.page >= pageInfo.totalPages}
                                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>

                <div className="space-y-5">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-semibold text-gray-700">Session</h2>
                            <span className="text-xs text-gray-400">{selectedRows.length} selected</span>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                            <input
                                type="text"
                                value={sessionTitle}
                                onChange={(e) => setSessionTitle(e.target.value)}
                                disabled={!canEdit || mutating}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Remarks</label>
                            <textarea
                                value={sessionRemarks}
                                onChange={(e) => setSessionRemarks(e.target.value)}
                                rows={4}
                                disabled={!canEdit || mutating}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                            />
                        </div>
                        <button
                            onClick={saveSession}
                            disabled={!canInteractWithRows || selectedRows.length === 0}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                            <Save size={16} />
                            {saving ? "Saving..." : "Save Corrections"}
                        </button>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <History size={18} className="text-gray-500" />
                                <h2 className="text-base font-semibold text-gray-700">Recent Sessions</h2>
                            </div>
                            <span className="text-xs text-gray-400">{sessions.length}</span>
                        </div>
                        <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                            {sessionsLoading ? (
                                <div className="p-4 text-sm text-gray-400">Loading correction history...</div>
                            ) : sessionsError ? (
                                <div role="alert" className="p-4 text-sm text-red-700">
                                    <div>{sessionsError}</div>
                                    <button onClick={() => loadSessions(appliedFilters)} disabled={mutating} className="mt-2 font-semibold underline disabled:opacity-50">
                                        Retry history
                                    </button>
                                </div>
                            ) : sessions.length === 0 ? (
                                <div className="p-4 text-sm text-gray-400">No sessions</div>
                            ) : sessions.map((session) => (
                                <div key={session.sessionId}>
                                    <button
                                        onClick={() => setExpandedSessionId((id) => id === session.sessionId ? "" : session.sessionId)}
                                        className="w-full text-left p-4 hover:bg-gray-50"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="font-semibold text-sm text-gray-800 truncate">{session.sessionNo}</div>
                                                <div className="text-xs text-gray-500 truncate">{session.title}</div>
                                                <div className="text-xs text-gray-400 mt-1">
                                                    {displayDate(session.fromDate)} to {displayDate(session.toDate)}
                                                </div>
                                            </div>
                                            <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5 whitespace-nowrap">
                                                {session.itemCount}
                                            </span>
                                        </div>
                                    </button>
                                    {expandedSession?.sessionId === session.sessionId && (
                                        <div className="px-4 pb-4 space-y-2">
                                            {session.items.map((item) => {
                                                const historyStatus = getHistoryStatus(item);
                                                return (
                                                    <div key={item.correctionId} className="border border-gray-100 rounded-lg p-2.5">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="text-xs font-mono text-blue-600">{item.epfNo}</span>
                                                                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${historyStatus.cls}`}>
                                                                        {historyStatus.label}
                                                                    </span>
                                                                </div>
                                                                <div className="text-sm font-semibold text-gray-800 truncate">{item.employeeName}</div>
                                                                <div className="text-xs text-gray-500">
                                                                    {displayDate(item.workDate)} · {item.correctedCheckIn || "-"} / {item.correctedCheckOut || "-"}
                                                                </div>
                                                                <div className="mt-1 text-xs text-gray-400">
                                                                    {item.reasonType || "No reason"}
                                                                    {item.createdByName ? ` · ${item.createdByName}` : ""}
                                                                    {displayDateTime(item.createdAt) ? ` · ${displayDateTime(item.createdAt)}` : ""}
                                                                </div>
                                                            </div>
                                                            {item.isActive && canEdit && (
                                                                <button
                                                                    onClick={() => voidCorrection(item, session)}
                                                                    disabled={mutating}
                                                                    className="text-red-500 hover:text-red-700 disabled:opacity-40"
                                                                    title={`Void correction for EPF ${item.epfNo}`}
                                                                >
                                                                    <XCircle size={17} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
