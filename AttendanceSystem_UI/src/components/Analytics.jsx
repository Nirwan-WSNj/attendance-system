import React, { useState, useEffect, useCallback } from "react";
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from "recharts";
import { get } from "../config/apiClient";

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
const STATUS_COLORS = { onTime: "#10b981", late: "#f59e0b", halfShortLeave: "#f97316", shortLeave: "#ef4444", halfDay: "#e11d48", noCheckIn: "#6b7280" };

function KpiCard({ label, value, sub, color = "border-blue-500" }) {
    return (
        <div className={`bg-white rounded-xl shadow p-4 border-l-4 ${color}`}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
    );
}

function SectionHeader({ title, subtitle }) {
    return (
        <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-700">{title}</h2>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
    );
}

// ── Trend Analysis ───────────────────────────────────────────────────────────
function TrendSection() {
    const [days, setDays] = useState(30);
    const [countData, setCountData] = useState([]);
    const [statusData, setStatusData] = useState([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [counts, statuses] = await Promise.all([
                get(`/Attendance/chart/daily-count?days=${days}`),
                get(`/Attendance/chart/arrival-status?days=${days}`)
            ]);
            setCountData(Array.isArray(counts) ? counts : []);
            setStatusData(Array.isArray(statuses) ? statuses : []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [days]);

    useEffect(() => { load(); }, [load]);

    const trendLine = countData.map(d => ({
        date: d.date ? String(d.date).slice(5) : "",
        present: d.count || 0,
    }));

    const statusPie = statusData.map(s => ({
        name: s.label || s.key,
        value: s.count,
        color: STATUS_COLORS[s.key] ?? "#6b7280"
    }));

    const totalStatus = statusPie.reduce((a, b) => a + b.value, 0);

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <SectionHeader title="Attendance Trends" subtitle="Daily present / absent / late over time" />
                <div className="flex gap-2">
                    {[14, 30, 90].map(d => (
                        <button key={d} onClick={() => setDays(d)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${days === d ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
                            {d}d
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="bg-white rounded-xl shadow p-12 text-center text-gray-400">Loading…</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Daily present count area */}
                    <div className="lg:col-span-2 bg-white rounded-xl shadow p-5">
                        <h3 className="text-sm font-semibold text-gray-600 mb-4">Daily Present Count</h3>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={trendLine}>
                                <defs>
                                    <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip />
                                <Area type="monotone" dataKey="present" stroke="#3b82f6" fill="url(#rateGrad)" strokeWidth={2} dot={false} name="Present" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Arrival status donut-style list */}
                    <div className="bg-white rounded-xl shadow p-5">
                        <h3 className="text-sm font-semibold text-gray-600 mb-4">Arrival Status Breakdown</h3>
                        <div className="space-y-2">
                            {statusPie.map((s, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
                                    <div className="flex-1">
                                        <div className="flex justify-between text-xs mb-0.5">
                                            <span className="text-gray-700">{s.name}</span>
                                            <span className="text-gray-500 font-medium">{s.value}</span>
                                        </div>
                                        <div className="bg-gray-100 rounded-full h-1.5">
                                            <div className="h-1.5 rounded-full" style={{ background: s.color, width: totalStatus > 0 ? `${(s.value / totalStatus * 100).toFixed(0)}%` : "0%" }} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Daily headcount bar */}
                    <div className="lg:col-span-3 bg-white rounded-xl shadow p-5">
                        <h3 className="text-sm font-semibold text-gray-600 mb-4">Daily Headcount</h3>
                        <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={trendLine} barSize={8}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip />
                                <Bar dataKey="present" name="Present" fill="#10b981" radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── AGM-wise Heatmap ─────────────────────────────────────────────────────────
function AgmHeatmap() {
    const [from, setFrom] = useState(daysAgo(30));
    const [to, setTo] = useState(today);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [expanded, setExpanded] = useState({});

    const load = async () => {
        setLoading(true); setError("");
        try { setData(await get(`/Report/agm-wise?from=${from}&to=${to}`)); }
        catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    const rateColor = (rate) => {
        if (rate >= 90) return "bg-green-500";
        if (rate >= 80) return "bg-green-400";
        if (rate >= 70) return "bg-yellow-400";
        if (rate >= 60) return "bg-orange-400";
        return "bg-red-400";
    };

    const rateMeaning = (rate) => {
        if (rate >= 90) return "Excellent";
        if (rate >= 80) return "Good";
        if (rate >= 70) return "Watch";
        if (rate >= 60) return "Low";
        return "Needs attention";
    };

    const unitTip = (unit) =>
        `${unit.unitName}: ${unit.attendanceRate}% attendance, ${unit.registeredEmployees} employees, ${unit.totalPresent ?? 0} present, ${unit.totalAbsent ?? 0} absent, ${unit.totalLate ?? 0} late`;

    const heatmapLegend = [
        ["90-100%", "Excellent", "bg-green-500", "Healthy attendance"],
        ["80-89%", "Good", "bg-green-400", "Normal range"],
        ["70-79%", "Watch", "bg-yellow-400", "Check if it continues"],
        ["60-69%", "Low", "bg-orange-400", "Attendance is weak"],
        ["Below 60%", "Needs attention", "bg-red-400", "High issue area"],
    ];

    const toggle = (k) => setExpanded(p => ({ ...p, [k]: !p[k] }));

    // Flatten all units for bar chart
    const agmBars = data.map(u => ({ name: u.unitName, rate: u.attendanceRate, avgHours: u.averageWorkHours }));

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <SectionHeader title="AGM-wise Attendance Heatmap" subtitle="Green means higher attendance. Orange/red means the unit needs checking." />
                <div className="flex items-end gap-3">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">From</label>
                        <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">To</label>
                        <input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <button onClick={load} disabled={loading}
                        className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        {loading ? "…" : "Load"}
                    </button>
                </div>
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">⚠️ {error}</div>}

            {data.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                        {heatmapLegend.map(([range, label, color, help]) => (
                            <div key={label} className="bg-white border border-blue-100 rounded-lg p-2">
                                <div className="flex items-center gap-2">
                                    <span className={`w-4 h-4 rounded ${color}`} />
                                    <span className="font-semibold text-gray-800">{label}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{range} - {help}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {data.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* AGM bar comparison */}
                    <div className="bg-white rounded-xl shadow p-5">
                        <h3 className="text-sm font-semibold text-gray-600 mb-4">Attendance Rate by AGM Division</h3>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={agmBars} layout="vertical" barSize={16}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                                <Tooltip formatter={v => `${v}%`} />
                                <Bar dataKey="rate" name="Attendance %" radius={[0, 4, 4, 0]}>
                                    {agmBars.map((entry, i) => (
                                        <Cell key={i} fill={entry.rate >= 80 ? "#10b981" : entry.rate >= 60 ? "#f59e0b" : "#ef4444"} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Heatmap grid */}
                    <div className="bg-white rounded-xl shadow p-5">
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-600">Attendance Heatmap</h3>
                                <p className="text-xs text-gray-400 mt-0.5">Each row shows exact attendance %, employee count, and status meaning.</p>
                            </div>
                            <span className="text-xs text-gray-400 whitespace-nowrap">{from} to {to}</span>
                        </div>
                        <div className="space-y-2">
                            {data.map((agm, i) => (
                                <div key={i}>
                                    <div
                                        title={unitTip(agm)}
                                        onClick={() => agm.children?.length && toggle(agm.unitName)}
                                        className={`flex items-center gap-2 p-2 rounded-lg ${agm.children?.length ? "cursor-pointer hover:bg-gray-50" : ""}`}
                                    >
                                        <div className={`w-10 h-6 rounded text-white text-xs font-bold flex items-center justify-center ${rateColor(agm.attendanceRate)}`}>
                                            {agm.attendanceRate}%
                                        </div>
                                        <span className="text-sm font-medium text-gray-800 flex-1 truncate">{agm.unitName}</span>
                                        <span className="text-xs font-medium text-gray-500 w-24 text-right">{rateMeaning(agm.attendanceRate)}</span>
                                        <span className="text-xs text-gray-400">{agm.registeredEmployees} emp</span>
                                        {agm.children?.length > 0 && (
                                            <span className="text-xs text-gray-400">{expanded[agm.unitName] ? "▲" : "▼"}</span>
                                        )}
                                    </div>
                                    {expanded[agm.unitName] && agm.children?.map((dgm, j) => (
                                        <div key={j} title={unitTip(dgm)} className="ml-4 flex items-center gap-2 p-1.5">
                                            <div className={`w-8 h-5 rounded text-white text-xs font-bold flex items-center justify-center ${rateColor(dgm.attendanceRate)}`}>
                                                {dgm.attendanceRate}%
                                            </div>
                                            <span className="text-xs text-gray-600 flex-1 truncate">{dgm.unitName}</span>
                                            <span className="text-xs text-gray-400 w-20 text-right">{rateMeaning(dgm.attendanceRate)}</span>
                                            <span className="text-xs text-gray-400">{dgm.registeredEmployees} emp</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                        {/* Legend */}
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                            <span className="font-medium text-gray-600">Rate key:</span>
                            {heatmapLegend.map(([range, label, color]) => (
                                <span key={label} className="flex items-center gap-1">
                                    <span className={`w-3 h-3 rounded ${color} inline-block`} /> {range} {label}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Period Comparison ────────────────────────────────────────────────────────
function PeriodComparison() {
    const [periodA, setPeriodA] = useState({ from: daysAgo(60), to: daysAgo(31) });
    const [periodB, setPeriodB] = useState({ from: daysAgo(30), to: today });
    const [summaryA, setSummaryA] = useState([]);
    const [summaryB, setSummaryB] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const load = async () => {
        setLoading(true); setError("");
        try {
            const [a, b] = await Promise.all([
                get(`/Report/daily-summary?from=${periodA.from}&to=${periodA.to}`),
                get(`/Report/daily-summary?from=${periodB.from}&to=${periodB.to}`),
            ]);
            setSummaryA(Array.isArray(a) ? a : []);
            setSummaryB(Array.isArray(b) ? b : []);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    const avg = (arr, field) => arr.length === 0 ? 0 : Math.round(arr.reduce((s, r) => s + (r[field] ?? 0), 0) / arr.length * 10) / 10;

    const kpiA = { rate: avg(summaryA, "attendanceRate"), late: avg(summaryA, "late"), hours: avg(summaryA, "averageWorkHours") };
    const kpiB = { rate: avg(summaryB, "attendanceRate"), late: avg(summaryB, "late"), hours: avg(summaryB, "averageWorkHours") };

    const delta = (a, b) => {
        const d = +(b - a).toFixed(1);
        return d === 0 ? "—" : d > 0 ? `+${d}` : `${d}`;
    };
    const deltaColor = (a, b, higherIsBetter = true) => {
        const d = b - a;
        if (d === 0) return "text-gray-400";
        return (d > 0) === higherIsBetter ? "text-green-600" : "text-red-600";
    };

    return (
        <div className="space-y-5">
            <SectionHeader title="Period-over-Period Comparison" subtitle="Compare two time periods side by side" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[{ label: "Period A", period: periodA, set: setPeriodA }, { label: "Period B", period: periodB, set: setPeriodB }].map(({ label, period, set }) => (
                    <div key={label} className="bg-white rounded-xl shadow p-4">
                        <h3 className="text-sm font-semibold text-gray-600 mb-3">{label}</h3>
                        <div className="flex gap-3 flex-wrap">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">From</label>
                                <input type="date" value={period.from} max={period.to}
                                    onChange={e => set(p => ({ ...p, from: e.target.value }))}
                                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">To</label>
                                <input type="date" value={period.to} min={period.from} max={today}
                                    onChange={e => set(p => ({ ...p, to: e.target.value }))}
                                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <button onClick={load} disabled={loading}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? "Comparing…" : "Compare Periods"}
            </button>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">⚠️ {error}</div>}

            {(summaryA.length > 0 || summaryB.length > 0) && (
                <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { label: "Avg Attendance Rate", a: `${kpiA.rate}%`, b: `${kpiB.rate}%`, delta: delta(kpiA.rate, kpiB.rate), dc: deltaColor(kpiA.rate, kpiB.rate) },
                            { label: "Avg Late / Day", a: kpiA.late, b: kpiB.late, delta: delta(kpiA.late, kpiB.late), dc: deltaColor(kpiA.late, kpiB.late, false) },
                            { label: "Avg Work Hours / Day", a: `${kpiA.hours}h`, b: `${kpiB.hours}h`, delta: delta(kpiA.hours, kpiB.hours), dc: deltaColor(kpiA.hours, kpiB.hours) },
                        ].map(m => (
                            <div key={m.label} className="bg-white rounded-xl shadow p-4">
                                <p className="text-xs text-gray-500 mb-2">{m.label}</p>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-xs text-gray-400">Period A</p>
                                        <p className="text-lg font-bold text-gray-700">{m.a}</p>
                                    </div>
                                    <div className={`text-base font-bold ${m.dc}`}>{m.delta}</div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400">Period B</p>
                                        <p className="text-lg font-bold text-gray-800">{m.b}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-white rounded-xl shadow p-5">
                        <h3 className="text-sm font-semibold text-gray-600 mb-4">Daily Attendance Rate Overlay</h3>
                        <ResponsiveContainer width="100%" height={200}>
                            <LineChart>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="index" type="number" tick={false} />
                                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} />
                                <Tooltip formatter={v => `${v}%`} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Line data={summaryA.map((r, i) => ({ index: i, rate: r.attendanceRate }))}
                                    dataKey="rate" stroke="#94a3b8" strokeWidth={2} dot={false} name="Period A" />
                                <Line data={summaryB.map((r, i) => ({ index: i, rate: r.attendanceRate }))}
                                    dataKey="rate" stroke="#3b82f6" strokeWidth={2} dot={false} name="Period B" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main Analytics Page ──────────────────────────────────────────────────────
const TABS = [
    { key: "trends",  label: "Trends",            icon: "📈" },
    { key: "heatmap", label: "AGM Heatmap",        icon: "🗺️" },
    { key: "compare", label: "Period Comparison",  icon: "⚖️" },
];

export default function Analytics() {
    const [activeTab, setActiveTab] = useState("trends");

    return (
        <div className="p-6 space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
                <p className="text-sm text-gray-500 mt-0.5">Visual insights into attendance patterns</p>
            </div>

            <div className="flex gap-2 border-b border-gray-200">
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setActiveTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition ${
                            activeTab === t.key
                                ? "border-blue-600 text-blue-600 bg-blue-50"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                        }`}>
                        <span>{t.icon}</span> {t.label}
                    </button>
                ))}
            </div>

            <div>
                {activeTab === "trends"  && <TrendSection />}
                {activeTab === "heatmap" && <AgmHeatmap />}
                {activeTab === "compare" && <PeriodComparison />}
            </div>
        </div>
    );
}
