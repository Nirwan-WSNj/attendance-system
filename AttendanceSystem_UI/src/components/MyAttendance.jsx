import React, { useEffect, useState, useCallback, useRef } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { reportApi } from "../config/apiClient";

const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const now = new Date();
const today = formatLocalDate(now);
const firstOfMonth = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));

const formatWorkHours = (hours) => {
    if (hours == null) return "";
    const mins = Math.round(Number(hours) * 60);
    if (!Number.isFinite(mins) || mins <= 0) return "";
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const statusLabel = (status) => ({
    OnTime: "On Time",
    HalfShortLeave: "Half Short Leave",
    ShortLeave: "Short Leave",
    HalfDay: "Half Day",
    MissingIn: "Missing In",
    FullDayLeave: "Full Day Leave"
}[status] ?? status ?? "Absent");

const statusClass = (status) => {
    if (status === "OnTime") return "bg-green-100 text-green-700";
    if (status === "Late") return "bg-yellow-100 text-yellow-700";
    if (status === "HalfShortLeave") return "bg-orange-100 text-orange-700";
    if (status === "ShortLeave") return "bg-red-100 text-red-600";
    if (status === "HalfDay") return "bg-rose-100 text-rose-700";
    if (status === "MissingIn") return "bg-amber-100 text-amber-700";
    if (status === "FullDayLeave") return "bg-slate-100 text-slate-700";
    if (status === "Holiday") return "bg-blue-100 text-blue-700";
    return "bg-red-100 text-red-700";
};

const statusColor = (status) => {
    if (status === "OnTime") return "#10b981";
    if (status === "Late") return "#f59e0b";
    if (status === "HalfShortLeave") return "#f97316";
    if (status === "ShortLeave") return "#ef4444";
    if (status === "HalfDay") return "#e11d48";
    if (status === "MissingIn") return "#f59e0b";
    if (status === "FullDayLeave") return "#475569";
    if (status === "Holiday") return "#3b82f6";
    if (status === "NotSynced") return "#f59e0b";
    return "#94a3b8";
};

export default function MyAttendance() {
    const epfNo = localStorage.getItem("epfNo") || "";
    const decoded = JSON.parse(localStorage.getItem("decodedToken") || "{}");
    const fullName = decoded?.fullName || decoded?.name || epfNo;

    const [summary, setSummary] = useState(null);
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [draftFrom, setDraftFrom] = useState(firstOfMonth);
    const [draftTo, setDraftTo] = useState(today);
    const [appliedRange, setAppliedRange] = useState({ from: firstOfMonth, to: today });
    const requestSequence = useRef(0);

    const load = useCallback(async (from, to) => {
        const requestId = ++requestSequence.current;

        if (!epfNo) {
            if (requestId === requestSequence.current) {
                setError("EPF number not found. Please re-login.");
                setSummary(null);
                setRecords([]);
                setLoading(false);
            }
            return;
        }

        setLoading(true);
        setError("");
        try {
            const data = await reportApi.getEmployee(epfNo, from, to);
            if (requestId === requestSequence.current) {
                setSummary(data);
                setRecords(Array.isArray(data?.dailyRecords) ? data.dailyRecords : []);
            }
        } catch (err) {
            if (requestId === requestSequence.current) {
                setError(err?.message || "Unable to load attendance records.");
                setSummary(null);
                setRecords([]);
            }
        } finally {
            if (requestId === requestSequence.current) {
                setLoading(false);
            }
        }
    }, [epfNo]);

    useEffect(() => {
        load(appliedRange.from, appliedRange.to);

        return () => {
            requestSequence.current += 1;
        };
    }, [appliedRange, load]);

    const handleSearch = (event) => {
        event.preventDefault();

        if (!draftFrom || !draftTo) {
            setError("Please select both From and To dates.");
            return;
        }

        if (draftFrom > draftTo) {
            setError("From date cannot be after To date.");
            return;
        }

        if (draftTo > today) {
            setError("To date cannot be after today.");
            return;
        }

        setError("");
        if (draftFrom === appliedRange.from && draftTo === appliedRange.to) {
            load(draftFrom, draftTo);
            return;
        }

        setAppliedRange({ from: draftFrom, to: draftTo });
    };

    const presentDays = summary?.presentDays ?? records.filter(r => !["Absent", "FullDayLeave"].includes(r.status)).length;
    const lateDays = summary?.lateDays ?? records.filter(r => ["Late", "HalfShortLeave", "ShortLeave", "HalfDay"].includes(r.status)).length;
    const absentDays = summary?.absentDays ?? records.filter(r => ["Absent", "FullDayLeave"].includes(r.status)).length;
    const attendanceRate = summary?.attendanceRate ?? 0;
    const totalWorkHours = summary?.totalWorkHours ?? records.reduce((sum, r) => sum + (Number(r.workHours) || 0), 0);
    const averageWorkHours = summary?.averageWorkHours ?? (presentDays > 0 ? totalWorkHours / presentDays : 0);
    const workHourTrend = records
        .filter(r => r.date)
        .map(r => ({
            date: String(r.date).slice(5),
            hours: Number(r.workHours) || 0,
            status: r.status
        }));
    const statusSummary = Object.values(records.reduce((map, record) => {
        const key = record.status || "Absent";
        if (!map[key]) map[key] = { status: key, label: statusLabel(key), count: 0, color: statusColor(key) };
        map[key].count += 1;
        return map;
    }, {}));
    const maxStatusCount = Math.max(...statusSummary.map(s => s.count), 1);

    return (
        <div className="p-6 space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">My Attendance</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                    {summary?.name ?? fullName} - EPF: <span className="font-mono font-semibold text-gray-700">{epfNo}</span>
                </p>
            </div>

            <form noValidate onSubmit={handleSearch} className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-4">
                <div>
                    <label htmlFor="my-attendance-from" className="block text-xs font-medium text-gray-500 mb-1">From</label>
                    <input
                        id="my-attendance-from"
                        type="date"
                        value={draftFrom}
                        max={draftTo && draftTo < today ? draftTo : today}
                        onChange={e => setDraftFrom(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label htmlFor="my-attendance-to" className="block text-xs font-medium text-gray-500 mb-1">To</label>
                    <input
                        id="my-attendance-to"
                        type="date"
                        value={draftTo}
                        min={draftFrom}
                        max={today}
                        onChange={e => setDraftTo(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {loading ? "Searching..." : "Search"}
                </button>
            </form>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500">
                    <p className="text-xs text-gray-500 uppercase">Present Days</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{presentDays}</p>
                </div>
                <div className="bg-white rounded-xl shadow p-4 border-l-4 border-yellow-500">
                    <p className="text-xs text-gray-500 uppercase">Late Arrivals</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{lateDays}</p>
                </div>
                <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-500">
                    <p className="text-xs text-gray-500 uppercase">Absent Days</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{absentDays}</p>
                </div>
                <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
                    <p className="text-xs text-gray-500 uppercase">Attendance</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{attendanceRate}%</p>
                </div>
                <div className="bg-white rounded-xl shadow p-4 border-l-4 border-indigo-500">
                    <p className="text-xs text-gray-500 uppercase">Avg Hours</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{formatWorkHours(averageWorkHours) || "0h"}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <div className="xl:col-span-2 bg-white rounded-xl shadow p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-semibold text-gray-700">My Work Hours</h2>
                        <span className="text-sm text-gray-400">{formatWorkHours(totalWorkHours) || "0h"} total</span>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={workHourTrend} barSize={10}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip formatter={value => formatWorkHours(value) || "0h"} />
                            <Bar dataKey="hours" name="Work Hours" radius={[3, 3, 0, 0]}>
                                {workHourTrend.map((entry, index) => (
                                    <Cell key={index} fill={["Absent", "FullDayLeave"].includes(entry.status) ? "#cbd5e1" : "#3b82f6"} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl shadow p-5">
                    <h2 className="text-base font-semibold text-gray-700 mb-4">My Status Breakdown</h2>
                    <div className="space-y-3">
                        {statusSummary.length === 0 ? (
                            <p className="text-sm text-gray-400">No status data</p>
                        ) : statusSummary.map(item => (
                            <div key={item.status}>
                                <div className="flex items-center justify-between text-sm mb-1">
                                    <span className="text-gray-600">{item.label}</span>
                                    <span className="font-semibold text-gray-700">{item.count}</span>
                                </div>
                                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                                    <div
                                        className="h-full rounded-full"
                                        style={{ width: `${Math.max(6, item.count / maxStatusCount * 100)}%`, background: item.color }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-gray-700">Attendance Records</h2>
                    <span className="text-sm text-gray-400">{records.length} records</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                                <th className="px-4 py-3 text-left">Date</th>
                                <th className="px-4 py-3 text-left">Check In</th>
                                <th className="px-4 py-3 text-left">Check Out</th>
                                <th className="px-4 py-3 text-left">Work Hours</th>
                                <th className="px-4 py-3 text-left">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                            ) : records.length === 0 ? (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No records found</td></tr>
                            ) : records.map((r, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-4 py-2.5 font-medium text-gray-700">{r.date ? String(r.date) : ""}</td>
                                    <td className="px-4 py-2.5">
                                        {r.checkIn
                                            ? <span className={`font-medium ${r.status === "OnTime" ? "text-green-600" : "text-yellow-600"}`}>{r.checkIn}</span>
                                            : null}
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-600">{r.checkOut ?? ""}</td>
                                    <td className="px-4 py-2.5 text-gray-600">{formatWorkHours(r.workHours)}</td>
                                    <td className="px-4 py-2.5">
                                        <span className={`px-2 py-0.5 rounded-full text-xs ${statusClass(r.status)}`}>
                                            {statusLabel(r.status)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
