import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Loader2,
    RefreshCw,
    Search,
    Shuffle,
    UserCheck,
    UserMinus,
    UserPlus,
    Users,
    X
} from "lucide-react";
import { leaveClerkAssignmentApi } from "../config/apiClient";

const EMPTY_SUMMARY = {
    totalEmployees: 0,
    assignedEmployees: 0,
    unassignedEmployees: 0,
    selectedClerkAssignedEmployees: 0,
    totalCount: 0,
    totalPages: 0,
    page: 1
};

const PAGE_SIZES = [25, 50, 100, 200];
const inputClass = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const clerkLabel = (clerk) => {
    if (!clerk) return "No Attendance Clerk selected";
    return `${clerk.epfNo || "No EPF"}${clerk.nameWithInitial ? ` - ${clerk.nameWithInitial}` : ""}`;
};

const fmtDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-LK", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
};

const actionLabel = (action) => ({
    Assign: "Assigned",
    Link: "Assigned",
    Unassign: "Removed",
    RemoveLink: "Removed",
    AutoAssign: "Auto assigned",
    AutoLink: "Auto assigned"
}[action] || action || "Updated");

const actionTone = (action) => {
    if (["Unassign", "RemoveLink"].includes(action)) return "border-amber-200 bg-amber-50 text-amber-700";
    if (["AutoAssign", "AutoLink"].includes(action)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
    return "border-blue-200 bg-blue-50 text-blue-700";
};

const workArea = (row) => {
    const values = [row.agmWorkSpaceName, row.dgmWorkSpaceName || row.serviceUnitName]
        .filter(Boolean)
        .filter((value, index, list) => list.indexOf(value) === index);
    return values.length > 0 ? values.join(" / ") : "Work area not available";
};

const FOCUSABLE_SELECTOR = [
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "a[href]",
    "[tabindex]:not([tabindex='-1'])"
].join(",");

function useModalDialog(onClose, canClose = true) {
    const dialogRef = useRef(null);
    const closeRef = useRef(onClose);
    const canCloseRef = useRef(canClose);

    useEffect(() => {
        closeRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        canCloseRef.current = canClose;
    }, [canClose]);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        const focusFrame = window.requestAnimationFrame(() => {
            const dialog = dialogRef.current;
            if (!dialog) return;
            const preferredFocus = dialog.querySelector("[data-autofocus]");
            (preferredFocus || dialog).focus();
        });

        document.body.style.overflow = "hidden";

        const onKeyDown = (event) => {
            const dialog = dialogRef.current;
            if (!dialog) return;

            if (event.key === "Escape" && canCloseRef.current) {
                event.preventDefault();
                closeRef.current();
                return;
            }

            if (event.key !== "Tab") return;
            const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR));
            if (focusable.length === 0) {
                event.preventDefault();
                dialog.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", onKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", onKeyDown);
            if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) {
                previousFocus.focus();
            }
        };
    }, []);

    return dialogRef;
}

function useAssignmentList({ status, clerkEmployeeId = "", enabled = true }) {
    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState(EMPTY_SUMMARY);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSizeState] = useState(25);
    const [searchInput, setSearchInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);
    const requestSequence = useRef(0);

    const load = useCallback(async () => {
        if (!enabled) {
            requestSequence.current += 1;
            setRows([]);
            setSummary(EMPTY_SUMMARY);
            setLoading(false);
            setError("");
            return;
        }

        const requestId = ++requestSequence.current;
        setLoading(true);
        setError("");

        try {
            const data = await leaveClerkAssignmentApi.getAssignments({
                clerkEmployeeId,
                status,
                keyword,
                page,
                pageSize
            });
            if (requestId !== requestSequence.current) return;

            const nextSummary = {
                totalEmployees: data?.totalEmployees || 0,
                assignedEmployees: data?.assignedEmployees || 0,
                unassignedEmployees: data?.unassignedEmployees || 0,
                selectedClerkAssignedEmployees: data?.selectedClerkAssignedEmployees || 0,
                totalCount: data?.totalCount || 0,
                totalPages: data?.totalPages || 0,
                page: data?.page || page
            };
            setSummary(nextSummary);

            const validPage = nextSummary.totalPages === 0 ? 1 : Math.min(page, nextSummary.totalPages);
            if (validPage !== page) {
                setRows([]);
                setPage(validPage);
                return;
            }
            setRows(Array.isArray(data?.items) ? data.items : []);
        } catch (err) {
            if (requestId !== requestSequence.current) return;
            setRows([]);
            setSummary(EMPTY_SUMMARY);
            setError(err.message);
        } finally {
            if (requestId === requestSequence.current) setLoading(false);
        }
    }, [clerkEmployeeId, enabled, keyword, page, pageSize, refreshKey, status]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => () => {
        requestSequence.current += 1;
    }, []);

    const submitSearch = (event) => {
        event.preventDefault();
        const nextKeyword = searchInput.trim();
        if (nextKeyword === keyword && page === 1) {
            setRefreshKey((value) => value + 1);
            return;
        }
        setKeyword(nextKeyword);
        setPage(1);
    };

    const clearSearch = () => {
        setSearchInput("");
        if (keyword || page !== 1) {
            setKeyword("");
            setPage(1);
        } else {
            setRefreshKey((value) => value + 1);
        }
    };

    const setPageSize = (value) => {
        setPageSizeState(value);
        setPage(1);
    };

    const refresh = () => setRefreshKey((value) => value + 1);
    const resetAndRefresh = () => {
        setPage(1);
        setRefreshKey((value) => value + 1);
    };

    return {
        rows,
        summary,
        page,
        pageSize,
        searchInput,
        keyword,
        loading,
        error,
        setPage,
        setPageSize,
        setSearchInput,
        submitSearch,
        clearSearch,
        refresh,
        resetAndRefresh
    };
}

export default function ClerkAssignmentsWorkspace() {
    const [clerks, setClerks] = useState([]);
    const [clerksLoading, setClerksLoading] = useState(true);
    const [selectedClerkId, setSelectedClerkId] = useState("");
    const [clerkSearch, setClerkSearch] = useState("");
    const [employeeView, setEmployeeView] = useState("assigned");
    const [unassignedSelected, setUnassignedSelected] = useState(() => new Set());
    const [teamSelected, setTeamSelected] = useState(() => new Set());
    const [reassignSelected, setReassignSelected] = useState(() => new Set());
    const [reassignOpen, setReassignOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [auditRows, setAuditRows] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditError, setAuditError] = useState("");
    const [pendingAction, setPendingAction] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const clerkRequestSequence = useRef(0);
    const auditRequestSequence = useRef(0);
    const clerkSearchRef = useRef(null);
    const clerkDetailHeadingRef = useRef(null);
    const restoreRosterFocusRef = useRef(false);

    const selectedClerk = useMemo(
        () => clerks.find((clerk) => clerk.employeeId === selectedClerkId) || null,
        [clerks, selectedClerkId]
    );

    const unassignedList = useAssignmentList({
        status: "unassigned",
        clerkEmployeeId: "",
        enabled: true
    });
    const teamList = useAssignmentList({
        status: "assigned",
        clerkEmployeeId: selectedClerkId,
        enabled: !!selectedClerkId
    });
    const reassignList = useAssignmentList({
        status: "all",
        clerkEmployeeId: selectedClerkId,
        enabled: reassignOpen && !!selectedClerkId
    });

    const loadClerks = useCallback(async () => {
        const requestId = ++clerkRequestSequence.current;
        setClerksLoading(true);
        try {
            const data = await leaveClerkAssignmentApi.getClerks();
            if (requestId !== clerkRequestSequence.current) return;
            const list = Array.isArray(data) ? data : [];
            setClerks(list);
            setSelectedClerkId((current) => list.some((clerk) => clerk.employeeId === current) ? current : "");
        } catch (err) {
            if (requestId !== clerkRequestSequence.current) return;
            setClerks([]);
            setSelectedClerkId("");
            setError(err.message);
        } finally {
            if (requestId === clerkRequestSequence.current) setClerksLoading(false);
        }
    }, []);

    const loadAudit = useCallback(async () => {
        const requestId = ++auditRequestSequence.current;
        setAuditLoading(true);
        setAuditError("");
        try {
            const data = await leaveClerkAssignmentApi.getAudit(20);
            if (requestId === auditRequestSequence.current) {
                setAuditRows(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            if (requestId === auditRequestSequence.current) {
                setAuditRows([]);
                setAuditError(err.message);
            }
        } finally {
            if (requestId === auditRequestSequence.current) setAuditLoading(false);
        }
    }, []);

    useEffect(() => {
        loadClerks();
        loadAudit();
    }, [loadAudit, loadClerks]);

    useEffect(() => {
        if (unassignedList.loading) setUnassignedSelected(new Set());
    }, [unassignedList.loading]);

    useEffect(() => {
        if (teamList.loading) setTeamSelected(new Set());
    }, [teamList.loading]);

    useEffect(() => {
        if (reassignList.loading) setReassignSelected(new Set());
    }, [reassignList.loading]);

    useEffect(() => {
        if (!selectedClerkId) setReassignOpen(false);
    }, [selectedClerkId]);

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            if (selectedClerkId) {
                clerkDetailHeadingRef.current?.focus();
            } else if (restoreRosterFocusRef.current) {
                restoreRosterFocusRef.current = false;
                clerkSearchRef.current?.focus();
            }
        });
        return () => window.cancelAnimationFrame(frame);
    }, [selectedClerkId]);

    const summary = unassignedList.summary;
    const filteredClerks = useMemo(() => {
        const term = clerkSearch.trim().toLowerCase();
        if (!term) return clerks;
        return clerks.filter((clerk) =>
            String(clerk.epfNo || "").toLowerCase().includes(term) ||
            String(clerk.nameWithInitial || "").toLowerCase().includes(term));
    }, [clerkSearch, clerks]);

    const unassignedRowsSelected = useMemo(
        () => unassignedList.rows.filter((row) => unassignedSelected.has(row.employeeId)),
        [unassignedList.rows, unassignedSelected]
    );
    const teamRowsSelected = useMemo(
        () => teamList.rows.filter((row) => teamSelected.has(row.employeeId)),
        [teamList.rows, teamSelected]
    );
    const reassignRowsSelected = useMemo(
        () => reassignList.rows.filter((row) => reassignSelected.has(row.employeeId) && row.leaveClerkEmployeeId !== selectedClerkId),
        [reassignList.rows, reassignSelected, selectedClerkId]
    );

    const refreshAll = () => {
        setError("");
        setMessage("");
        loadClerks();
        loadAudit();
        unassignedList.refresh();
        if (selectedClerkId) teamList.refresh();
        if (reassignOpen) reassignList.refresh();
    };

    const chooseClerk = (employeeId) => {
        if (saving) return;
        setError("");
        setMessage("");
        setSelectedClerkId(employeeId);
        setEmployeeView("assigned");
        setUnassignedSelected(new Set());
        setTeamSelected(new Set());
        unassignedList.setPage(1);
        teamList.setPage(1);
    };

    const clearTargetClerk = () => {
        if (saving) return;
        restoreRosterFocusRef.current = true;
        setSelectedClerkId("");
        setUnassignedSelected(new Set());
        setTeamSelected(new Set());
    };

    const queueAssign = (rows, source) => {
        if (!selectedClerk) {
            setError("Choose a target Attendance Clerk first.");
            return;
        }
        const eligible = rows.filter((row) => row.leaveClerkEmployeeId !== selectedClerkId);
        if (eligible.length === 0) {
            setError("The selected employees are already assigned to this Attendance Clerk.");
            return;
        }
        const movedCount = eligible.filter((row) => !!row.leaveClerkEmployeeId).length;
        setPendingAction({
            type: "assign",
            employeeIds: eligible.map((row) => row.employeeId),
            count: eligible.length,
            movedCount,
            newCount: eligible.length - movedCount,
            clerk: selectedClerk,
            clerkEmployeeId: selectedClerkId,
            source
        });
    };

    const queueUnassign = (rows) => {
        if (!selectedClerk) {
            setError("Choose a target Attendance Clerk first.");
            return;
        }
        const eligible = rows.filter((row) => !!row.leaveClerkEmployeeId);
        if (eligible.length === 0) {
            setError("Select assigned employees to remove from this Attendance Clerk.");
            return;
        }
        setPendingAction({
            type: "unassign",
            employeeIds: eligible.map((row) => row.employeeId),
            count: eligible.length,
            clerk: selectedClerk,
            clerkEmployeeId: selectedClerkId
        });
    };

    const queueAutomaticDistribution = () => {
        if (unassignedList.loading || unassignedList.error || summary.unassignedEmployees === 0 || clerks.length === 0) return;
        setPendingAction({
            type: "auto",
            count: summary.unassignedEmployees,
            clerkCount: clerks.length
        });
    };

    const runAction = async (action) => {
        if (saving) return;
        setSaving(true);
        setError("");
        setMessage("");
        try {
            const result = await action();
            setMessage(result?.message || "Clerk team updated.");
            setUnassignedSelected(new Set());
            setTeamSelected(new Set());
            setReassignSelected(new Set());
            unassignedList.resetAndRefresh();
            if (selectedClerkId) teamList.resetAndRefresh();
            loadClerks();
            loadAudit();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const confirmPendingAction = () => {
        const action = pendingAction;
        if (!action) return;
        setPendingAction(null);

        if (action.type === "assign") {
            runAction(() => leaveClerkAssignmentApi.assign({
                clerkEmployeeId: action.clerkEmployeeId,
                employeeIds: action.employeeIds
            }));
            return;
        }
        if (action.type === "unassign") {
            runAction(() => leaveClerkAssignmentApi.unassign({
                employeeIds: action.employeeIds,
                expectedClerkEmployeeId: action.clerkEmployeeId
            }));
            return;
        }
        runAction(() => leaveClerkAssignmentApi.autoAssign({ clerkEmployeeIds: [] }));
    };

    const openReassign = () => {
        if (!selectedClerk) {
            setError("Choose a target Attendance Clerk before moving employees.");
            return;
        }
        setReassignSelected(new Set());
        setReassignOpen(true);
    };

    const queueReassignFromModal = () => {
        if (reassignRowsSelected.length === 0) return;
        setReassignOpen(false);
        queueAssign(reassignRowsSelected, "search");
    };

    const busy = saving || clerksLoading || unassignedList.loading || teamList.loading;
    const pageError = error || (!selectedClerk ? unassignedList.error : "");

    return (
        <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Attendance administration</div>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Clerk Teams</h1>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                        Organise the employee teams each Attendance Clerk is responsible for reviewing.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
                    <button
                        type="button"
                        onClick={queueAutomaticDistribution}
                        disabled={saving || unassignedList.loading || clerks.length === 0 || summary.unassignedEmployees === 0}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Shuffle size={15} /> Distribute unassigned
                    </button>
                    <button
                        type="button"
                        onClick={refreshAll}
                        disabled={busy}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
                        Refresh data
                    </button>
                </div>
            </header>

            {pageError && (
                <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <div className="flex items-start gap-2"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><span>{pageError}</span></div>
                    <button type="button" onClick={() => { setError(""); if (!selectedClerk && unassignedList.error) unassignedList.refresh(); }} aria-label={!selectedClerk && unassignedList.error ? "Retry loading assignment data" : "Dismiss error"} className="shrink-0 text-red-500 hover:text-red-700">{!selectedClerk && unassignedList.error ? <RefreshCw size={16} /> : <X size={16} />}</button>
                </div>
            )}
            {message && (
                <div aria-live="polite" className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    <div className="flex items-start gap-2"><CheckCircle2 size={17} className="mt-0.5 shrink-0" /><span>{message}</span></div>
                    <button type="button" onClick={() => setMessage("")} aria-label="Dismiss message" className="shrink-0 text-emerald-600 hover:text-emerald-800"><X size={16} /></button>
                </div>
            )}
            {saving && (
                <div role="status" className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-700">
                    <Loader2 size={17} className="animate-spin" /> Updating Clerk Teams. Please wait...
                </div>
            )}

            <div aria-label="Clerk team coverage" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
                <Users size={16} className="text-slate-400" />
                <span className="font-semibold text-slate-800">Team coverage</span>
                <span><strong className="tabular-nums text-slate-900">{summary.assignedEmployees}</strong> of <strong className="tabular-nums text-slate-900">{unassignedList.loading && summary.totalEmployees === 0 ? "-" : summary.totalEmployees}</strong> employees assigned</span>
                <span aria-hidden="true" className="text-slate-300">•</span>
                <span className={summary.unassignedEmployees > 0 ? "font-medium text-amber-700" : ""}>{summary.unassignedEmployees} unassigned</span>
                <span aria-hidden="true" className="text-slate-300">•</span>
                <span>{clerksLoading ? "-" : clerks.length} active clerks</span>
            </div>

            <nav aria-label="Clerk Teams sections" className="flex gap-1 border-b border-slate-200">
                <button
                    id="attendance-clerks-tab"
                    type="button"
                    aria-current={!historyOpen ? "page" : undefined}
                    onClick={() => setHistoryOpen(false)}
                    className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${!historyOpen ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                >
                    Clerks
                </button>
                <button
                    id="assignment-history-tab"
                    type="button"
                    aria-current={historyOpen ? "page" : undefined}
                    onClick={() => setHistoryOpen(true)}
                    className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${historyOpen ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                >
                    Change History
                </button>
            </nav>

            <section id="attendance-clerks-panel" aria-label="Attendance Clerks" hidden={historyOpen} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-200">
                    <aside aria-label="Attendance Clerks" hidden={Boolean(selectedClerk)}>
                        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <h2 className="text-base font-semibold text-slate-900">Attendance Clerks</h2>
                                <p className="mt-1 text-sm text-slate-500">Select a clerk to review or update their assigned team.</p>
                            </div>
                            <div className="relative w-full lg:w-80">
                                <Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                                <input
                                    ref={clerkSearchRef}
                                    type="search"
                                    disabled={saving}
                                    value={clerkSearch}
                                    onChange={(event) => setClerkSearch(event.target.value)}
                                    placeholder="Search clerk EPF or name"
                                    aria-label="Find Attendance Clerk"
                                    className={`${inputClass} pl-9`}
                                />
                            </div>
                        </div>

                        <div className="hidden grid-cols-[110px_minmax(0,1fr)_150px_110px] border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:grid">
                            <span>EPF</span>
                            <span>Attendance Clerk</span>
                            <span>Assigned employees</span>
                            <span className="text-right">Action</span>
                        </div>

                        {clerksLoading ? (
                            <div role="status" className="divide-y divide-slate-100">
                                <span className="sr-only">Loading Attendance Clerks...</span>
                                {[1, 2, 3, 4, 5].map((item) => (
                                    <div key={item} className="grid h-14 grid-cols-[100px_minmax(0,1fr)_80px] items-center gap-3 px-5 sm:grid-cols-[110px_minmax(0,1fr)_150px_110px]">
                                        <span className="h-3 animate-pulse rounded bg-slate-100" />
                                        <span className="h-3 animate-pulse rounded bg-slate-100" />
                                        <span className="ml-auto h-3 w-6 animate-pulse rounded bg-slate-100" />
                                        <span className="ml-auto hidden h-7 w-16 animate-pulse rounded bg-slate-100 sm:block" />
                                    </div>
                                ))}
                            </div>
                        ) : filteredClerks.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-slate-500">
                                {clerks.length === 0 ? "No active Attendance Clerks found." : "No Attendance Clerks match this search."}
                            </div>
                        ) : (
                            <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
                                {filteredClerks.map((clerk) => {
                                    const isSelected = clerk.employeeId === selectedClerkId;
                                    return (
                                        <button
                                            key={clerk.employeeId}
                                            type="button"
                                            disabled={saving}
                                            aria-pressed={isSelected}
                                            onClick={() => chooseClerk(clerk.employeeId)}
                                            className={`grid min-h-14 w-full grid-cols-[100px_minmax(0,1fr)_80px] items-center gap-3 border-l-2 px-5 py-3 text-left transition sm:grid-cols-[110px_minmax(0,1fr)_150px_110px] disabled:cursor-not-allowed disabled:opacity-60 ${isSelected ? "border-blue-600 bg-blue-50/70" : "border-transparent hover:bg-slate-50"}`}
                                        >
                                            <span className="font-mono text-xs font-semibold text-slate-700">{clerk.epfNo || "-"}</span>
                                            <span className="truncate text-sm font-medium text-slate-800">{clerk.nameWithInitial || "Name unavailable"}</span>
                                            <span className="text-sm tabular-nums text-slate-600"><span className="sm:hidden">Assigned: </span>{clerk.assignedCount}<span className="sm:hidden"> employees</span></span>
                                            <span className={`hidden text-right text-xs font-semibold sm:block ${isSelected ? "text-blue-700" : "text-slate-500"}`}>{isSelected ? "Selected" : "Open team"}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </aside>

                    <div className="min-w-0" hidden={!selectedClerk}>
                        {!selectedClerk ? (
                            <div className="flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center">
                                <UserCheck size={28} className="text-slate-300" />
                                <h2 className="mt-3 text-sm font-semibold text-slate-800">Assigned team will appear here</h2>
                                <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">Select an Attendance Clerk above to continue.</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <h2 ref={clerkDetailHeadingRef} tabIndex={-1} className="truncate text-base font-semibold text-slate-900 outline-none">Manage assigned team</h2>
                                                <span className="font-mono text-xs font-semibold text-blue-700">EPF {selectedClerk.epfNo || "-"}</span>
                                            </div>
                                            <p className="mt-1 truncate text-sm font-medium text-slate-700">{selectedClerk.nameWithInitial || "Name unavailable"}</p>
                                            <p className="mt-1 text-xs text-slate-500">{selectedClerk.assignedCount} employee{selectedClerk.assignedCount === 1 ? "" : "s"} currently assigned to this team.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" onClick={clearTargetClerk} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={14} /> Back to clerk list</button>
                                        <button type="button" onClick={openReassign} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"><Search size={14} /> Find or move employees</button>
                                    </div>
                                </div>

                                <div className="border-b border-blue-100 bg-blue-50/60 px-5 py-3 text-xs leading-5 text-blue-800">
                                    Team assignment controls which attendance records this clerk may review. It does not move an employee between AGM, DGM or Service Units.
                                </div>

                                <div role="tablist" aria-label="Employee assignment view" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-3 pt-3 sm:px-5">
                                    <button id="assigned-employees-tab" type="button" role="tab" aria-selected={employeeView === "assigned"} aria-controls="assigned-employees-panel" onClick={() => setEmployeeView("assigned")} disabled={saving} className={`shrink-0 whitespace-nowrap rounded-t-lg border border-b-0 px-4 py-2.5 text-sm font-semibold disabled:opacity-40 ${employeeView === "assigned" ? "border-slate-200 bg-white text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>Assigned employees <span className="ml-1 text-xs">({teamList.summary.totalCount})</span></button>
                                    <button id="unassigned-employees-tab" type="button" role="tab" aria-selected={employeeView === "unassigned"} aria-controls="unassigned-employees-panel" onClick={() => setEmployeeView("unassigned")} disabled={saving} className={`shrink-0 whitespace-nowrap rounded-t-lg border border-b-0 px-4 py-2.5 text-sm font-semibold disabled:opacity-40 ${employeeView === "unassigned" ? "border-slate-200 bg-white text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>Add unassigned employees <span className="ml-1 text-xs">({summary.unassignedEmployees})</span></button>
                                </div>

                                <div id={`${employeeView}-employees-panel`} role="tabpanel" aria-labelledby={`${employeeView}-employees-tab`} className="min-w-0">
                                    {employeeView === "unassigned" ? (
                                        <EmployeePanel
                                            tone="amber"
                                            title="Unassigned employees"
                                            description={`Select employees to assign to EPF ${selectedClerk.epfNo}.`}
                                            list={unassignedList}
                                            selected={unassignedSelected}
                                            setSelected={setUnassignedSelected}
                                            actionLabel="Assign selected"
                                            actionIcon={UserPlus}
                                            onAction={() => queueAssign(unassignedRowsSelected, "unassigned")}
                                            actionDisabled={saving || unassignedRowsSelected.length === 0}
                                            emptyTitle="No unassigned employees"
                                            emptyDescription="Every eligible employee currently has an Attendance Clerk."
                                            disabled={saving}
                                        />
                                    ) : (
                                        <EmployeePanel
                                            tone="blue"
                                            title="Assigned employees"
                                            description={`Employees currently assigned to EPF ${selectedClerk.epfNo}.`}
                                            list={teamList}
                                            selected={teamSelected}
                                            setSelected={setTeamSelected}
                                            actionLabel="Remove selected"
                                            actionIcon={UserMinus}
                                            onAction={() => queueUnassign(teamRowsSelected)}
                                            actionDisabled={saving || teamRowsSelected.length === 0}
                                            emptyTitle="No assigned employees"
                                            emptyDescription="This Attendance Clerk does not have any assigned employees."
                                            destructive
                                            disabled={saving}
                                        />
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </section>

            <section id="change-history-panel" hidden={!historyOpen} aria-labelledby="change-history-title" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
                    <div>
                        <h2 id="change-history-title" className="text-base font-semibold text-slate-900">Change History</h2>
                        <p className="mt-1 text-xs text-slate-500">Latest recorded clerk team changes.</p>
                    </div>
                    <button type="button" onClick={loadAudit} disabled={auditLoading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><RefreshCw size={14} className={auditLoading ? "animate-spin" : ""} /> Refresh history</button>
                </div>

                <div aria-label="Recent clerk team changes" className="max-h-96 overflow-y-auto">
                    {auditLoading ? (
                        <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" /> Loading change history...</div>
                    ) : auditError ? (
                        <div role="alert" className="m-4 flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
                            <span>{auditError}</span>
                            <button type="button" onClick={loadAudit} className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-100"><RefreshCw size={14} /> Retry</button>
                        </div>
                    ) : auditRows.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-500">No clerk team changes have been recorded.</div>
                    ) : auditRows.map((row) => <AuditRow key={row.id} row={row} />)}
                </div>
            </section>

            {reassignOpen && selectedClerk && (
                <ReassignDialog
                    clerk={selectedClerk}
                    clerkEmployeeId={selectedClerkId}
                    list={reassignList}
                    selected={reassignSelected}
                    setSelected={setReassignSelected}
                    onClose={() => setReassignOpen(false)}
                    onAssign={queueReassignFromModal}
                    saving={saving}
                />
            )}

            {pendingAction && (
                <ConfirmationDialog
                    action={pendingAction}
                    onCancel={() => setPendingAction(null)}
                    onConfirm={confirmPendingAction}
                />
            )}
        </div>
    );
}

function EmptyState({ icon: Icon, title, description }) {
    return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
            <Icon size={28} className="mx-auto text-slate-300" />
            <div className="mt-3 text-sm font-semibold text-slate-700">{title}</div>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-slate-500">{description}</p>
        </div>
    );
}

function SelectionCheckbox({ indeterminate = false, ...props }) {
    const checkboxRef = useRef(null);

    useEffect(() => {
        if (checkboxRef.current) checkboxRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return <input ref={checkboxRef} type="checkbox" {...props} />;
}

function EmployeePanel({
    tone,
    title,
    description,
    list,
    selected,
    setSelected,
    actionLabel: panelActionLabel,
    actionIcon: ActionIcon,
    onAction,
    actionDisabled,
    emptyTitle,
    emptyDescription,
    destructive = false,
    disabled = false
}) {
    const allVisibleSelected = list.rows.length > 0 && list.rows.every((row) => selected.has(row.employeeId));
    const someVisibleSelected = list.rows.some((row) => selected.has(row.employeeId));
    const start = list.summary.totalCount === 0 ? 0 : ((list.summary.page - 1) * list.pageSize) + 1;
    const end = Math.min(list.summary.totalCount, start + list.rows.length - 1);
    const toneClass = tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";

    const toggleRow = (employeeId) => {
        if (disabled) return;
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(employeeId)) next.delete(employeeId);
            else next.add(employeeId);
            return next;
        });
    };

    const togglePage = () => {
        if (disabled) return;
        setSelected((current) => {
            const next = new Set(current);
            if (allVisibleSelected) list.rows.forEach((row) => next.delete(row.employeeId));
            else list.rows.forEach((row) => next.add(row.employeeId));
            return next;
        });
    };

    return (
        <article aria-busy={list.loading} className="overflow-hidden bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                        <p className="mt-1 text-xs text-slate-500">{description}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${toneClass}`}>{list.summary.totalCount}</span>
                </div>
            </div>

            <div className="space-y-3 border-b border-slate-100 px-5 py-4">
                <form onSubmit={list.submitSearch} className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                        <Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                        <input
                            type="search"
                            disabled={disabled}
                            value={list.searchInput}
                            onChange={(event) => list.setSearchInput(event.target.value)}
                            placeholder="Search EPF, name or unit"
                            aria-label={`Search ${title}`}
                            className={`${inputClass} pl-9`}
                        />
                    </div>
                    <button type="submit" disabled={disabled || list.loading} className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-800 px-3 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-40">Search</button>
                </form>
                {list.keyword && (
                    <div className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
                        <span className="truncate">Filtered by “{list.keyword}”</span>
                        <button type="button" onClick={list.clearSearch} disabled={disabled} className="font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-40">Clear</button>
                    </div>
                )}
                {selected.size > 0 && <div className="flex min-h-10 flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2 sm:flex-row sm:items-center sm:justify-between">
                    <div aria-live="polite" className="text-xs text-slate-600">
                        <strong>{selected.size}</strong> selected on this page
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {selected.size > 0 && <button type="button" onClick={() => setSelected(new Set())} disabled={disabled} className="h-8 rounded-md px-2.5 text-xs font-semibold text-slate-600 hover:bg-white disabled:opacity-40">Clear selection</button>}
                        <button
                            type="button"
                            onClick={onAction}
                            disabled={disabled || actionDisabled || list.loading}
                            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 ${destructive ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"}`}
                        >
                            <ActionIcon size={14} /> {panelActionLabel}
                        </button>
                    </div>
                </div>}
            </div>

            {list.error ? (
                <div role="alert" className="m-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{list.error}</div>
            ) : list.loading ? (
                <div role="status" className="space-y-2 p-3">
                    <span className="sr-only">Loading employees...</span>
                    {[1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}
                </div>
            ) : list.rows.length === 0 ? (
                <div className="p-3"><EmptyState icon={Users} title={emptyTitle} description={list.keyword ? "No employees match the current search." : emptyDescription} /></div>
            ) : (
                <>
                    <div className="hidden md:block">
                        <table className="w-full table-fixed text-sm">
                            <caption className="sr-only">{title}</caption>
                            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                <tr>
                                    <th scope="col" className="w-12 px-3 py-3 text-left">
                                        <SelectionCheckbox disabled={disabled} checked={allVisibleSelected} indeterminate={someVisibleSelected && !allVisibleSelected} onChange={togglePage} aria-label={`Select all employees on this page in ${title}`} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40" />
                                    </th>
                                    <th scope="col" className="w-[48%] px-3 py-3 text-left">Employee</th>
                                    <th scope="col" className="px-3 py-3 text-left">Work area</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {list.rows.map((row) => (
                                    <tr key={row.employeeId} className={selected.has(row.employeeId) ? "bg-blue-50/60" : "hover:bg-slate-50"}>
                                        <td className="px-3 py-3 align-top"><input type="checkbox" disabled={disabled} checked={selected.has(row.employeeId)} onChange={() => toggleRow(row.employeeId)} aria-label={`Select EPF ${row.epfNo || "unknown"}`} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40" /></td>
                                        <td className="px-3 py-3 align-top">
                                            <div className="truncate font-semibold text-slate-800">{row.nameWithInitial || "Name unavailable"}</div>
                                            <div className="mt-1 truncate text-xs text-slate-500"><span className="font-mono text-blue-700">EPF {row.epfNo || "-"}</span>{row.designationName ? ` · ${row.designationName}` : ""}</div>
                                        </td>
                                        <td className="px-3 py-3 align-top text-xs leading-5 text-slate-600">{workArea(row)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="divide-y divide-slate-100 md:hidden">
                        {list.rows.map((row) => (
                            <label key={row.employeeId} className={`flex cursor-pointer items-start gap-3 p-3 ${selected.has(row.employeeId) ? "bg-blue-50" : ""}`}>
                                <input type="checkbox" disabled={disabled} checked={selected.has(row.employeeId)} onChange={() => toggleRow(row.employeeId)} className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-slate-800">{row.nameWithInitial || "Name unavailable"}</span>
                                    <span className="mt-0.5 block text-xs text-slate-500"><span className="font-mono text-blue-700">EPF {row.epfNo || "-"}</span>{row.designationName ? ` · ${row.designationName}` : ""}</span>
                                    <span className="mt-1 block text-xs leading-5 text-slate-500">{workArea(row)}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </>
            )}

            <div className="flex flex-col gap-3 border-t border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>{start}-{end} of {list.summary.totalCount}</span>
                    <label className="inline-flex items-center gap-1.5">Rows
                        <select value={list.pageSize} disabled={disabled} onChange={(event) => list.setPageSize(Number(event.target.value))} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-40">
                            {PAGE_SIZES.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                    </label>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => list.setPage(Math.max(1, list.page - 1))} disabled={disabled || list.loading || list.page <= 1} aria-label="Previous page" className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={15} /></button>
                    <span className="min-w-20 text-center text-xs text-slate-500">Page {list.summary.totalPages === 0 ? 0 : list.summary.page} / {list.summary.totalPages}</span>
                    <button type="button" onClick={() => list.setPage(Math.min(list.summary.totalPages || 1, list.page + 1))} disabled={disabled || list.loading || list.summary.totalPages === 0 || list.page >= list.summary.totalPages} aria-label="Next page" className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronRight size={15} /></button>
                </div>
            </div>
        </article>
    );
}

function ReassignDialog({ clerk, clerkEmployeeId, list, selected, setSelected, onClose, onAssign, saving }) {
    const dialogRef = useModalDialog(onClose, !saving);
    const eligibleRows = list.rows.filter((row) => row.leaveClerkEmployeeId !== clerkEmployeeId);
    const allEligibleSelected = eligibleRows.length > 0 && eligibleRows.every((row) => selected.has(row.employeeId));
    const someEligibleSelected = eligibleRows.some((row) => selected.has(row.employeeId));
    const start = list.summary.totalCount === 0 ? 0 : ((list.summary.page - 1) * list.pageSize) + 1;
    const end = Math.min(list.summary.totalCount, start + list.rows.length - 1);

    const toggleRow = (row) => {
        if (saving || row.leaveClerkEmployeeId === clerkEmployeeId) return;
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(row.employeeId)) next.delete(row.employeeId);
            else next.add(row.employeeId);
            return next;
        });
    };

    const toggleEligiblePage = () => {
        if (saving) return;
        setSelected((current) => {
            const next = new Set(current);
            if (allEligibleSelected) eligibleRows.forEach((row) => next.delete(row.employeeId));
            else eligibleRows.forEach((row) => next.add(row.employeeId));
            return next;
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-6">
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="reassign-title" aria-describedby="reassign-description" tabIndex={-1} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl outline-none">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
                    <div>
                        <h2 id="reassign-title" className="text-lg font-bold text-slate-900">Find or move employees</h2>
                        <p id="reassign-description" className="mt-1 text-sm text-slate-500">Destination: <strong className="text-blue-700">{clerkLabel(clerk)}</strong>. Employees already with this Attendance Clerk cannot be selected.</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={saving} aria-label="Close employee search" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
                </div>

                <div className="space-y-3 border-b border-slate-100 p-4">
                    <form onSubmit={list.submitSearch} className="flex gap-2">
                        <div className="relative min-w-0 flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input type="search" data-autofocus disabled={saving} aria-label="Search all employees for reassignment" value={list.searchInput} onChange={(event) => list.setSearchInput(event.target.value)} placeholder="Search EPF, name, unit or current Attendance Clerk" className={`${inputClass} pl-9`} /></div>
                        <button type="submit" disabled={saving || list.loading} className="h-10 rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-40">Search</button>
                    </form>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                        <label className="inline-flex cursor-pointer items-center gap-2"><SelectionCheckbox disabled={saving || eligibleRows.length === 0} checked={allEligibleSelected} indeterminate={someEligibleSelected && !allEligibleSelected} onChange={toggleEligiblePage} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40" /> Select eligible employees on this page</label>
                        <span><strong>{selected.size}</strong> selected</span>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {list.error ? (
                        <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{list.error}</div>
                    ) : list.loading ? (
                        <div role="status" className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" /> Loading employees...</div>
                    ) : list.rows.length === 0 ? (
                        <div className="p-4"><EmptyState icon={Users} title="No employees found" description="Try a different EPF, employee name, unit or Attendance Clerk." /></div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {list.rows.map((row) => {
                                const alreadyTarget = row.leaveClerkEmployeeId === clerkEmployeeId;
                                const currentClerk = row.leaveClerkEmployeeId
                                    ? (row.leaveClerkEpfNo ? `EPF ${row.leaveClerkEpfNo}${row.leaveClerkName ? ` - ${row.leaveClerkName}` : ""}` : "Unknown or inactive Attendance Clerk")
                                    : "Unassigned";
                                return (
                                    <label key={row.employeeId} className={`flex flex-wrap items-start gap-3 p-4 ${alreadyTarget || saving ? "cursor-not-allowed bg-slate-50 opacity-60" : "cursor-pointer hover:bg-slate-50"} ${selected.has(row.employeeId) ? "bg-blue-50" : ""}`}>
                                        <input type="checkbox" disabled={saving || alreadyTarget} checked={!alreadyTarget && selected.has(row.employeeId)} onChange={() => toggleRow(row)} className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold text-slate-800">{row.nameWithInitial || "Name unavailable"}</span>
                                            <span className="mt-0.5 block text-xs text-slate-500"><span className="font-mono text-blue-700">EPF {row.epfNo || "-"}</span>{row.designationName ? ` · ${row.designationName}` : ""}</span>
                                            <span className="mt-1 block text-xs text-slate-500">{workArea(row)}</span>
                                        </span>
                                        <span className={`w-full pl-7 text-left text-xs sm:w-auto sm:max-w-[240px] sm:shrink-0 sm:pl-0 sm:text-right ${alreadyTarget ? "font-semibold text-blue-700" : "text-slate-500"}`}>{alreadyTarget ? "Already with target Attendance Clerk" : `Current: ${currentClerk}`}</span>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{start}-{end} of {list.summary.totalCount}</span>
                        <button type="button" onClick={() => list.setPage(Math.max(1, list.page - 1))} disabled={saving || list.loading || list.page <= 1} aria-label="Previous employee search page" className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 disabled:opacity-40"><ChevronLeft size={15} /></button>
                        <span>Page {list.summary.totalPages === 0 ? 0 : list.summary.page} / {list.summary.totalPages}</span>
                        <button type="button" onClick={() => list.setPage(Math.min(list.summary.totalPages || 1, list.page + 1))} disabled={saving || list.loading || list.summary.totalPages === 0 || list.page >= list.summary.totalPages} aria-label="Next employee search page" className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 disabled:opacity-40"><ChevronRight size={15} /></button>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Cancel</button>
                        <button type="button" onClick={onAssign} disabled={saving || selected.size === 0} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"><UserPlus size={16} /> Assign or move {selected.size}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ConfirmationDialog({ action, onCancel, onConfirm }) {
    const dialogRef = useModalDialog(onCancel);
    let title;
    let description;
    let confirmLabel;
    let tone;
    let Icon;

    if (action.type === "assign") {
        title = `Assign ${action.count} employee${action.count === 1 ? "" : "s"}?`;
        description = `${action.newCount} currently unassigned and ${action.movedCount} currently assigned elsewhere will be assigned to ${clerkLabel(action.clerk)}.`;
        confirmLabel = action.movedCount > 0 ? "Confirm assignment and move" : "Confirm assignment";
        tone = "bg-blue-600 hover:bg-blue-700";
        Icon = UserPlus;
    } else if (action.type === "unassign") {
        title = `Remove ${action.count} employee${action.count === 1 ? "" : "s"} from this Attendance Clerk?`;
        description = `These employees will become unassigned and will no longer be in ${clerkLabel(action.clerk)}'s team.`;
        confirmLabel = "Remove assignment";
        tone = "bg-amber-600 hover:bg-amber-700";
        Icon = UserMinus;
    } else {
        title = `Distribute ${action.count} unassigned employee${action.count === 1 ? "" : "s"}?`;
        description = `Only currently unassigned employees will be distributed across all ${action.clerkCount} active Attendance Clerks. This is organisation-wide and does not follow AGM, DGM or Service Unit boundaries. Existing assignments will not change.`;
        confirmLabel = "Confirm distribution";
        tone = "bg-emerald-600 hover:bg-emerald-700";
        Icon = Shuffle;
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-action-title" aria-describedby="confirm-action-description" tabIndex={-1} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl outline-none">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700"><Icon size={19} /></span>
                    <div>
                        <h2 id="confirm-action-title" className="text-lg font-bold text-slate-900">{title}</h2>
                        <p id="confirm-action-description" className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                    </div>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" data-autofocus onClick={onCancel} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                    <button type="button" onClick={onConfirm} className={`h-10 rounded-lg px-4 text-sm font-semibold text-white ${tone}`}>{confirmLabel}</button>
                </div>
            </div>
        </div>
    );
}

function AuditRow({ row }) {
    const from = row.previousClerkEpfNo || "Unassigned";
    const to = row.newClerkEpfNo || "Unassigned";
    return (
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${actionTone(row.action)}`}>{actionLabel(row.action)}</span>
                    <span className="font-mono text-xs font-semibold text-slate-700">Employee EPF {row.employeeEpfNo || "-"}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">Attendance Clerk: {from} → {to}</div>
            </div>
            <div className="shrink-0 text-xs text-slate-400 sm:text-right">
                <div>{fmtDateTime(row.changedAt)}</div>
                <div className="mt-0.5">by {row.changedByName || row.changedByEpfNo || "Unknown user"}</div>
            </div>
        </div>
    );
}
