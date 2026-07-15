import React, { useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    Database,
    RefreshCw,
    ShieldCheck,
    Users,
    XCircle
} from "lucide-react";
import { systemHealthApi } from "../config/apiClient";

const today = new Date().toISOString().slice(0, 10);

const statusStyles = {
    OK: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Warning: "bg-amber-50 text-amber-700 border-amber-200",
    Error: "bg-red-50 text-red-700 border-red-200",
    Unknown: "bg-slate-50 text-slate-600 border-slate-200"
};

const statusIcons = {
    OK: CheckCircle2,
    Warning: AlertTriangle,
    Error: XCircle,
    Unknown: AlertTriangle
};

const fmtDateTime = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString("en-LK");
};

const statusClass = (status) => statusStyles[status] || statusStyles.Unknown;

function StatusBadge({ status }) {
    const Icon = statusIcons[status] || statusIcons.Unknown;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>
            <Icon size={14} />
            {status || "Unknown"}
        </span>
    );
}

function Metric({ label, value, hint, tone = "slate" }) {
    const tones = {
        slate: "border-slate-200 bg-white text-slate-800",
        green: "border-emerald-200 bg-emerald-50 text-emerald-800",
        amber: "border-amber-200 bg-amber-50 text-amber-800",
        red: "border-red-200 bg-red-50 text-red-800",
        blue: "border-blue-200 bg-blue-50 text-blue-800"
    };

    return (
        <div className={`rounded-lg border px-4 py-3 ${tones[tone] || tones.slate}`}>
            <div className="text-xs font-medium text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-bold tracking-normal">{value ?? "-"}</div>
            {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
        </div>
    );
}

function SectionHeader({ icon: Icon, title, subtitle }) {
    return (
        <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                <Icon size={18} />
            </div>
            <div>
                <h2 className="text-base font-semibold text-slate-800">{title}</h2>
                {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
            </div>
        </div>
    );
}

export default function SystemHealth() {
    const [date, setDate] = useState(today);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const load = async () => {
        setLoading(true);
        setError("");
        try {
            setData(await systemHealthApi.get(date));
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const groupedChecks = useMemo(() => {
        const groups = {};
        (data?.checks || []).forEach(check => {
            const area = check.area || "Other";
            if (!groups[area]) groups[area] = [];
            groups[area].push(check);
        });
        return groups;
    }, [data]);

    const issueCount = (data?.checks || []).filter(c => c.status === "Warning" || c.status === "Error").length;
    const assignmentTone = data?.unassignedEmployees > 0 ? "amber" : "green";
    const sourceTone = data?.status === "Error" ? "red" : data?.status === "Warning" ? "amber" : "green";

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">System Health</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Data alignment, AttendanceERP readiness, and Correction Access checks.
                    </p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">Working Date</label>
                        <input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <button
                        onClick={load}
                        disabled={loading}
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {data && (
                <>
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-3">
                                <ShieldCheck size={24} className="text-blue-600" />
                                <div>
                                    <div className="text-sm font-semibold text-slate-800">Overall Status</div>
                                    <div className="text-xs text-slate-500">Generated {fmtDateTime(data.generatedAt)}</div>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge status={data.status} />
                                <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                                    {issueCount} issue{issueCount === 1 ? "" : "s"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Metric
                            label="Latest Punch Date"
                            value={data.latestPunchDate || "-"}
                            hint={`${data.selectedDatePunchRecords || 0} records on ${data.selectedDate}`}
                            tone={sourceTone}
                        />
                        <Metric
                            label="Active Employees"
                            value={data.activeEmployeeCount}
                            hint={`${data.erpEmployeeCount || 0} ERP employee rows`}
                            tone="blue"
                        />
                        <Metric
                            label="Correction Access Coverage"
                            value={`${data.assignedEmployees || 0}/${data.activeAssignmentRows || 0}`}
                            hint={`${data.unassignedEmployees || 0} unassigned`}
                            tone={assignmentTone}
                        />
                        <Metric
                            label="Schedule Snapshot"
                            value={data.scheduleSnapshotCount}
                            hint={`${data.employeesMissingSchedule || 0} missing schedules`}
                            tone={data.employeesMissingSchedule > 0 ? "amber" : "green"}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
                        <section className="rounded-lg border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 p-4">
                                <SectionHeader
                                    icon={Database}
                                    title="Data Sources"
                                    subtitle="Connection and latest saved source-health state"
                                />
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Source</th>
                                            <th className="px-4 py-3 text-left">Status</th>
                                            <th className="px-4 py-3 text-left">Last Success</th>
                                            <th className="px-4 py-3 text-left">Message</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {(data.sources || []).map(source => (
                                            <tr key={source.sourceName} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 font-medium text-slate-800">{source.sourceName}</td>
                                                <td className="px-4 py-3"><StatusBadge status={source.status} /></td>
                                                <td className="px-4 py-3 text-slate-600">{fmtDateTime(source.lastSuccessAt)}</td>
                                                <td className="px-4 py-3 text-slate-600">{source.message || "-"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section className="rounded-lg border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 p-4">
                                <SectionHeader
                                    icon={Users}
                                    title="Alignment Counts"
                                    subtitle="Quick numbers for employees and Correction Access"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3 p-4">
                                <Metric label="Punch Employees" value={data.selectedDatePunchEmployees} hint={data.selectedDate} />
                                <Metric label="Inactive Rows" value={data.inactiveAssignmentRows} hint="Skipped in assignment tools" tone={data.inactiveAssignmentRows > 0 ? "amber" : "green"} />
                                <Metric label="Invalid Attendance Clerks" value={data.invalidClerkAssignments} hint="Inactive or missing Attendance Clerk references" tone={data.invalidClerkAssignments > 0 ? "amber" : "green"} />
                                <Metric label="Active Attendance Clerks" value={data.activeLeaveClerks} hint="Available for Correction Access" tone={data.activeLeaveClerks > 0 ? "green" : "red"} />
                            </div>
                        </section>
                    </div>

                    <section className="rounded-lg border border-slate-200 bg-white">
                        <div className="border-b border-slate-100 p-4">
                            <SectionHeader
                                icon={AlertTriangle}
                                title="Checks And Actions"
                                subtitle="Use warnings here before opening reports or changing Correction Access"
                            />
                        </div>
                        <div className="divide-y divide-slate-100">
                            {Object.entries(groupedChecks).map(([area, checks]) => (
                                <div key={area} className="p-4">
                                    <h3 className="mb-3 text-sm font-semibold text-slate-700">{area}</h3>
                                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                        {checks.map((check, index) => (
                                            <div key={`${area}-${check.label}-${index}`} className="rounded-lg border border-slate-200 p-3">
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div>
                                                        <div className="text-sm font-semibold text-slate-800">{check.label}</div>
                                                        <div className="mt-0.5 text-xs text-slate-500">{check.value}</div>
                                                    </div>
                                                    <StatusBadge status={check.status} />
                                                </div>
                                                <p className="mt-2 text-sm text-slate-600">{check.message}</p>
                                                {check.action && (
                                                    <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-600">
                                                        Action: {check.action}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
