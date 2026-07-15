import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    CheckSquare,
    RefreshCw,
    Search,
    Shuffle,
    Square,
    UserMinus,
    UserPlus
} from "lucide-react";
import { leaveClerkAssignmentApi } from "../config/apiClient";

const labelClass = "block text-xs font-medium text-gray-500 mb-1";
const controlClass = "w-full h-10 px-3 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

const TABS = [
    { key: "unassigned", label: "Unassigned Employees" },
    { key: "assigned", label: "Selected Clerk's Employees" },
    { key: "all", label: "All Employees" }
];

const fmtDateTime = (value) => {
    if (!value) return "";
    return new Date(value).toLocaleString("en-LK", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
};

const clerkLabel = (clerk) => {
    if (!clerk) return "Select clerk";
    const name = clerk.nameWithInitial ? ` - ${clerk.nameWithInitial}` : "";
    return `${clerk.epfNo}${name}`;
};

const actionLabel = (action) => ({
    Assign: "Assign",
    Unassign: "Unassign",
    AutoAssign: "Auto Assign",
    Link: "Assign",
    RemoveLink: "Unassign",
    AutoLink: "Auto Assign"
}[action] || action || "Update");

export default function LeaveClerkAssignments() {
    const [clerks, setClerks] = useState([]);
    const [selectedClerkId, setSelectedClerkId] = useState("");
    const [status, setStatus] = useState("assigned");
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [summary, setSummary] = useState({
        totalEmployees: 0,
        assignedEmployees: 0,
        unassignedEmployees: 0,
        selectedClerkAssignedEmployees: 0,
        totalCount: 0,
        totalPages: 0,
        page: 1
    });
    const [rows, setRows] = useState([]);
    const [selected, setSelected] = useState(() => new Set());
    const [auditRows, setAuditRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const selectedClerk = useMemo(
        () => clerks.find((clerk) => clerk.employeeId === selectedClerkId),
        [clerks, selectedClerkId]
    );

    const selectedEmployeeIds = useMemo(() => Array.from(selected), [selected]);
    const tabCounts = useMemo(() => ({
        unassigned: summary.unassignedEmployees,
        assigned: selectedClerkId ? summary.selectedClerkAssignedEmployees : summary.assignedEmployees,
        all: summary.totalEmployees
    }), [selectedClerkId, summary]);

    const loadClerks = useCallback(async () => {
        const data = await leaveClerkAssignmentApi.getClerks();
        const list = Array.isArray(data) ? data : [];
        setClerks(list);
        setSelectedClerkId((current) => current || list[0]?.employeeId || "");
    }, []);

    const loadAudit = useCallback(async () => {
        const data = await leaveClerkAssignmentApi.getAudit(20);
        setAuditRows(Array.isArray(data) ? data : []);
    }, []);

    const loadAssignments = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await leaveClerkAssignmentApi.getAssignments({
                clerkEmployeeId: selectedClerkId,
                status,
                keyword,
                page,
                pageSize
            });
            setRows(data?.items || []);
            setSummary({
                totalEmployees: data?.totalEmployees || 0,
                assignedEmployees: data?.assignedEmployees || 0,
                unassignedEmployees: data?.unassignedEmployees || 0,
                selectedClerkAssignedEmployees: data?.selectedClerkAssignedEmployees || 0,
                totalCount: data?.totalCount || 0,
                totalPages: data?.totalPages || 0,
                page: data?.page || page
            });
            setSelected(new Set());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [keyword, page, pageSize, selectedClerkId, status]);

    useEffect(() => {
        loadClerks().catch((err) => setError(err.message));
        loadAudit().catch(() => {});
    }, [loadClerks, loadAudit]);

    useEffect(() => {
        loadAssignments();
    }, [loadAssignments]);

    const refreshAll = async () => {
        await Promise.all([loadClerks(), loadAssignments(), loadAudit()]);
    };

    const setTab = (nextStatus) => {
        setStatus(nextStatus);
        setPage(1);
    };

    const toggleRow = (employeeId) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(employeeId)) next.delete(employeeId);
            else next.add(employeeId);
            return next;
        });
    };

    const toggleAll = () => {
        setSelected((prev) => {
            if (rows.length > 0 && prev.size === rows.length) return new Set();
            return new Set(rows.map((row) => row.employeeId));
        });
    };

    const runAction = async (action) => {
        setSaving(true);
        setError("");
        setMessage("");
        try {
            const result = await action();
            setMessage(result?.message || "Clerk assign updated.");
            await refreshAll();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const assignSelected = () => {
        if (!selectedClerkId) {
            setError("Select a leave clerk.");
            return;
        }
        if (selectedEmployeeIds.length === 0) {
            setError("Select employees to assign.");
            return;
        }
        const ok = window.confirm(`Assign ${selectedEmployeeIds.length} employee(s) to ${clerkLabel(selectedClerk)}?`);
        if (!ok) return;
        runAction(() => leaveClerkAssignmentApi.assign({
            clerkEmployeeId: selectedClerkId,
            employeeIds: selectedEmployeeIds
        }));
    };

    const unassignSelected = () => {
        if (selectedEmployeeIds.length === 0) {
            setError("Select employees to unassign.");
            return;
        }
        const ok = window.confirm(`Unassign ${selectedEmployeeIds.length} employee(s) from their leave clerk?`);
        if (!ok) return;
        runAction(() => leaveClerkAssignmentApi.unassign({ employeeIds: selectedEmployeeIds }));
    };

    const autoAssign = () => {
        if (clerks.length === 0) {
            setError("No active leave clerks found.");
            return;
        }
        const ok = window.confirm(`${summary.unassignedEmployees} unassigned employees will be distributed among ${clerks.length} active clerks. Continue?`);
        if (!ok) return;
        runAction(() => leaveClerkAssignmentApi.autoAssign({ clerkEmployeeIds: [] }));
    };

    return (
        <div className="p-6 space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">Assign Clerks</h1>
                <p className="text-sm text-gray-500 mt-0.5">Manage employee assignments for leave clerks</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,360px)_1fr_auto] gap-3 items-end">
                    <div>
                        <label className={labelClass}>Leave Clerk</label>
                        <select
                            value={selectedClerkId}
                            onChange={(e) => {
                                setSelectedClerkId(e.target.value);
                                setPage(1);
                            }}
                            className={controlClass}
                        >
                            {clerks.length === 0 && <option value="">No active clerks</option>}
                            {clerks.map((clerk) => (
                                <option key={clerk.employeeId} value={clerk.employeeId}>
                                    {clerkLabel(clerk)} ({clerk.assignedCount})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Search</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={keyword}
                                onChange={(e) => {
                                    setKeyword(e.target.value);
                                    setPage(1);
                                }}
                                placeholder="EPF, name, unit, clerk"
                                className={controlClass}
                            />
                            <button
                                onClick={loadAssignments}
                                disabled={loading}
                                className="h-10 inline-flex items-center justify-center gap-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                            >
                                <Search size={16} />
                                Search
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={refreshAll}
                        disabled={loading || saving}
                        className="h-10 inline-flex items-center justify-center gap-2 px-4 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
                    >
                        <RefreshCw size={16} />
                        Refresh
                    </button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Metric label="Employees" value={summary.totalEmployees} />
                    <Metric label="Assigned Employees" value={summary.assignedEmployees} />
                    <Metric label="Unassigned Employees" value={summary.unassignedEmployees} />
                    <Metric label="Selected Clerk" value={summary.selectedClerkAssignedEmployees} />
                </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>}
            {message && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{message}</div>}

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-4 border-b border-gray-100 space-y-4">
                    <div>
                        <h2 className="text-base font-semibold text-gray-700">Employee List</h2>
                        <p className="text-xs text-gray-400">
                            {selectedEmployeeIds.length} selected
                            {selectedClerk ? ` | ${clerkLabel(selectedClerk)}` : ""}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">View</div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                            {TABS.map((tab) => (
                                <button
                                    key={tab.key}
                                    onClick={() => setTab(tab.key)}
                                    className={`flex min-h-10 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm font-medium ${
                                        status === tab.key
                                            ? "bg-blue-600 border-blue-600 text-white"
                                            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                                    }`}
                                >
                                    <span className="min-w-0 whitespace-normal leading-snug">{tab.label}</span>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                                        status === tab.key
                                            ? "bg-white/20 text-white"
                                            : "bg-gray-100 text-gray-500"
                                    }`}>
                                        {tabCounts[tab.key] ?? 0}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Actions</div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                            <button
                                onClick={assignSelected}
                                disabled={saving || selectedEmployeeIds.length === 0 || !selectedClerkId}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                            >
                                <UserPlus size={16} className="shrink-0" />
                                <span className="leading-snug">Assign to Selected Clerk</span>
                            </button>
                            <button
                                onClick={unassignSelected}
                                disabled={saving || selectedEmployeeIds.length === 0}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                            >
                                <UserMinus size={16} className="shrink-0" />
                                <span className="leading-snug">Remove Clerk Assignment</span>
                            </button>
                            <button
                                onClick={autoAssign}
                                disabled={saving || summary.unassignedEmployees === 0 || clerks.length === 0}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                            >
                                <Shuffle size={16} className="shrink-0" />
                                <span className="leading-snug">Auto Assign</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1050px] text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                                <th className="px-3 py-3 text-left w-10">
                                    <button onClick={toggleAll} title="Select all" className="text-blue-600">
                                        {rows.length > 0 && selected.size === rows.length ? <CheckSquare size={18} /> : <Square size={18} />}
                                    </button>
                                </th>
                                <th className="px-3 py-3 text-left">EPF</th>
                                <th className="px-3 py-3 text-left">Employee</th>
                                <th className="px-3 py-3 text-left">Unit</th>
                                <th className="px-3 py-3 text-left">Current Clerk</th>
                                <th className="px-3 py-3 text-left">Assignment Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading...</td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                                        {status === "assigned" && selectedClerk
                                            ? "No employees assigned to the selected clerk"
                                            : status === "unassigned" && summary.unassignedEmployees === 0
                                                ? "All employees are assigned to leave clerks"
                                            : "No employees found"}
                                    </td>
                                </tr>
                            ) : rows.map((row) => (
                                <tr key={row.employeeId} className={selected.has(row.employeeId) ? "bg-blue-50/50" : "hover:bg-gray-50"}>
                                    <td className="px-3 py-2.5">
                                        <button onClick={() => toggleRow(row.employeeId)} title="Select row" className="text-blue-600">
                                            {selected.has(row.employeeId) ? <CheckSquare size={18} /> : <Square size={18} />}
                                        </button>
                                    </td>
                                    <td className="px-3 py-2.5 font-mono text-xs text-blue-600 whitespace-nowrap">{row.epfNo || "-"}</td>
                                    <td className="px-3 py-2.5 min-w-[220px]">
                                        <div className="font-semibold text-gray-800 truncate">{row.nameWithInitial || "Unknown"}</div>
                                        <div className="text-xs text-gray-400 truncate">{row.designationName || ""}</div>
                                    </td>
                                    <td className="px-3 py-2.5 min-w-[220px] text-xs text-gray-500">
                                        <div className="truncate">{row.agmWorkSpaceName || ""}</div>
                                        <div className="truncate">{row.dgmWorkSpaceName || row.serviceUnitName || ""}</div>
                                    </td>
                                    <td className="px-3 py-2.5 min-w-[180px]">
                                        {row.leaveClerkEpfNo ? (
                                            <>
                                                <div className="font-mono text-xs text-gray-700">{row.leaveClerkEpfNo}</div>
                                                <div className="text-xs text-gray-400 truncate">{row.leaveClerkName || ""}</div>
                                            </>
                                        ) : (
                                            <span className="text-xs text-gray-400">Unassigned</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${
                                            row.assignmentStatus === "Assigned"
                                                ? "bg-green-50 text-green-700 border-green-200"
                                                : "bg-amber-50 text-amber-700 border-amber-200"
                                        }`}>
                                            {row.assignmentStatus}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="px-4 py-3 border-t border-gray-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                        <label className="inline-flex items-center gap-2">
                            <span>Rows</span>
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setPage(1);
                                }}
                                className="h-9 px-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {[25, 50, 100, 200].map((value) => (
                                    <option key={value} value={value}>{value}</option>
                                ))}
                            </select>
                        </label>
                        <span>Showing {rows.length} of {summary.totalCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage((value) => Math.max(1, value - 1))}
                            disabled={loading || page <= 1}
                            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                        >
                            Prev
                        </button>
                        <span className="text-sm text-gray-500">
                            Page {summary.totalPages === 0 ? 0 : summary.page} of {summary.totalPages}
                        </span>
                        <button
                            onClick={() => setPage((value) => Math.min(summary.totalPages || 1, value + 1))}
                            disabled={loading || summary.totalPages === 0 || page >= summary.totalPages}
                            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-gray-700">Assign History</h2>
                    <span className="text-xs text-gray-400">{auditRows.length}</span>
                </div>
                <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                    {auditRows.length === 0 ? (
                        <div className="p-4 text-sm text-gray-400">No assign history</div>
                    ) : auditRows.map((row) => (
                        <div key={row.id} className="p-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-800">
                                    {actionLabel(row.action)} | EPF {row.employeeEpfNo || "-"}
                                </div>
                                <div className="text-xs text-gray-500">
                                    {row.previousClerkEpfNo || "Unassigned"} to {row.newClerkEpfNo || "Unassigned"}
                                </div>
                            </div>
                            <div className="text-xs text-gray-400 sm:text-right">
                                <div>{fmtDateTime(row.changedAt)}</div>
                                <div>{row.changedByName || row.changedByEpfNo || ""}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function Metric({ label, value }) {
    return (
        <div className="border border-gray-200 rounded-lg px-3 py-3 bg-gray-50">
            <div className="text-xs font-medium text-gray-500">{label}</div>
            <div className="text-xl font-bold text-gray-800 mt-1">{value}</div>
        </div>
    );
}
