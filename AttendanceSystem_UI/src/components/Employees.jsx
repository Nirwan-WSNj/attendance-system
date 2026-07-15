import React, { useEffect, useState } from "react";
import { attendanceApi, reportApi, get } from "../config/apiClient";
import { fmtHours } from "../config/utils";

const today = new Date().toISOString().slice(0, 10);

const firstOfMonth = () => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
};

const formatMinutes = (mins) => {
    if (mins == null || mins <= 0) return "—";
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

export default function Employees() {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);
    const [empSummary, setEmpSummary] = useState(null);
    const [empRecords, setEmpRecords] = useState([]);
    const [empLoading, setEmpLoading] = useState(false);
    const [empError, setEmpError] = useState("");
    const [empOTByDate, setEmpOTByDate] = useState({});
    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo] = useState(today);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError("");
            try {
                const data = await attendanceApi.getEmployees();
                setEmployees(Array.isArray(data) ? data : []);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const loadEmpRecords = async (epfNo) => {
        setEmpLoading(true);
        setEmpError("");
        setEmpSummary(null);
        setEmpRecords([]);
        setEmpOTByDate({});
        try {
            const [data, otAll] = await Promise.all([
                reportApi.getEmployee(epfNo, from, to),
                get(`/Report/ot-summary?from=${from}&to=${to}`).catch(() => [])
            ]);
            setEmpSummary(data);
            setEmpRecords(Array.isArray(data?.dailyRecords) ? data.dailyRecords : []);

            // Build date → OT map for this employee only
            const empOT = (Array.isArray(otAll) ? otAll : []).find(e => e.epfNo === epfNo);
            const byDate = {};
            (empOT?.otRecords ?? []).forEach(r => {
                byDate[r.date] = { morningOT: r.morningOT, eveningOT: r.eveningOT, totalOT: r.totalOT };
            });
            setEmpOTByDate(byDate);
        } catch (err) {
            setEmpError(err.message);
        } finally {
            setEmpLoading(false);
        }
    };

    const handleSelect = (emp) => {
        setSelected(emp);
        if (emp?.epfNo) loadEmpRecords(emp.epfNo);
    };

    const handleRangeSearch = () => {
        if (selected?.epfNo) loadEmpRecords(selected.epfNo);
    };

    const filtered = search
        ? employees.filter(e => (e.epfNo ?? "").toLowerCase().includes(search.trim().toLowerCase()))
        : employees;

    const presentDays = empSummary?.presentDays ?? 0;
    const lateDays = empSummary?.lateDays ?? 0;
    const absentDays = empSummary?.absentDays ?? 0;
    const totalMins = empSummary?.totalWorkHours == null ? null : Math.round(empSummary.totalWorkHours * 60);

    return (
        <div className="p-6 space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">Employees</h1>
                <p className="text-sm text-gray-500 mt-0.5">Click any employee to view their attendance history</p>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>
            )}

            <div className="flex gap-6">
                <div className="w-80 flex-shrink-0">
                    <div className="bg-white rounded-xl shadow overflow-hidden">
                        <div className="p-3 border-b border-gray-100">
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search by EPF no..."
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                            />
                        </div>
                        <div className="overflow-y-auto max-h-[calc(100vh-240px)]">
                            {loading ? (
                                <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
                            ) : filtered.length === 0 ? (
                                <div className="p-6 text-center text-gray-400 text-sm">No employees found</div>
                            ) : filtered.map((emp, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSelect(emp)}
                                    className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition ${
                                        selected?.epfNo === emp.epfNo ? "bg-blue-50 border-l-4 border-l-blue-600" : ""
                                    }`}
                                >
                                    <p className="text-sm font-medium text-gray-800 truncate">
                                        {emp.nameWithInitial || (`${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() || "-")}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        EPF: <span className="font-mono">{emp.epfNo ?? "-"}</span>
                                    </p>
                                    {emp.designationName && (
                                        <p className="text-xs text-gray-400 mt-0.5 truncate">{emp.designationName}</p>
                                    )}
                                </button>
                            ))}
                        </div>
                        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400 border-t border-gray-100">
                            {filtered.length} of {employees.length} employees
                        </div>
                    </div>
                </div>

                <div className="flex-1 space-y-4">
                    {!selected ? (
                        <div className="bg-white rounded-xl shadow p-12 text-center text-gray-400">
                            <p className="text-sm">Select an employee from the list to view attendance records</p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-white rounded-xl shadow p-5 flex items-center gap-5">
                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                                    {(selected.firstName ?? selected.nameWithInitial ?? "?")[0].toUpperCase()}
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-800">
                                        {empSummary?.name ?? selected.nameWithInitial ?? `${selected.firstName ?? ""} ${selected.lastName ?? ""}`.trim()}
                                    </h2>
                                    <p className="text-sm text-gray-500">EPF: <span className="font-mono font-semibold text-gray-700">{selected.epfNo}</span></p>
                                    {(empSummary?.designation ?? selected.designationName) && <p className="text-xs text-gray-400">{empSummary?.designation ?? selected.designationName}</p>}
                                    {(empSummary?.serviceUnit ?? selected.serviceUnitName) && <p className="text-xs text-gray-400">{empSummary?.serviceUnit ?? selected.serviceUnitName}</p>}
                                </div>
                            </div>

                            <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                                    <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                                    <input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <button onClick={handleRangeSearch}
                                    className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                                    Search
                                </button>
                            </div>

                            <div className="grid grid-cols-4 gap-3">
                                {[
                                    { label: "Present", value: presentDays, color: "border-green-500" },
                                    { label: "Late", value: lateDays, color: "border-yellow-500" },
                                    { label: "Absent", value: absentDays, color: "border-red-500" },
                                    { label: "Total Work", value: formatMinutes(totalMins), color: "border-blue-500" }
                                ].map(c => (
                                    <div key={c.label} className={`bg-white rounded-xl shadow p-3 border-l-4 ${c.color}`}>
                                        <p className="text-xs text-gray-500 uppercase">{c.label}</p>
                                        <p className="text-xl font-bold text-gray-800 mt-1">{c.value}</p>
                                    </div>
                                ))}
                            </div>

                            {empError && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{empError}</div>
                            )}

                            <div className="bg-white rounded-xl shadow overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                                    <h2 className="text-base font-semibold text-gray-700">Attendance Records</h2>
                                    <span className="text-sm text-gray-400">{empRecords.length} records</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                                                <th className="px-4 py-3 text-left">Date</th>
                                                <th className="px-4 py-3 text-left">Check In</th>
                                                <th className="px-4 py-3 text-left">Early OT</th>
                                                <th className="px-4 py-3 text-left">Arrival Status</th>
                                                <th className="px-4 py-3 text-left">Check Out</th>
                                                <th className="px-4 py-3 text-left">Late OT</th>
                                                <th className="px-4 py-3 text-left">Total OT</th>
                                                <th className="px-4 py-3 text-left">Work Hours</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {empLoading ? (
                                                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                                            ) : empRecords.length === 0 ? (
                                                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No records in this range</td></tr>
                                            ) : empRecords.map((r, i) => {
                                                const isAbsent = r.status === "Absent" || (!r.checkIn && !r.checkOut);
                                                const ot = empOTByDate[r.date] ?? null;
                                                const showOT = (v) => (!v || v === "00:00") ? null : <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700 font-medium">{v}</span>;
                                                return (
                                                <tr key={i} className="hover:bg-gray-50">
                                                    <td className="px-4 py-2.5 font-medium text-gray-700">{r.date ? String(r.date) : "-"}</td>
                                                    <td className="px-4 py-2.5">
                                                        {r.checkIn
                                                            ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">{r.checkIn}</span>
                                                            : null}
                                                    </td>
                                                    <td className="px-4 py-2.5">{showOT(ot?.morningOT)}</td>
                                                    <td className="px-4 py-2.5">
                                                        {!isAbsent && (
                                                            <span className={`px-2 py-0.5 rounded-full text-xs ${statusClass(r.status)}`}>
                                                                {statusLabel(r.status)}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        {r.checkOut
                                                            ? <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-medium">{r.checkOut}</span>
                                                            : !isAbsent
                                                                ? <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-500 font-medium">No Out Punch</span>
                                                                : <span className="text-gray-300">—</span>
                                                        }
                                                    </td>
                                                    <td className="px-4 py-2.5">{showOT(ot?.eveningOT)}</td>
                                                    <td className="px-4 py-2.5">{showOT(ot?.totalOT)}</td>
                                                    <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtHours(r.workHours)}</td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
