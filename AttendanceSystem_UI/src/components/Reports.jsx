import React, { useState, useCallback, useEffect, useRef } from "react";
import { get, reportApi } from "../config/apiClient";
import { fmtHours, YEAR_OPTIONS } from "../config/utils";
import { buildPdfFileName, pdfDocumentTitle, pdfPreparingHtml, printLifecycleScript } from "../config/pdfUtils";
import {
    canExportOtSummary,
    canExportReports,
    canPrintOtSummary,
    canPrintReports,
    canViewEmployeeReports,
    canSearchEmployeeReports,
    canViewAttendanceRegister,
    canViewOtSummary
} from "../config/permissions";
import AttendanceRegister from "./AttendanceRegister";

const today = new Date().toISOString().slice(0, 10);
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const currentMonthValue = today.slice(0, 7);

function monthValueRange(value) {
    if (!/^\d{4}-\d{2}$/.test(String(value))) return { from: "", to: "" };
    const [year, month] = String(value).split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const from = `${value}-01`;
    const naturalTo = `${value}-${String(lastDay).padStart(2, "0")}`;
    return { from, to: naturalTo > today ? today : naturalTo };
}

function monthValueLabel(value) {
    if (!/^\d{4}-\d{2}$/.test(String(value))) return "Select month";
    const [year, month] = String(value).split("-").map(Number);
    return `${MONTH_LABELS[month - 1] || ""} ${year}`.trim();
}

function monthRange(year, month) {
    const y = Number(year);
    const m = Number(month);
    const isValid = Number.isInteger(y) && y >= 1 && y <= 9999 && Number.isInteger(m) && m >= 1 && m <= 12;
    if (!isValid) return { from: "", to: "", label: "Select month", isValid: false };

    const yyyy = String(y).padStart(4, "0");
    const mm = String(m).padStart(2, "0");
    const lastDayDate = new Date(0);
    lastDayDate.setFullYear(y, m, 0);
    const lastDay = lastDayDate.getDate();
    return {
        from: `${yyyy}-${mm}-01`,
        to: `${yyyy}-${mm}-${String(lastDay).padStart(2, "0")}`,
        label: `${MONTH_LABELS[m - 1]} ${y}`,
        year: y,
        month: m,
        isValid: true
    };
}

function isFutureRange(range) {
    return range?.isValid && range.from > today;
}

const TABS = [
    { key: "management", label: "Management Summary", canView: () => canSearchEmployeeReports() },
    { key: "emp", label: "Employee Report", canView: () => canViewEmployeeReports() },
    { key: "register", label: "Attendance Register", canView: () => canViewAttendanceRegister() },
    { key: "ot", label: "OT Summary", canView: () => canViewOtSummary() },
    { key: "late", label: "Late Arrivals", canView: () => canSearchEmployeeReports() },
    { key: "all", label: "All Employees Summary", canView: () => canSearchEmployeeReports() },
];

const PAGE_SIZE = 50;
const EXPORT_DENIED_TITLE = "You do not have permission to export this report.";
const PRINT_DENIED_TITLE = "You do not have permission to print this report.";

function exportCsv(filename, headers, rows) {
    const lines = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

function openCecbReportWindow({ title, subtitle, headers, rows, landscape = false, summaryItems = [], fileName }) {
    const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const finalFileName = fileName || buildPdfFileName(title);
    const documentTitle = pdfDocumentTitle(finalFileName);
    const w = window.open("", "_blank", `width=${landscape ? 1220 : 980},height=860`);
    if (!w) {
        alert("Popup blocked. Please allow popups for this site and try again.");
        return false;
    }
    w.document.write(pdfPreparingHtml(finalFileName));
    w.document.close();

    const logoSrc = `${process.env.PUBLIC_URL || ""}/cecb-logo.png`;
    const tbody = rows.map(r => `<tr>${r.map(c=>`<td>${esc(c)}</td>`).join("")}</tr>`).join("");
    const summaryHtml = summaryItems.length
        ? `<div class="summary-strip">${summaryItems.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div>`
        : "";
    const pageSize = landscape ? "A4 landscape" : "A4 portrait";
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(documentTitle)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--preview-scale:.92}
html{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
body{font-family:"Times New Roman",Times,serif;color:#000;background:#e5e7eb;padding:12px;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
.preview-toolbar{position:sticky;top:0;z-index:1000;width:${landscape ? "297mm" : "210mm"};max-width:calc(100vw - 24px);margin:0 auto 10px auto;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:9px 10px;font-family:Arial,sans-serif;font-size:12px;color:#334155;box-shadow:0 4px 14px rgba(15,23,42,.12);animation:previewIn .22s ease-out}
.toolbar-meta{min-width:0;line-height:1.35}.toolbar-file{display:block;max-width:480px;color:#0f172a;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.toolbar-hint{display:block;color:#64748b;font-size:11px}.toolbar-status{color:#2563eb;font-weight:600}
.toolbar-actions{display:flex;align-items:center;gap:6px;white-space:nowrap}
.preview-toolbar button{border:1px solid #94a3b8;background:#fff;color:#0f172a;border-radius:4px;padding:6px 10px;font-weight:600;cursor:pointer}
.preview-toolbar button.primary{background:#155e75;border-color:#155e75;color:#fff}
#zoomLabel{display:inline-block;min-width:42px;text-align:center;font-weight:700;color:#0f172a}
.report-page{width:${landscape ? "297mm" : "210mm"};min-height:${landscape ? "210mm" : "297mm"};margin:0 auto;background:#fff;padding:10mm 12mm;zoom:var(--preview-scale);animation:previewIn .26s ease-out}
.report-header{display:grid;grid-template-columns:28mm 1fr 28mm;align-items:start;margin-bottom:5mm}
.report-title{text-align:center}
.org{font-size:13pt;font-weight:normal}
h1{font-size:15pt;font-weight:bold;margin-top:2px;text-transform:uppercase}
.logo{width:24mm;height:auto;display:block;margin-left:auto}
.subtitle{font-size:9pt;text-align:center;margin-top:1.5mm}
.generated{font-size:8pt;text-align:right;margin-top:1mm}
.summary-strip{display:grid;grid-template-columns:repeat(${Math.max(summaryItems.length, 1)},1fr);border:1pt solid #000;margin:2mm 0 3mm 0}
.summary-strip div{border-left:1pt solid #000;text-align:center;padding:1.5mm 1mm}
.summary-strip div:first-child{border-left:0}
.summary-strip span{display:block;font-size:8pt}
.summary-strip strong{display:block;font-size:11pt;margin-top:.5mm}
table{width:100%;border-collapse:collapse;table-layout:auto;font-size:${landscape ? "7pt" : "8pt"}}
th{border:1pt solid #000;padding:1.2mm .9mm;text-align:center;font-weight:bold;background:#f3f4f6!important;white-space:nowrap}
td{border:1pt solid #000;padding:1mm .9mm;vertical-align:top}
tr:nth-child(even) td{background:#f8fafc!important}
.footer{margin-top:3mm;display:flex;justify-content:space-between;border-top:1pt solid #000;padding-top:1.5mm;font-size:7pt}
@keyframes previewIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media print{
  @page{size:${pageSize};margin:8mm}
  body{padding:0;background:#fff}
  .preview-toolbar{display:none!important}
  .report-page{width:auto;min-height:auto;margin:0;padding:0;zoom:1!important}
}
</style></head><body>
<div class="preview-toolbar">
  <div class="toolbar-meta">
    <span class="toolbar-file">${esc(finalFileName)}</span>
    <span class="toolbar-hint">${pageSize} · Scale 100% · Margins: report default (8mm) · Headers/footers off · <span id="pdfStatus" class="toolbar-status">Ready</span></span>
  </div>
  <div class="toolbar-actions">
    <button type="button" onclick="zoomReport(-.05)">-</button>
    <span id="zoomLabel">92%</span>
    <button type="button" onclick="zoomReport(.05)">+</button>
    <button type="button" onclick="setReportZoom(1)">100%</button>
    <button type="button" onclick="fitReportZoom()">Fit</button>
    <button type="button" onclick="closePdfPreview()">Close</button>
    <button type="button" class="primary" onclick="startPdfPrint()">Print / Save PDF</button>
  </div>
</div>
<div class="report-page">
  <div class="report-header">
    <div></div>
    <div class="report-title">
      <div class="org">CENTRAL ENGINEERING CONSULTANCY BUREAU</div>
      <h1>${esc(title)}</h1>
      <div class="subtitle">${esc(subtitle)}</div>
    </div>
    <img src="${logoSrc}" class="logo" alt="CECB logo">
  </div>
  <div class="generated">Generated: ${new Date().toLocaleString("en-LK")}</div>
  ${summaryHtml}
  <table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${tbody}</tbody></table>
  <div class="footer"><span>ATTENDANCE AND LEAVE INFORMATION MANAGEMENT SYSTEM</span><span>${new Date().toLocaleDateString("en-LK")}</span></div>
</div>
<script>
(function(){
  var scale=.92;
  var label=document.getElementById("zoomLabel");
  function apply(next){
    scale=Math.max(.5,Math.min(1.35,next));
    document.documentElement.style.setProperty("--preview-scale",scale);
    if(label) label.textContent=Math.round(scale*100)+"%";
  }
  window.setReportZoom=apply;
  window.zoomReport=function(delta){apply(scale+delta);};
  window.fitReportZoom=function(){
    var page=document.querySelector(".report-page");
    var width=page ? page.offsetWidth : ${landscape ? 1123 : 794};
    apply(Math.min(1,Math.max(.5,(window.innerWidth-36)/width)));
  };
  window.addEventListener("load",window.fitReportZoom);
})();
</script>
${printLifecycleScript(finalFileName)}
</body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
    return true;
}

function StatusBadge({ status }) {
    const map = {
        OnTime:        "bg-green-100 text-green-700",
        Late:          "bg-yellow-100 text-yellow-700",
        HalfShortLeave:"bg-orange-100 text-orange-700",
        ShortLeave:    "bg-red-100 text-red-700",
        HalfDay:       "bg-rose-100 text-rose-700",
        MissingIn:     "bg-amber-100 text-amber-700",
        FullDayLeave:  "bg-slate-100 text-slate-700",
        Absent:        "bg-gray-100 text-gray-500",
        Holiday:       "bg-blue-100 text-blue-700",
        NotSynced:     "bg-amber-100 text-amber-700",
    };
    const label = { OnTime: "On Time", HalfShortLeave: "Half Short Leave", ShortLeave: "Short Leave", HalfDay: "Half Day", MissingIn: "Missing In", FullDayLeave: "Full Day Leave", Holiday: "Holiday", NotSynced: "Not synced" };
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-500"}`}>
            {label[status] ?? status}
        </span>
    );
}

function Pagination({ page, totalPages, total, pageSize, onPage }) {
    if (totalPages <= 1) return null;
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    return (
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>{from}–{to} of {total}</span>
            <div className="flex items-center gap-1">
                <button onClick={() => onPage(1)} disabled={page === 1}
                    className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs">«</button>
                <button onClick={() => onPage(page - 1)} disabled={page === 1}
                    className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">‹ Prev</button>
                <span className="px-3 py-1 font-medium text-gray-700">{page} / {totalPages}</span>
                <button onClick={() => onPage(page + 1)} disabled={page === totalPages}
                    className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">Next ›</button>
                <button onClick={() => onPage(totalPages)} disabled={page === totalPages}
                    className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs">»</button>
            </div>
        </div>
    );
}

function RangePicker({ from, to, onFrom, onTo, onSearch, loading, children }) {
    return (
        <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-4">
            <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                <input type="date" value={from} max={to} onChange={e => onFrom(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                <input type="date" value={to} min={from} max={today} onChange={e => onTo(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {children}
            <button onClick={onSearch} disabled={loading}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
                {loading ? "Loading…" : "Generate Report"}
            </button>
        </div>
    );
}

function LateArrivalReportFilters({
    periodMode, setPeriodMode,
    selectedMonth, setSelectedMonth,
    fromMonth, setFromMonth,
    toMonth, setToMonth,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    employeeMode, setEmployeeMode,
    epfNo, setEpfNo,
    onGenerate, loading
}) {
    const controlClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

    return (
        <div className="bg-white rounded-xl shadow p-4 space-y-4">
            <div>
                <p className="text-sm font-semibold text-gray-700">Report Period</p>
                <p className="text-xs text-gray-400 mt-0.5">Choose a month, a range of months, or exact dates.</p>
            </div>

            <div className="inline-flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
                {[
                    ["month", "Single Month"],
                    ["month-range", "Month Range"],
                    ["custom", "Custom Dates"]
                ].map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setPeriodMode(value)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${periodMode === value
                            ? "bg-white text-blue-700 shadow-sm"
                            : "text-gray-500 hover:text-gray-700"}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 items-end">
                {periodMode === "month" && (
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
                        <input type="month" value={selectedMonth} max={currentMonthValue}
                            onChange={e => setSelectedMonth(e.target.value)} className={controlClass} />
                    </div>
                )}

                {periodMode === "month-range" && (
                    <>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">From Month</label>
                            <input type="month" value={fromMonth} max={toMonth || currentMonthValue}
                                onChange={e => setFromMonth(e.target.value)} className={controlClass} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">To Month</label>
                            <input type="month" value={toMonth} min={fromMonth} max={currentMonthValue}
                                onChange={e => setToMonth(e.target.value)} className={controlClass} />
                        </div>
                    </>
                )}

                {periodMode === "custom" && (
                    <>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
                            <input type="date" value={customFrom} max={customTo}
                                onChange={e => setCustomFrom(e.target.value)} className={controlClass} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
                            <input type="date" value={customTo} min={customFrom} max={today}
                                onChange={e => setCustomTo(e.target.value)} className={controlClass} />
                        </div>
                    </>
                )}

                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Employees</label>
                    <select value={employeeMode} onChange={e => setEmployeeMode(e.target.value)} className={controlClass}>
                        <option value="all">All Employees</option>
                        <option value="epf">Specific EPF</option>
                    </select>
                </div>

                {employeeMode === "epf" && (
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">EPF Number</label>
                        <input type="text" value={epfNo} onChange={e => setEpfNo(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") onGenerate(); }}
                            placeholder="e.g. 001234" className={controlClass} />
                    </div>
                )}

                <button type="button" onClick={onGenerate} disabled={loading}
                    className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
                    {loading ? "Generating..." : "Generate Report"}
                </button>
            </div>
        </div>
    );
}

// ── AGM-wise Report ──────────────────────────────────────────────────────────
function ReportViewSwitcher({ title, description, value, onChange, options }) {
    return (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
                <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
                <p className="mt-0.5 text-xs text-gray-500">{description}</p>
            </div>
            <div className="inline-flex w-fit rounded-lg bg-gray-100 p-1" role="tablist" aria-label={`${title} views`}>
                {options.map(option => (
                    <button
                        key={option.key}
                        type="button"
                        role="tab"
                        aria-selected={value === option.key}
                        onClick={() => onChange(option.key)}
                        className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                            value === option.key
                                ? "bg-white text-blue-700 shadow-sm"
                                : "text-gray-500 hover:text-gray-700"
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ManagementSummaryReport() {
    const [view, setView] = useState("organization");
    const options = [
        { key: "organization", label: "By Organization" },
        { key: "daily", label: "By Day" }
    ];

    return (
        <div className="space-y-4">
            <ReportViewSwitcher
                title="Management Summary"
                description={view === "organization"
                    ? "Attendance totals grouped by AGM, DGM, and service unit."
                    : "Organization-wide attendance totals for each day in the selected period."}
                value={view}
                onChange={setView}
                options={options}
            />
            <div className={view === "organization" ? "" : "hidden"}><AgmReport /></div>
            <div className={view === "daily" ? "" : "hidden"}><DailySummaryReport /></div>
        </div>
    );
}

function EmployeeReport() {
    const [view, setView] = useState("details");
    const options = [
        { key: "details", label: "Detailed Report" },
        { key: "calendar", label: "Monthly Calendar" }
    ];

    return (
        <div className="space-y-4">
            <ReportViewSwitcher
                title="Employee Attendance"
                description={view === "details"
                    ? "Review and export one employee's attendance for any date range."
                    : "Review and export one employee's attendance as a monthly calendar."}
                value={view}
                onChange={setView}
                options={options}
            />
            <div className={view === "details" ? "" : "hidden"}><EmployeeDetailReport /></div>
            <div className={view === "calendar" ? "" : "hidden"}><MonthlySheet /></div>
        </div>
    );
}

function AgmReport() {
    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo] = useState(today);
    const [data, setData] = useState([]);
    const [expanded, setExpanded] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const canExport = canExportReports();
    const canPrint = canPrintReports();

    const load = async () => {
        setLoading(true); setError("");
        try { setData(await reportApi.getAgmWise(from, to)); }
        catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    const toggle = (key) => setExpanded(p => ({ ...p, [key]: !p[key] }));

    const reportHeaders = ["Unit", "Level", "Employees", "Working Days", "Unsynced", "Present", "Absent", "Late", "Attendance %", "Avg Work Hrs"];
    const buildRows = (indent = "") => {
        const rows = [];
        const flatten = (items, pfx) => {
            items.forEach(u => {
                rows.push([pfx + u.unitName, u.unitLevel, u.registeredEmployees, u.totalWorkingDays, u.totalUnsyncedDays ?? 0, u.totalPresent, u.totalAbsent, u.totalLate, u.attendanceRate + "%", u.averageWorkHours]);
                if (u.children?.length) flatten(u.children, pfx + "  ");
            });
        };
        flatten(data, indent);
        return rows;
    };
    const exportData = () => {
        if (!canExport) return;
        exportCsv(`agm-report-${from}-${to}.csv`, reportHeaders, buildRows());
    };
    const exportPdf = () => {
        if (!canPrint) return;
        openCecbReportWindow({
        title: "AGM-wise Attendance Report",
        fileName: buildPdfFileName("agm-attendance-report", from, "to", to),
        subtitle: `Period: ${from} to ${to}`,
        headers: reportHeaders,
        rows: buildRows(),
        landscape: true,
        summaryItems: [
            ["Period", from === to ? from : `${from} to ${to}`],
            ["Units", data.length],
            ["Employees", data.reduce((sum, u) => sum + (Number(u.registeredEmployees) || 0), 0)],
            ["Late Days", data.reduce((sum, u) => sum + (Number(u.totalLate) || 0), 0)]
        ]
        });
    };

    const RateBar = ({ rate }) => (
        <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div className={`h-2 rounded-full ${rate >= 80 ? "bg-green-500" : rate >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${Math.min(rate, 100)}%` }} />
            </div>
            <span className="text-xs font-medium w-10 text-right">{rate}%</span>
        </div>
    );

    const UnitRow = ({ unit, depth = 0 }) => {
        const key = `${depth}-${unit.unitName}`;
        const hasChildren = unit.children?.length > 0;
        const isOpen = expanded[key];
        const bg = depth === 0 ? "bg-blue-50" : depth === 1 ? "bg-gray-50" : "bg-white";
        const indent = depth * 20;
        return (
            <>
                <tr className={`${bg} hover:brightness-95 transition`}>
                    <td className="px-4 py-2.5" style={{ paddingLeft: 16 + indent }}>
                        <div className="flex items-center gap-2">
                            {hasChildren && (
                                <button onClick={() => toggle(key)} className="text-gray-400 hover:text-blue-600 w-4 text-center text-xs">
                                    {isOpen ? "▼" : "▶"}
                                </button>
                            )}
                            {!hasChildren && <span className="w-4" />}
                            <div>
                                <span className={`font-medium ${depth === 0 ? "text-blue-800" : "text-gray-800"}`}>{unit.unitName}</span>
                                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${depth === 0 ? "bg-blue-200 text-blue-700" : depth === 1 ? "bg-indigo-100 text-indigo-600" : "bg-gray-200 text-gray-500"}`}>
                                    {unit.unitLevel}
                                </span>
                            </div>
                        </div>
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-semibold text-gray-700">{unit.registeredEmployees}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-amber-600">{unit.totalUnsyncedDays ?? 0}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-green-700 font-medium">{unit.totalPresent}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-red-600">{unit.totalAbsent}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-yellow-600">{unit.totalLate}</td>
                    <td className="px-4 py-2.5 min-w-[140px]"><RateBar rate={unit.attendanceRate} /></td>
                    <td className="px-4 py-2.5 text-center text-sm text-gray-600">{unit.averageWorkHours.toFixed(1)}h</td>
                </tr>
                {isOpen && unit.children?.map((c, i) => <UnitRow key={i} unit={c} depth={depth + 1} />)}
            </>
        );
    };

    return (
        <div className="space-y-4">
            <RangePicker from={from} to={to} onFrom={setFrom} onTo={setTo} onSearch={load} loading={loading} />
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">⚠️ {error}</div>}
            {data.length > 0 && (
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h2 className="text-base font-semibold text-gray-700">AGM-wise Attendance — {from} to {to}</h2>
                        <div className="flex gap-2">
                            <button onClick={exportData} disabled={!canExport} title={canExport ? "Export CSV" : EXPORT_DENIED_TITLE}
                                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">📥 CSV</button>
                            <button onClick={exportPdf} disabled={!canPrint} title={canPrint ? "Print / save PDF" : PRINT_DENIED_TITLE}
                                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">🖨️ PDF</button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-800 text-white text-xs uppercase tracking-wide">
                                    <th className="px-4 py-3 text-left">Unit</th>
                                    <th className="px-4 py-3 text-center">Employees</th>
                                    <th className="px-4 py-3 text-center">Unsynced</th>
                                    <th className="px-4 py-3 text-center">Present Days</th>
                                    <th className="px-4 py-3 text-center">Absent Days</th>
                                    <th className="px-4 py-3 text-center">Late Days</th>
                                    <th className="px-4 py-3 text-left">Attendance Rate</th>
                                    <th className="px-4 py-3 text-center">Avg Hours/Day</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.map((unit, i) => <UnitRow key={i} unit={unit} depth={0} />)}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Employee Report ──────────────────────────────────────────────────────────
function EmployeeDetailReport() {
    const canSearch = canSearchEmployeeReports();
    const myEpf = localStorage.getItem("epfNo") || "";

    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo] = useState(today);
    const [epfNo, setEpfNo] = useState(canSearch ? "" : myEpf);
    const [data, setData] = useState(null);
    const [reportParams, setReportParams] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const canExport = canExportReports();
    const canPrint = canPrintReports();

    const currentTarget = canSearch ? epfNo.trim() : myEpf;
    const selectionChanged = !!data && !!reportParams &&
        (reportParams.from !== from || reportParams.to !== to ||
            reportParams.epfNo.toLowerCase() !== currentTarget.toLowerCase());
    const canUseLoadedReport = !!data && !!reportParams && !selectionChanged && !loading;

    const load = async () => {
        const target = canSearch ? epfNo.trim() : myEpf;
        if (!target) { setError("Enter an EPF number."); return; }
        setLoading(true); setError("");
        try {
            const result = await reportApi.getEmployee(target, from, to);
            setData(result);
            setReportParams({ epfNo: target, from, to });
        }
        catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    const empHeaders = ["Date", "Check In", "Check Out", "Work Hours", "Status", "Late By", "Overtime"];
    const empRows = () => (data?.dailyRecords ?? []).map(r => [
        r.date, r.checkIn ?? "", r.checkOut ?? "",
        r.workHours != null ? fmtHours(r.workHours) : "",
        r.status, r.lateBy ?? "", r.hasOvertime ? "Yes" : ""
    ]);
    const exportData = () => {
        if (!canUseLoadedReport || !canExport) return;
        exportCsv(`employee-report-${data.epfNo}-${reportParams.from}-${reportParams.to}.csv`, empHeaders, empRows());
    };
    const exportPdf = () => {
        if (!canUseLoadedReport || !canPrint) return;
        openCecbReportWindow({
            title: "Employee Attendance Report",
            fileName: buildPdfFileName("employee-attendance", data.epfNo, reportParams.from, "to", reportParams.to),
            subtitle: `EPF: ${data.epfNo}${data.designation ? " · " + data.designation : ""}${data.agmUnit ? " · " + data.agmUnit : ""}  |  Period: ${reportParams.from} to ${reportParams.to}`,
            headers: empHeaders,
            rows: empRows(),
            summaryItems: [
                ["Working Days", data.workingDays],
                ["Unsynced", data.unsyncedDays ?? 0],
                ["Present", data.presentDays],
                ["Absent", data.absentDays],
                ["Late", data.lateDays],
                ["Attendance", data.attendanceRate + "%"],
                ["Avg Hours", data.averageWorkHours + "h"]
            ]
        });
    };

    return (
        <div className="space-y-4">
            <RangePicker from={from} to={to} onFrom={setFrom} onTo={setTo} onSearch={load} loading={loading}>
                {canSearch && (
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">EPF No</label>
                        <input type="text" value={epfNo} onChange={e => setEpfNo(e.target.value)}
                            placeholder="e.g. 12345"
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-32" />
                    </div>
                )}
            </RangePicker>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">⚠️ {error}</div>}
            {selectionChanged && reportParams && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                    Selection changed. Current report still shows EPF {reportParams.epfNo} from {reportParams.from} to {reportParams.to}. Click Generate Report to load the new selection.
                </div>
            )}
            {loading && reportParams && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600">
                    Loading the new employee report. The previous report stays visible until the new data is ready.
                </div>
            )}
            {data && (
                <>
                    <div className="bg-white rounded-xl shadow p-5 flex items-center gap-5">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                            {(data.name ?? "?")[0].toUpperCase()}
                        </div>
                        <div className="flex-1">
                            <h2 className="text-lg font-bold text-gray-800">{data.name}</h2>
                            <p className="text-sm text-gray-500">EPF: <span className="font-mono font-semibold text-gray-700">{data.epfNo}</span>
                                {data.designation && <span className="ml-3 text-gray-400">{data.designation}</span>}
                            </p>
                            {reportParams && <p className="text-xs text-gray-400 mt-1">Report period: {reportParams.from} to {reportParams.to}</p>}
                            {data.agmUnit && <p className="text-xs text-gray-400 mt-0.5">{data.agmUnit}{data.dgmUnit ? ` → ${data.dgmUnit}` : ""}{data.serviceUnit ? ` → ${data.serviceUnit}` : ""}</p>}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                            <button onClick={exportData} disabled={!canUseLoadedReport || !canExport} title={canExport ? "Export CSV" : EXPORT_DENIED_TITLE}
                                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">📥 CSV</button>
                            <button onClick={exportPdf} disabled={!canUseLoadedReport || !canPrint} title={canPrint ? "Print / save PDF" : PRINT_DENIED_TITLE}
                                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">🖨️ PDF</button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                        {[
                            { label: "Working Days", value: data.workingDays, color: "border-gray-400" },
                            { label: "Unsynced", value: data.unsyncedDays ?? 0, color: "border-amber-500" },
                            { label: "Present", value: data.presentDays, color: "border-green-500" },
                            { label: "Absent", value: data.absentDays, color: "border-red-500" },
                            { label: "Late", value: data.lateDays, color: "border-yellow-500" },
                            { label: "Attendance", value: data.attendanceRate + "%", color: "border-blue-500" },
                            { label: "Avg Hours", value: data.averageWorkHours + "h", color: "border-indigo-500" },
                        ].map(c => (
                            <div key={c.label} className={`bg-white rounded-xl shadow p-3 border-l-4 ${c.color}`}>
                                <p className="text-xs text-gray-500 uppercase">{c.label}</p>
                                <p className="text-xl font-bold text-gray-800 mt-1">{c.value}</p>
                            </div>
                        ))}
                    </div>
                    <div className="bg-white rounded-xl shadow overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100">
                            <h2 className="text-base font-semibold text-gray-700">Daily Records</h2>
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
                                        <th className="px-4 py-3 text-left">Late By</th>
                                        <th className="px-4 py-3 text-left">Overtime</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {data.dailyRecords.map((r, i) => (
                                        <tr key={i} className={`hover:bg-gray-50 ${r.status === "Absent" ? "opacity-50" : ""}`}>
                                            <td className="px-4 py-2 font-medium text-gray-700">{r.date}</td>
                                            <td className="px-4 py-2 text-gray-700">{r.checkIn ?? ""}</td>
                                            <td className="px-4 py-2 text-gray-600">{r.checkOut ?? ""}</td>
                                            <td className="px-4 py-2 text-gray-600">{fmtHours(r.workHours)}</td>
                                            <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                                            <td className="px-4 py-2 text-yellow-600 text-xs">{r.lateBy ?? ""}</td>
                                            <td className="px-4 py-2">{r.hasOvertime ? <span className="text-xs text-blue-600 font-medium">✓ OT</span> : ""}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ── Monthly Sheet ────────────────────────────────────────────────────────────
function MonthlySheet() {
    const canSearch = canSearchEmployeeReports();
    const myEpf = localStorage.getItem("epfNo") || "";
    const now = new Date();

    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [epfNo, setEpfNo] = useState(canSearch ? "" : myEpf);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const canExport = canExportReports();
    const canPrint = canPrintReports();

    const load = async () => {
        const target = canSearch ? epfNo.trim() : myEpf;
        if (!target) { setError("Enter an EPF number."); return; }
        const from = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const to = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
        setLoading(true); setError("");
        try { setData(await reportApi.getEmployee(target, from, to)); }
        catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    const exportCsvSheet = () => {
        if (!data || !canExport) return;
        exportCsv(
            `monthly-sheet-${data.epfNo}-${year}-${String(month).padStart(2, "0")}.csv`,
            ["Date", "Status", "Check In", "Check Out", "Work Hours"],
            data.dailyRecords.map(r => [r.date, r.status, r.checkIn ?? "", r.checkOut ?? "", fmtHours(r.workHours)])
        );
    };

    const STATUS_COLOR = {
        OnTime:        "bg-green-500 text-white",
        Late:          "bg-yellow-400 text-white",
        HalfShortLeave:"bg-orange-400 text-white",
        ShortLeave:    "bg-red-400 text-white",
        HalfDay:       "bg-rose-500 text-white",
        MissingIn:     "bg-amber-400 text-white",
        FullDayLeave:  "bg-slate-500 text-white",
        Absent:        "bg-gray-300 text-gray-600",
        Holiday:       "bg-blue-200 text-blue-700",
        Weekend:       "bg-gray-100 text-gray-400",
        NotSynced:     "bg-amber-200 text-amber-800",
    };
    const STATUS_LABEL = {
        OnTime: "O", Late: "L", HalfShortLeave: "HS", ShortLeave: "SL",
        HalfDay: "HD", MissingIn: "MI", FullDayLeave: "FD", Absent: "A", Holiday: "H", Weekend: "—",
    };

    const daysInMonth = data ? new Date(year, month, 0).getDate() : 0;
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
    const recordMap = {};
    data?.dailyRecords?.forEach(r => { recordMap[r.date] = r; });

    const allDays = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dow = new Date(year, month - 1, d).getDay();
        const isWeekend = dow === 0 || dow === 6;
        const rec = recordMap[date];
        const status = isWeekend ? "Weekend" : (rec?.status ?? "Absent");
        allDays.push({ date, d, dow, isWeekend, status, rec });
    }

    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    const statusText = (status) => ({
        OnTime: "On Time",
        HalfShortLeave: "Half Short Leave",
        ShortLeave: "Short Leave",
        HalfDay: "Half Day",
        MissingIn: "Missing In",
        FullDayLeave: "Full Day Leave",
        NotSynced: "Not synced"
    }[status] ?? status ?? "");

    const statusPrintClass = (status) => ({
        OnTime: "on-time",
        Late: "late",
        HalfShortLeave: "half-short",
        ShortLeave: "short-leave",
        HalfDay: "half-day",
        MissingIn: "missing-in",
        FullDayLeave: "full-day-leave",
        Absent: "absent",
        Holiday: "holiday",
        Weekend: "weekend",
        NotSynced: "not-synced"
    }[status] ?? "other");

    const exportPdfSheet = () => {
        if (!data || !canPrint) return;

        const periodKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
        const finalFileName = buildPdfFileName("monthly-attendance", data.epfNo, periodKey);
        const documentTitle = pdfDocumentTitle(finalFileName);
        const w = window.open("", "_blank", "width=1180,height=840");
        if (!w) {
            setError("Allow pop-ups to generate the monthly PDF.");
            return;
        }
        w.document.write(pdfPreparingHtml(finalFileName));
        w.document.close();

        const esc = value => String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        const monthName = months[month - 1];
        const period = `${monthName} ${year}`;
        const logoSrc = `${process.env.PUBLIC_URL || ""}/cecb-logo.png`;
        const summary = [
            ["Present", data.presentDays],
            ["Absent", data.absentDays],
            ["Late", data.lateDays],
            ["Unsynced", data.unsyncedDays ?? 0],
            ["Attendance", `${data.attendanceRate}%`],
            ["Total Hours", `${data.totalWorkHours ?? 0}h`],
            ["Avg Hours", `${data.averageWorkHours ?? 0}h`]
        ];

        const calendarCells = [
            ...Array.from({ length: firstDayOfWeek }).map(() => `<div class="day empty"></div>`),
            ...allDays.map(({ d, status, rec }) => `
                <div class="day ${statusPrintClass(status)}">
                    <div class="num">${d}</div>
                    <div class="code">${esc(status === "NotSynced" ? "NS" : STATUS_LABEL[status] ?? "?")}</div>
                    <div class="time">${esc(rec?.checkIn ?? "")}</div>
                </div>
            `)
        ].join("");

        const detailRows = allDays.map(({ date, status, rec }) => `
            <tr>
                <td>${esc(date)}</td>
                <td><span class="pill ${statusPrintClass(status)}">${esc(statusText(status))}</span></td>
                <td>${esc(rec?.checkIn ?? "")}</td>
                <td>${esc(rec?.checkOut ?? "")}</td>
                <td>${esc(fmtHours(rec?.workHours))}</td>
                <td>${esc(rec?.lateBy ?? "")}</td>
            </tr>
        `).join("");

        const legend = [
            ["O", "On Time", "on-time"],
            ["L", "Late", "late"],
            ["HS", "Half Short Leave", "half-short"],
            ["SL", "Short Leave", "short-leave"],
            ["HD", "Half Day", "half-day"],
            ["FD", "Full Day Leave", "full-day-leave"],
            ["A", "Absent", "absent"],
            ["NS", "Not synced", "not-synced"],
            ["H", "Holiday", "holiday"],
            ["-", "Weekend", "weekend"]
        ].map(([code, label, cls]) => `<span class="legend ${cls}"><b>${code}</b> ${label}</span>`).join("");

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(documentTitle)}</title><style>
*{box-sizing:border-box}:root{--monthly-scale:.92}html{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{margin:0;font-family:"Times New Roman",Times,serif;color:#000;font-size:8.5pt;padding:12px;background:#e5e7eb;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
.preview-toolbar{position:sticky;top:0;z-index:1000;width:297mm;max-width:calc(100vw - 24px);margin:0 auto 10px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:9px 10px;font-family:Arial,sans-serif;font-size:12px;color:#334155;box-shadow:0 4px 14px rgba(15,23,42,.12);animation:previewIn .22s ease-out}.toolbar-meta{min-width:0;line-height:1.35}.toolbar-file{display:block;max-width:480px;color:#0f172a;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.toolbar-hint{display:block;color:#64748b;font-size:11px}.toolbar-status{color:#2563eb;font-weight:600}.toolbar-actions{display:flex;align-items:center;gap:6px;white-space:nowrap}.preview-toolbar button{border:1px solid #94a3b8;background:#fff;color:#0f172a;border-radius:4px;padding:6px 10px;font-weight:600;cursor:pointer}.preview-toolbar button.primary{background:#155e75;border-color:#155e75;color:#fff}#monthlyZoomLabel{display:inline-block;min-width:42px;text-align:center;font-weight:700;color:#0f172a}.monthly-page{width:297mm;min-height:210mm;margin:0 auto;background:#fff;padding:8mm;zoom:var(--monthly-scale);animation:previewIn .26s ease-out}
.page-hdr{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:1pt solid #000;padding-bottom:4px;margin-bottom:7px}
.hdr-side{width:25mm;flex-shrink:0;font-weight:bold;font-size:9pt;line-height:1.2}
.hdr-mid{flex:1;text-align:center;padding:0 5mm}
.org{font-size:10pt;font-weight:normal;text-transform:uppercase}
.doc{font-size:14pt;font-weight:bold;text-transform:uppercase;margin-top:1px}
.sub{font-size:8.8pt;margin-top:2px}.meta{font-size:7.5pt;margin-top:1px}.cecb-logo{width:24mm;height:auto;display:block;margin-left:auto}
.summary{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin:8px 0}.card{border:1px solid #d5dae3;border-radius:4px;padding:4px 6px;text-align:center;background:#f8fafc}
.card .label{font-size:6.5pt;text-transform:uppercase;color:#6b7280}.card .value{font-size:11pt;font-weight:bold;color:#1e3a5f}
.layout{display:grid;grid-template-columns:0.95fr 1.25fr;gap:8px;align-items:start}.weekdays,.calendar{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.weekday{font-size:6.5pt;font-weight:bold;text-align:center;color:#5b6472;padding:2px}.day{min-height:38px;border:1px solid #d6dce5;border-radius:4px;padding:3px;text-align:center;break-inside:avoid}
.day.empty{border:0;background:transparent}.num{font-weight:bold;font-size:8pt}.code{font-weight:bold;font-size:8pt;margin-top:1px}.time{font-size:6.5pt;margin-top:1px;min-height:8px}
.on-time{background:#dcfce7;color:#166534;border-color:#86efac}.late{background:#fef3c7;color:#92400e;border-color:#fcd34d}.half-short{background:#ffedd5;color:#9a3412;border-color:#fdba74}
.short-leave{background:#fee2e2;color:#991b1b;border-color:#fca5a5}.half-day{background:#ffe4e6;color:#9f1239;border-color:#fda4af}.full-day-leave{background:#e2e8f0;color:#334155;border-color:#94a3b8}.absent{background:#f1f5f9;color:#475569;border-color:#cbd5e1}
.holiday{background:#dbeafe;color:#1d4ed8;border-color:#93c5fd}.weekend{background:#f8fafc;color:#94a3b8;border-color:#e2e8f0}.not-synced{background:#fef3c7;color:#92400e;border-color:#fcd34d}.other{background:#f3f4f6;color:#374151}
.legend-wrap{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.legend{border-radius:3px;border:1px solid #d6dce5;padding:2px 5px;font-size:6.5pt}
table{width:100%;border-collapse:collapse;font-size:7pt}th{background:#1e3a5f;color:white;text-align:left;padding:3px 4px;border:1px solid #29486d;white-space:nowrap}
td{border:1px solid #d6dce5;padding:2px 4px;vertical-align:middle}.pill{display:inline-block;border:1px solid #d6dce5;border-radius:3px;padding:1px 4px;white-space:nowrap}
.footer{margin-top:6px;border-top:1pt solid #000;padding-top:3px;display:flex;justify-content:space-between;color:#000;font-size:6.8pt}@keyframes previewIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@media print{@page{size:A4 landscape;margin:7mm}body{padding:0;background:#fff}.preview-toolbar{display:none!important}.monthly-page{width:auto;min-height:auto;margin:0;padding:0;zoom:1!important}.day,.card,tr{break-inside:avoid}}
</style></head><body>
<div class="preview-toolbar">
  <div class="toolbar-meta"><span class="toolbar-file">${esc(finalFileName)}</span><span class="toolbar-hint">A4 landscape · Scale 100% · Margins: report default (7mm) · Headers/footers off · <span id="pdfStatus" class="toolbar-status">Ready</span></span></div>
  <div class="toolbar-actions">
    <button type="button" onclick="zoomMonthly(-.05)">-</button><span id="monthlyZoomLabel">92%</span><button type="button" onclick="zoomMonthly(.05)">+</button>
    <button type="button" onclick="setMonthlyZoom(1)">100%</button><button type="button" onclick="fitMonthlyZoom()">Fit</button>
    <button type="button" onclick="closePdfPreview()">Close</button><button type="button" class="primary" onclick="startPdfPrint()">Print / Save PDF</button>
  </div>
</div>
<div class="monthly-page">
<div class="page-hdr">
  <div class="hdr-side">${esc(period)}</div>
  <div class="hdr-mid">
    <div class="org">CENTRAL ENGINEERING CONSULTANCY BUREAU</div>
    <div class="doc">MONTHLY ATTENDANCE SHEET</div>
    <div class="sub">${esc(data.name ?? data.epfNo ?? "Employee")} | EPF: ${esc(data.epfNo)}${data.designation ? " | " + esc(data.designation) : ""}${data.agmUnit ? " | " + esc(data.agmUnit) : ""}</div>
    <div class="meta">Generated: ${esc(new Date().toLocaleString("en-LK"))}</div>
  </div>
  <div class="hdr-side"><img src="${logoSrc}" class="cecb-logo" alt="CECB logo"></div>
</div>
<div class="summary">${summary.map(([label, value]) => `<div class="card"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`).join("")}</div>
<div class="layout"><section><div class="weekdays">${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => `<div class="weekday">${d}</div>`).join("")}</div><div class="calendar">${calendarCells}</div><div class="legend-wrap">${legend}</div></section>
<section><table><thead><tr><th>Date</th><th>Status</th><th>In</th><th>Out</th><th>Hours</th><th>Late</th></tr></thead><tbody>${detailRows}</tbody></table></section></div>
<div class="footer"><span>ATTENDANCE AND LEAVE INFORMATION MANAGEMENT SYSTEM</span><span>${esc(period)} | ${esc(data.epfNo)}</span></div>
</div>
<script>
(function(){
  var scale=.92;
  var label=document.getElementById("monthlyZoomLabel");
  function apply(next){scale=Math.max(.5,Math.min(1.35,next));document.documentElement.style.setProperty("--monthly-scale",scale);if(label)label.textContent=Math.round(scale*100)+"%";}
  window.setMonthlyZoom=apply;
  window.zoomMonthly=function(delta){apply(scale+delta);};
  window.fitMonthlyZoom=function(){var page=document.querySelector(".monthly-page");var width=page?page.offsetWidth:1123;apply(Math.min(1,Math.max(.5,(window.innerWidth-36)/width)));};
  window.addEventListener("load",window.fitMonthlyZoom);
})();
</script>
${printLifecycleScript(finalFileName)}
</body></html>`;

        w.document.open();
        w.document.write(html);
        w.document.close();
    };

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
                    <select value={year} onChange={e => setYear(+e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {YEAR_OPTIONS.map(y => <option key={y}>{y}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
                    <select value={month} onChange={e => setMonth(+e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                    </select>
                </div>
                {canSearch && (
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">EPF No</label>
                        <input type="text" value={epfNo} onChange={e => setEpfNo(e.target.value)}
                            placeholder="e.g. 12345"
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-32" />
                    </div>
                )}
                <button onClick={load} disabled={loading}
                    className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    {loading ? "Loading…" : "Generate"}
                </button>
                {data && (
                    <>
                        <button onClick={exportPdfSheet} disabled={!canPrint} title={canPrint ? "Print / save PDF" : PRINT_DENIED_TITLE}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                            PDF
                        </button>
                        <button onClick={exportCsvSheet} disabled={!canExport} title={canExport ? "Export CSV" : EXPORT_DENIED_TITLE}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                            📥 CSV
                        </button>
                    </>
                )}
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">⚠️ {error}</div>}

            {data && (
                <div className="bg-white rounded-xl shadow p-6 print:shadow-none">
                    <div className="text-center mb-6 print:mb-4">
                        <h2 className="text-xl font-bold text-gray-800">{data.name}</h2>
                        <p className="text-sm text-gray-500">EPF: {data.epfNo} {data.designation ? `· ${data.designation}` : ""}</p>
                        <p className="text-lg font-semibold text-gray-700 mt-1">{months[month - 1]} {year} — Attendance Sheet</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                        {[
                            { l: "Present", v: data.presentDays, c: "text-green-600" },
                            { l: "Absent", v: data.absentDays, c: "text-red-500" },
                            { l: "Late", v: data.lateDays, c: "text-yellow-600" },
                            { l: "Unsynced", v: data.unsyncedDays ?? 0, c: "text-amber-600" },
                            { l: "Attendance", v: data.attendanceRate + "%", c: "text-blue-600" },
                        ].map(k => (
                            <div key={k.l} className="bg-gray-50 rounded-lg p-3 text-center">
                                <p className="text-xs text-gray-500">{k.l}</p>
                                <p className={`text-xl font-bold mt-0.5 ${k.c}`}>{k.v}</p>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
                        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
                            <div key={d} className="font-semibold text-gray-500 py-1">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
                        {allDays.map(({ d, date, status, rec }) => (
                            <div key={date} title={rec ? `${rec.checkIn ?? ""} → ${rec.checkOut ?? ""}` : status}
                                className={`rounded-lg p-1.5 text-center cursor-default ${STATUS_COLOR[status] ?? "bg-gray-100"}`}>
                                <div className="text-xs font-bold">{d}</div>
                                <div className="text-xs mt-0.5">{STATUS_LABEL[status] ?? "?"}</div>
                                {rec?.checkIn && <div className="text-xs opacity-80">{rec.checkIn}</div>}
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        {Object.entries(STATUS_LABEL).map(([s, l]) => (
                            <span key={s} className={`px-2 py-1 rounded ${STATUS_COLOR[s]}`}>
                                {l} = {statusText(s) || s}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Late Arrivals Report ─────────────────────────────────────────────────────
function LateArrivalsReport() {
    const [periodMode, setPeriodMode] = useState("month");
    const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
    const [fromMonth, setFromMonth] = useState(currentMonthValue);
    const [toMonth, setToMonth] = useState(currentMonthValue);
    const [customFrom, setCustomFrom] = useState(firstOfMonth);
    const [customTo, setCustomTo] = useState(today);
    const [employeeMode, setEmployeeMode] = useState("all");
    const [epfNo, setEpfNo] = useState("");
    const [loadedQuery, setLoadedQuery] = useState(null);
    const [data, setData]       = useState([]);
    const [search, setSearch]   = useState("");
    const [filterAGM, setFilterAGM] = useState("");
    const [filterDGM, setFilterDGM] = useState("");
    const [sortCol, setSortCol] = useState("lateMinutes");
    const [sortDir, setSortDir] = useState("desc");
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState("");
    const [page, setPage]       = useState(1);
    const canExport = canExportReports();
    const canPrint = canPrintReports();

    const getDraftQuery = () => {
        if (periodMode === "month-range") {
            const start = monthValueRange(fromMonth);
            const end = monthValueRange(toMonth);
            return {
                from: start.from,
                to: end.to,
                label: fromMonth === toMonth
                    ? monthValueLabel(fromMonth)
                    : `${monthValueLabel(fromMonth)} - ${monthValueLabel(toMonth)}`,
                scope: employeeMode,
                epfNo: employeeMode === "epf" ? epfNo.trim() : ""
            };
        }

        if (periodMode === "custom") {
            return {
                from: customFrom,
                to: customTo,
                label: customFrom === customTo ? customFrom : `${customFrom} - ${customTo}`,
                scope: employeeMode,
                epfNo: employeeMode === "epf" ? epfNo.trim() : ""
            };
        }

        const month = monthValueRange(selectedMonth);
        return {
            ...month,
            label: monthValueLabel(selectedMonth),
            scope: employeeMode,
            epfNo: employeeMode === "epf" ? epfNo.trim() : ""
        };
    };

    const draftQuery = getDraftQuery();
    const queryChanged = !loadedQuery ||
        loadedQuery.from !== draftQuery.from ||
        loadedQuery.to !== draftQuery.to ||
        loadedQuery.scope !== draftQuery.scope ||
        loadedQuery.epfNo !== draftQuery.epfNo;
    const canUseLoadedReport = !!loadedQuery && !queryChanged && !loading;

    const load = async () => {
        if (employeeMode === "epf" && !draftQuery.epfNo) {
            setError("Enter an EPF number or select All Employees.");
            return;
        }
        if (!draftQuery.from || !draftQuery.to || draftQuery.from > draftQuery.to) {
            setError("Select a valid report period.");
            return;
        }

        setLoading(true); setError("");
        try {
            const result = await reportApi.getLateArrivals(draftQuery.from, draftQuery.to, draftQuery.epfNo || null);
            setData(Array.isArray(result) ? result : []);
            setLoadedQuery({ ...draftQuery });
            setSearch("");
            setFilterAGM("");
            setFilterDGM("");
            setPage(1);
        }
        catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    const agmOptions = [...new Set(data.map(r => r.agmUnit).filter(Boolean))].sort();
    const dgmOptions = [...new Set(
        data.filter(r => !filterAGM || r.agmUnit === filterAGM).map(r => r.dgmUnit).filter(Boolean)
    )].sort();

    const toggleSort = (col) => {
        if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortCol(col); setSortDir(col === "lateMinutes" || col === "date" ? "desc" : "asc"); }
    };
    const sortIcon = (col) => sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕";

    const filtered = data
        .filter(r => {
            if (search) {
                const t = search.toLowerCase();
                if (!(r.epfNo ?? "").toLowerCase().includes(t) && !(r.name ?? "").toLowerCase().includes(t)) return false;
            }
            if (filterAGM && r.agmUnit !== filterAGM) return false;
            if (filterDGM && r.dgmUnit !== filterDGM) return false;
            return true;
        })
        .sort((a, b) => {
            let av, bv;
            if      (sortCol === "epfNo")       { av = a.epfNo ?? "";       bv = b.epfNo ?? ""; }
            else if (sortCol === "name")         { av = a.name ?? "";        bv = b.name ?? ""; }
            else if (sortCol === "agmUnit")      { av = a.agmUnit ?? "";     bv = b.agmUnit ?? ""; }
            else if (sortCol === "dgmUnit")      { av = a.dgmUnit ?? "";     bv = b.dgmUnit ?? ""; }
            else if (sortCol === "date")         { av = a.date ?? "";        bv = b.date ?? ""; }
            else if (sortCol === "checkIn")      { av = a.checkIn ?? "";     bv = b.checkIn ?? ""; }
            else if (sortCol === "lateMinutes")  { av = a.lateMinutes ?? 0;  bv = b.lateMinutes ?? 0; }
            else { return 0; }
            if (av < bv) return sortDir === "asc" ? -1 : 1;
            if (av > bv) return sortDir === "asc" ?  1 : -1;
            return 0;
        });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const formatMinutes = (minutes) => {
        const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
        const h = Math.floor(safeMinutes / 60);
        const m = safeMinutes % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const freqMap = {};
    filtered.forEach(r => {
        const key = r.epfNo || r.name || "";
        if (!key) return;
        if (!freqMap[key]) freqMap[key] = { name: r.name, epf: r.epfNo, count: 0, totalMins: 0 };
        freqMap[key].count++;
        freqMap[key].totalMins += Number(r.lateMinutes) || 0;
    });
    const topLate = Object.values(freqMap).sort((a, b) => b.count - a.count || b.totalMins - a.totalMins).slice(0, 5);

    const lateHeaders = ["EPF", "Name", "AGM Unit", "DGM Unit", "Date", "Check In", "Scheduled", "Late By", "Late (mins)"];
    const lateRowsFor = (records) => records.map(r => [r.epfNo, r.name, r.agmUnit ?? "", r.dgmUnit ?? "", r.date, r.checkIn, r.scheduledStart, r.lateBy, r.lateMinutes]);
    const lateRows = () => lateRowsFor(filtered);
    const uniqueLateEmployees = new Set(filtered.map(r => r.epfNo || r.name).filter(Boolean)).size;
    const totalLateMinutes = filtered.reduce((sum, r) => sum + (Number(r.lateMinutes) || 0), 0);
    const exportData = () => {
        if (!canExport || !canUseLoadedReport) return;
        const epfSuffix = loadedQuery.epfNo ? `-${loadedQuery.epfNo}` : "";
        exportCsv(`late-arrivals-${loadedQuery.from}-${loadedQuery.to}${epfSuffix}.csv`, lateHeaders, lateRows());
    };
    const exportPdf  = () => {
        if (!canPrint || !canUseLoadedReport) return;
        openCecbReportWindow({
        title: "Late Arrival Report",
        fileName: buildPdfFileName("late-arrivals", loadedQuery.epfNo ? `epf-${loadedQuery.epfNo}` : "all-employees", loadedQuery.from, "to", loadedQuery.to),
        subtitle: `Period: ${loadedQuery.label} | Scope: ${loadedQuery.epfNo ? `EPF ${loadedQuery.epfNo}` : "All Employees"}`,
        headers: lateHeaders,
        rows: lateRows(),
        landscape: true,
        summaryItems: [
            ["Period", loadedQuery.label],
            ["Scope", loadedQuery.epfNo ? `EPF ${loadedQuery.epfNo}` : "All Employees"],
            ["Late Records", filtered.length],
            ["Employees", uniqueLateEmployees],
            ["Total Late Time", formatMinutes(totalLateMinutes)]
        ]
        });
    };
    const SortTh = ({ col, children }) => (
        <th onClick={() => toggleSort(col)}
            className="px-4 py-3 text-left cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap">
            {children}<span className="text-gray-400 text-xs">{sortIcon(col)}</span>
        </th>
    );

    return (
        <div className="space-y-4">
            <LateArrivalReportFilters
                periodMode={periodMode} setPeriodMode={setPeriodMode}
                selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
                fromMonth={fromMonth} setFromMonth={setFromMonth}
                toMonth={toMonth} setToMonth={setToMonth}
                customFrom={customFrom} setCustomFrom={setCustomFrom}
                customTo={customTo} setCustomTo={setCustomTo}
                employeeMode={employeeMode} setEmployeeMode={setEmployeeMode}
                epfNo={epfNo} setEpfNo={setEpfNo}
                onGenerate={load} loading={loading}
            />
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">⚠️ {error}</div>}
            {loadedQuery && (
                <div className={`rounded-lg border p-3 text-sm ${queryChanged
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-blue-50 border-blue-200 text-blue-800"}`}>
                    <span className="font-semibold">Loaded report:</span> {loadedQuery.label}
                    <span className="mx-2">·</span>
                    {loadedQuery.epfNo ? `EPF ${loadedQuery.epfNo}` : "All Employees"}
                    {queryChanged && (
                        <span className="block mt-1 text-xs">
                            Filters changed. Click Generate Report before exporting the new selection.
                        </span>
                    )}
                </div>
            )}
            {loadedQuery && !queryChanged && !loading && data.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                    <p className="font-semibold text-gray-700">No late arrivals found</p>
                    <p className="text-sm text-gray-400 mt-1">
                        No records matched {loadedQuery.label}{loadedQuery.epfNo ? ` for EPF ${loadedQuery.epfNo}` : " for the selected employees"}.
                    </p>
                </div>
            )}
            {data.length > 0 && (
                <>
                    <div className="bg-white rounded-xl shadow p-5">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Most Frequent Late Arrivals</h3>
                        <div className="flex flex-wrap gap-3">
                            {topLate.map((e, i) => (
                                <div key={i} className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
                                    <span className="text-xl">{["🥇","🥈","🥉","4️⃣","5️⃣"][i]}</span>
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">{e.name ?? e.epf}</p>
                                        <p className="text-xs text-yellow-600">{e.count} times late · avg {Math.round(e.totalMins / e.count)}m</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-3">
                                <div>
                                    <h2 className="text-base font-semibold text-gray-700">
                                        {filtered.length !== data.length ? `${filtered.length} of ${data.length}` : filtered.length} Late Arrivals
                                    </h2>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {loadedQuery?.label} · {loadedQuery?.epfNo ? `EPF ${loadedQuery.epfNo}` : "All Employees"}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={exportData} disabled={!canExport || !canUseLoadedReport || filtered.length === 0} title={!canExport ? EXPORT_DENIED_TITLE : queryChanged ? "Generate the selected report before exporting." : "Export CSV"}
                                        className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">📥 CSV</button>
                                    <button onClick={exportPdf} disabled={!canPrint || !canUseLoadedReport || filtered.length === 0} title={!canPrint ? PRINT_DENIED_TITLE : queryChanged ? "Generate the selected report before exporting." : "Print / save PDF"}
                                        className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">🖨️ PDF</button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                                    placeholder="Filter loaded EPF or name…"
                                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                                <select value={filterAGM} onChange={e => { setFilterAGM(e.target.value); setFilterDGM(""); setPage(1); }}
                                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300">
                                    <option value="">All AGM Units</option>
                                    {agmOptions.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                                <select value={filterDGM} onChange={e => { setFilterDGM(e.target.value); setPage(1); }}
                                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300">
                                    <option value="">All DGM Units</option>
                                    {dgmOptions.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                                {(search || filterAGM || filterDGM) && (
                                    <button onClick={() => { setSearch(""); setFilterAGM(""); setFilterDGM(""); setPage(1); }}
                                        className="px-3 py-1.5 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50">✕ Clear</button>
                                )}
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                                        <SortTh col="epfNo">EPF</SortTh>
                                        <SortTh col="name">Name</SortTh>
                                        <SortTh col="agmUnit">AGM Unit</SortTh>
                                        <SortTh col="dgmUnit">DGM Unit</SortTh>
                                        <SortTh col="date">Date</SortTh>
                                        <SortTh col="checkIn">Check In</SortTh>
                                        <th className="px-4 py-3 text-left">Scheduled</th>
                                        <SortTh col="lateMinutes">Late By</SortTh>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {pageData.map((r, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 font-mono text-gray-600">{r.epfNo}</td>
                                            <td className="px-4 py-2 text-gray-800">{r.name}</td>
                                            <td className="px-4 py-2 text-gray-500 text-xs">{r.agmUnit ?? ""}</td>
                                            <td className="px-4 py-2 text-gray-500 text-xs">{r.dgmUnit ?? ""}</td>
                                            <td className="px-4 py-2 text-gray-600">{r.date}</td>
                                            <td className="px-4 py-2 font-medium text-yellow-600">{r.checkIn}</td>
                                            <td className="px-4 py-2 text-gray-400">{r.scheduledStart}</td>
                                            <td className="px-4 py-2 font-medium text-red-600">{r.lateBy}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
                    </div>
                </>
            )}
        </div>
    );
}

// ── Daily Summary Report ─────────────────────────────────────────────────────
function DailySummaryReport() {
    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo] = useState(today);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const canExport = canExportReports();
    const canPrint = canPrintReports();

    const load = async () => {
        setLoading(true); setError("");
        try { setData(await reportApi.getDailySummary(from, to)); }
        catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    const dailyHeaders = ["Date", "Source", "Registered", "Present", "Absent", "On Time", "Late", "Checked Out", "Attendance %", "Avg Work Hrs"];
    const dailyRows = () => data.map(r => [r.date, r.isSynced === false ? "Not synced" : "Synced", r.totalRegistered, r.present, r.absent, r.onTime, r.late, r.checkedOut, r.attendanceRate + "%", r.averageWorkHours]);
    const exportData = () => {
        if (!canExport) return;
        exportCsv(`daily-summary-${from}-${to}.csv`, dailyHeaders, dailyRows());
    };
    const exportPdf = () => {
        if (!canPrint) return;
        openCecbReportWindow({
        title: "Daily Attendance Summary",
        fileName: buildPdfFileName("daily-attendance-summary", from, "to", to),
        subtitle: `Period: ${from} to ${to}`,
        headers: dailyHeaders,
        rows: dailyRows(),
        landscape: true,
        summaryItems: [
            ["Period", from === to ? from : `${from} to ${to}`],
            ["Days", data.length],
            ["Present", data.reduce((sum, r) => sum + (Number(r.present) || 0), 0)],
            ["Late", data.reduce((sum, r) => sum + (Number(r.late) || 0), 0)]
        ]
        });
    };

    return (
        <div className="space-y-4">
            <RangePicker from={from} to={to} onFrom={setFrom} onTo={setTo} onSearch={load} loading={loading} />
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">⚠️ {error}</div>}
            {data.length > 0 && (
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h2 className="text-base font-semibold text-gray-700">Daily Summary — {from} to {to}</h2>
                        <div className="flex gap-2">
                            <button onClick={exportData} disabled={!canExport} title={canExport ? "Export CSV" : EXPORT_DENIED_TITLE}
                                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">📥 CSV</button>
                            <button onClick={exportPdf} disabled={!canPrint} title={canPrint ? "Print / save PDF" : PRINT_DENIED_TITLE}
                                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">🖨️ PDF</button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                                    <th className="px-4 py-3 text-left">Date</th>
                                    <th className="px-4 py-3 text-center">Source</th>
                                    <th className="px-4 py-3 text-center">Registered</th>
                                    <th className="px-4 py-3 text-center">Present</th>
                                    <th className="px-4 py-3 text-center">Absent</th>
                                    <th className="px-4 py-3 text-center">On Time</th>
                                    <th className="px-4 py-3 text-center">Late</th>
                                    <th className="px-4 py-3 text-center">Checked Out</th>
                                    <th className="px-4 py-3 text-left">Attendance %</th>
                                    <th className="px-4 py-3 text-center">Avg Work Hrs</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.map((r, i) => (
                                    <tr key={i} className="hover:bg-gray-50">
                                        <td className="px-4 py-2.5 font-medium text-gray-700">{r.date}</td>
                                        <td className="px-4 py-2.5 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs ${r.isSynced === false ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                                                {r.isSynced === false ? "Not synced" : "Synced"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-center text-gray-600">{r.totalRegistered}</td>
                                        <td className="px-4 py-2.5 text-center font-medium text-green-600">{r.present}</td>
                                        <td className="px-4 py-2.5 text-center text-red-500">{r.absent}</td>
                                        <td className="px-4 py-2.5 text-center text-green-500">{r.onTime}</td>
                                        <td className="px-4 py-2.5 text-center text-yellow-600">{r.late}</td>
                                        <td className="px-4 py-2.5 text-center text-blue-600">{r.checkedOut}</td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-20 bg-gray-100 rounded-full h-1.5">
                                                    <div className={`h-1.5 rounded-full ${r.attendanceRate >= 80 ? "bg-green-500" : r.attendanceRate >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                                                        style={{ width: `${Math.min(r.attendanceRate, 100)}%` }} />
                                                </div>
                                                <span className="text-xs font-medium">{r.attendanceRate}%</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-center text-gray-600">{r.averageWorkHours}h</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── All Employees Summary ────────────────────────────────────────────────────
function AllEmployeeSummary() {
    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo] = useState(today);
    const [data, setData] = useState([]);
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState("epfNo");
    const [sortAsc, setSortAsc] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [page, setPage] = useState(1);
    const canExport = canExportReports();
    const canPrint = canPrintReports();

    const load = async () => {
        setLoading(true); setError("");
        try { setData(await reportApi.getAllEmployees(from, to)); setPage(1); }
        catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    const sort = (col) => {
        if (sortBy === col) setSortAsc(p => !p);
        else { setSortBy(col); setSortAsc(true); }
        setPage(1);
    };

    const filtered = (search
        ? data.filter(r =>
            (r.epfNo ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (r.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (r.agmUnit ?? "").toLowerCase().includes(search.toLowerCase()))
        : data
    ).slice().sort((a, b) => {
        const va = a[sortBy] ?? "";
        const vb = b[sortBy] ?? "";
        return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const SortTh = ({ col, label }) => (
        <th onClick={() => sort(col)} className="px-4 py-3 text-center cursor-pointer hover:bg-gray-200 select-none">
            {label} {sortBy === col ? (sortAsc ? "↑" : "↓") : ""}
        </th>
    );

    const allEmpHeaders = ["EPF", "Name", "Designation", "AGM Unit", "DGM Unit", "Service Unit", "Working Days", "Unsynced", "Present", "Absent", "Late", "On Time", "Attendance %", "Total Work Hrs", "Avg Work Hrs"];
    const allEmpRows = () => filtered.map(r => [r.epfNo, r.name, r.designation ?? "", r.agmUnit ?? "", r.dgmUnit ?? "", r.serviceUnit ?? "", r.workingDays, r.unsyncedDays ?? 0, r.presentDays, r.absentDays, r.lateDays, r.ontimeDays, r.attendanceRate + "%", r.totalWorkHours, r.averageWorkHours]);
    const exportData = () => {
        if (!canExport) return;
        exportCsv(`all-employees-${from}-${to}.csv`, allEmpHeaders, allEmpRows());
    };
    const exportPdf = () => {
        if (!canPrint) return;
        openCecbReportWindow({
        title: "All Employees Attendance Summary",
        fileName: buildPdfFileName("all-employees-attendance", from, "to", to),
        subtitle: `Period: ${from} to ${to}`,
        headers: allEmpHeaders,
        rows: allEmpRows(),
        landscape: true,
        summaryItems: [
            ["Period", from === to ? from : `${from} to ${to}`],
            ["Employees", filtered.length],
            ["Present Days", filtered.reduce((sum, r) => sum + (Number(r.presentDays) || 0), 0)],
            ["Late Days", filtered.reduce((sum, r) => sum + (Number(r.lateDays) || 0), 0)]
        ]
        });
    };

    return (
        <div className="space-y-4">
            <RangePicker from={from} to={to} onFrom={setFrom} onTo={setTo} onSearch={load} loading={loading} />
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">⚠️ {error}</div>}
            {data.length > 0 && (
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                        <h2 className="text-base font-semibold text-gray-700">
                            All Employees — {from} to {to}
                            <span className="ml-2 text-sm font-normal text-gray-400">({filtered.length} records)</span>
                        </h2>
                        <div className="flex items-center gap-3">
                            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                                placeholder="Filter name / EPF / unit…"
                                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 w-52" />
                            <button onClick={exportData} disabled={!canExport} title={canExport ? "Export CSV" : EXPORT_DENIED_TITLE}
                                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">📥 CSV</button>
                            <button onClick={exportPdf} disabled={!canPrint} title={canPrint ? "Print / save PDF" : PRINT_DENIED_TITLE}
                                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">🖨️ PDF</button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                                    <SortTh col="epfNo" label="EPF" />
                                    <th className="px-4 py-3 text-left">Name</th>
                                    <th className="px-4 py-3 text-left">Unit</th>
                                    <SortTh col="unsyncedDays" label="Unsynced" />
                                    <SortTh col="presentDays" label="Present" />
                                    <SortTh col="absentDays" label="Absent" />
                                    <SortTh col="lateDays" label="Late" />
                                    <SortTh col="attendanceRate" label="Rate %" />
                                    <SortTh col="totalWorkHours" label="Total Hrs" />
                                    <SortTh col="averageWorkHours" label="Avg Hrs/Day" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {pageData.map((r, i) => (
                                    <tr key={i} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 font-mono text-gray-600 text-center">{r.epfNo}</td>
                                        <td className="px-4 py-2 text-gray-800">{r.name}</td>
                                        <td className="px-4 py-2 text-gray-500 text-xs">{r.serviceUnit ?? r.dgmUnit ?? r.agmUnit ?? ""}</td>
                                        <td className="px-4 py-2 text-center text-amber-600">{r.unsyncedDays ?? 0}</td>
                                        <td className="px-4 py-2 text-center text-green-600 font-medium">{r.presentDays}</td>
                                        <td className="px-4 py-2 text-center text-red-500">{r.absentDays}</td>
                                        <td className="px-4 py-2 text-center text-yellow-600">{r.lateDays}</td>
                                        <td className="px-4 py-2 text-center">
                                            <span className={`font-semibold ${r.attendanceRate >= 80 ? "text-green-600" : r.attendanceRate >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                                                {r.attendanceRate}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-center text-gray-600">{r.totalWorkHours}h</td>
                                        <td className="px-4 py-2 text-center text-gray-600">{r.averageWorkHours}h</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
                </div>
            )}
        </div>
    );
}

// ── OT Summary ───────────────────────────────────────────────────────────────
function OTSummaryReport() {
    const currentDate = new Date();
    const [selectedYear, setSelectedYear] = useState(String(currentDate.getFullYear()));
    const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
    const [data, setData] = useState([]);
    const [reportRange, setReportRange] = useState(null);
    const [empMap, setEmpMap] = useState({});
    const [expanded, setExpanded] = useState({});
    const [filterEpf, setFilterEpf] = useState("");
    const [filterAGM, setFilterAGM] = useState("");
    const [filterDGM, setFilterDGM] = useState("");
    const [filterDesignation, setFilterDesignation] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const empMapLoaded = useRef(false);
    const canExport = canExportOtSummary();
    const canPrint = canPrintOtSummary();
    const selectedRange = monthRange(selectedYear, selectedMonth);
    const { from, to } = selectedRange;
    const selectedIsFuture = isFutureRange(selectedRange);
    const selectionChanged = !!reportRange && selectedRange.isValid &&
        (reportRange.from !== selectedRange.from || reportRange.to !== selectedRange.to);

    useEffect(() => {
        if (empMapLoaded.current) return;
        empMapLoaded.current = true;
        get("/Employee").then(list => {
            const map = {};
            (Array.isArray(list) ? list : []).forEach(e => {
                if (e.epfNo) map[e.epfNo] = { agmUnit: e.agmWorkSpaceName ?? "", dgmUnit: e.dgmWorkSpaceName ?? "", designation: e.designationName ?? "" };
            });
            setEmpMap(map);
        }).catch(() => {});
    }, []);

    const load = async () => {
        if (!selectedRange.isValid) {
            setError("Enter a valid year.");
            setNotice("");
            return;
        }

        if (selectedIsFuture) {
            setError("");
            setNotice(`Future month selected: ${selectedRange.label}. OT data is available only for current or past months.`);
            return;
        }

        setLoading(true); setError("");
        setNotice("");
        setFilterEpf(""); setFilterAGM(""); setFilterDGM(""); setFilterDesignation("");
        try {
            const result = await reportApi.getOtSummary(from, to);
            const rows = Array.isArray(result) ? result : [];
            setData(rows);
            setReportRange({ ...selectedRange });
            setExpanded({});
            setNotice(rows.length ? "" : `No OT records found for ${selectedRange.label}.`);
        }
        catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    const toggle = (epf) => setExpanded(p => ({ ...p, [epf]: !p[epf] }));
    const getAGM = (e) => e.agmUnit || empMap[e.epfNo]?.agmUnit || "";
    const getDGM = (e) => e.dgmUnit || empMap[e.epfNo]?.dgmUnit || "";
    const getDesignation = (e) => e.designation || empMap[e.epfNo]?.designation || "";
    const payableOTHours = (e) => e.payableOTHours ?? e.totalOTHours ?? 0;

    const agmOptions = [...new Set(data.map(getAGM).filter(Boolean))].sort();
    const dgmOptions = [...new Set(data.filter(e => !filterAGM || getAGM(e) === filterAGM).map(getDGM).filter(Boolean))].sort();
    const designationOptions = [...new Set(
        data.filter(e => (!filterAGM || getAGM(e) === filterAGM) && (!filterDGM || getDGM(e) === filterDGM)).map(getDesignation).filter(Boolean)
    )].sort();

    const filtered = data.filter(e => {
        if (filterEpf && !(e.epfNo ?? "").toLowerCase().includes(filterEpf.toLowerCase().trim())) return false;
        if (filterAGM && getAGM(e) !== filterAGM) return false;
        if (filterDGM && getDGM(e) !== filterDGM) return false;
        if (filterDesignation && getDesignation(e) !== filterDesignation) return false;
        return true;
    });

    const totalOTHours = filtered.reduce((s, e) => s + e.totalOTHours, 0);
    const totalPayableOTHours = filtered.reduce((s, e) => s + payableOTHours(e), 0);

    const otHeaders = ["EPF", "Name", "Designation", "AGM Unit", "DGM Unit", "Unit", "OT Days", "Worked OT Hours", "Payable OT Hours", "Date", "Check Out", "Scheduled End", "OT Duration"];
    const otRows = () => {
        const rows = [];
        filtered.forEach(e => {
            if (e.otRecords.length === 0) {
                rows.push([e.epfNo, e.name, getDesignation(e), getAGM(e), getDGM(e), e.unit ?? "", e.otDays, e.totalOTHours, payableOTHours(e), "", "", "", ""]);
            } else {
                e.otRecords.forEach((r, i) => {
                    rows.push(i === 0
                        ? [e.epfNo, e.name, getDesignation(e), getAGM(e), getDGM(e), e.unit ?? "", e.otDays, e.totalOTHours, payableOTHours(e), r.date, r.checkOut, r.scheduledEnd, r.otDuration]
                        : ["", "", "", "", "", "", "", "", "", r.date, r.checkOut, r.scheduledEnd, r.otDuration]);
                });
            }
        });
        return rows;
    };
    const canUseLoadedReport = !!reportRange && !selectionChanged && !loading;
    const exportData = () => {
        if (!canUseLoadedReport || !canExport) return;
        exportCsv(`ot-summary-${reportRange.from.slice(0, 7)}.csv`, otHeaders, otRows());
    };
    const exportPdf = () => {
        if (!canUseLoadedReport || !canPrint) return;
        openCecbReportWindow({
            title: "Overtime Summary Report",
            fileName: buildPdfFileName("ot-summary", reportRange.from.slice(0, 7)),
            subtitle: `Month: ${reportRange.label}`,
            headers: otHeaders,
            rows: otRows(),
            landscape: true,
            summaryItems: [
                ["Employees with OT", filtered.length],
                ["Total OT Days", filtered.reduce((s, e) => s + e.otDays, 0)],
                ["Worked OT Hours", `${totalOTHours.toFixed(1)}h`],
                ["Payable OT Hours", `${totalPayableOTHours.toFixed(1)}h`]
            ]
        });
    };

    const printOTVoucher = async (emp) => {
        if (!canPrint) return;
        if (!canUseLoadedReport || !reportRange) {
            setNotice("Generate the selected month before opening vouchers.");
            return;
        }

        const finalFileName = buildPdfFileName("ot-voucher", emp.epfNo, reportRange.from.slice(0, 7));
        const documentTitle = pdfDocumentTitle(finalFileName);

        // MUST open popup synchronously before any await — browsers block window.open after async boundaries
        const w = window.open("", "_blank", "width=1100,height=860");
        if (!w) {
            alert("Popup blocked. Please allow popups for this site and try again.");
            return;
        }
        w.document.write(pdfPreparingHtml(finalFileName, "Preparing OT voucher..."));
        w.document.close();

        const year = reportRange.year;
        const month = reportRange.month - 1;
        const displayYear = String(year).padStart(4, "0");
        const MONTH_NAMES = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
        const DAY_ABBR = ["SUN","MON","TUE","WED","THU","FRI","SAT"];

        // Always fetch the FULL month of OT data so the voucher is complete
        const monthFrom = reportRange.from;
        const monthTo = reportRange.to;
        let otRecords = emp.otRecords ?? [];
        let attendanceRecords = [];
        let totalEmpOTHours = emp.totalOTHours ?? 0;
        try {
            const [freshOT, employeeAttendance] = await Promise.allSettled([
                reportApi.getOtSummary(monthFrom, monthTo, emp.epfNo),
                reportApi.getEmployee(emp.epfNo, monthFrom, monthTo)
            ]);

            if (freshOT.status === "fulfilled" && Array.isArray(freshOT.value) && freshOT.value.length > 0) {
                otRecords = freshOT.value[0].otRecords ?? otRecords;
                totalEmpOTHours = freshOT.value[0].totalOTHours ?? totalEmpOTHours;
            }

            if (employeeAttendance.status === "fulfilled") {
                attendanceRecords = employeeAttendance.value?.dailyRecords ?? [];
            }
        } catch (_) { /* fall back to existing data */ }

        const otMap = {};
        otRecords.forEach(r => { otMap[r.date] = r; });
        const attendanceMap = {};
        attendanceRecords.forEach(r => { attendanceMap[r.date] = r; });

        const parseOTMinutes = (value) => {
            if (value === null || value === undefined || value === "") return null;
            if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 60);

            const text = String(value).trim();
            if (!text) return null;

            const clock = text.match(/^(\d+):(\d{1,2})(?::\d{1,2})?$/);
            if (clock) return (parseInt(clock[1], 10) * 60) + parseInt(clock[2], 10);

            const duration = text.match(/^(\d+)\s*h(?:ours?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/i);
            if (duration) return (parseInt(duration[1], 10) * 60) + (parseInt(duration[2] || "0", 10) || 0);

            const decimal = Number(text);
            return Number.isFinite(decimal) ? Math.round(decimal * 60) : null;
        };
        const otMinutesFromRecord = (record) => {
            if (!record) return 0;
            const sources = [record.otHours, record.OTHours, record.totalOT, record.otDuration];
            for (const source of sources) {
                const minutes = parseOTMinutes(source);
                if (minutes !== null) return minutes;
            }
            return 0;
        };
        const minutesToParts = (minutes) => ({ h: Math.floor(minutes / 60), m: minutes % 60 });
        // Truncate "HH:MM:SS" → "HH:MM" (database sometimes stores seconds)
        const fmtTime = t => (t || "").slice(0, 5);

        const daysInMonth = Number(reportRange.to.slice(-2));
        const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

        // Official voucher columns: Day | Date | In | Out | hrs | mns | Circuit | Sunday/Statutory | Other | Total | Description | SigApprov
        let tableRows = "";
        let voucherTotalMinutes = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const dt = new Date(0);
            dt.setFullYear(year, month, d);
            dt.setHours(0, 0, 0, 0);
            const dow  = dt.getDay();
            const isWE = dow === 0 || dow === 6;
            const dateStr     = `${displayYear}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
            const displayDate = `${String(d).padStart(2,"0")}/${String(month+1).padStart(2,"0")}/${displayYear}`;
            const otRec = otMap[dateStr];
            const attendanceRec = attendanceMap[dateStr];
            const rowCheckIn = otRec?.checkIn || attendanceRec?.checkIn || "";
            const rowCheckOut = otRec?.checkOut || attendanceRec?.checkOut || "";
            const otMinutes = otMinutesFromRecord(otRec);
            const ot = otMinutes > 0 ? minutesToParts(otMinutes) : null;
            if (otMinutes > 0) voucherTotalMinutes += otMinutes;
            // Apply background to each <td> so colors always print (background on <tr> is unreliable)
            const bg   = isWE ? "background:#d9e1f2;" : "background:#ffffff;";
            const td   = `border:1pt solid #000;${bg}`;

            tableRows += `<tr>
                <td style="${td}padding:1px 2px;text-align:center;">${esc(DAY_ABBR[dow])}</td>
                <td style="${td}padding:1px 3px;">${esc(displayDate)}</td>
                <td style="${td}padding:1px 2px;text-align:center;font-size:8pt;">${esc(fmtTime(rowCheckIn))}</td>
                <td style="${td}padding:1px 2px;text-align:center;font-size:8pt;">${esc(fmtTime(rowCheckOut))}</td>
                <td style="${td}padding:1px 2px;text-align:center;font-size:8pt;">${ot && ot.h ? ot.h : ""}</td>
                <td style="${td}padding:1px 2px;text-align:center;font-size:8pt;">${ot && ot.m !== undefined && ot.m !== 0 ? ot.m : ""}</td>
                <td style="${td}"></td>
                <td style="${td}"></td>
                <td style="${td}"></td>
                <td style="${td}"></td>
                <td style="${td}"></td>
                <td style="${td}"></td>
            </tr>`;
        }

        const fallbackTotalMinutes = Math.round((Number(totalEmpOTHours) || 0) * 60);
        const totalMinutes = voucherTotalMinutes > 0 ? voucherTotalMinutes : fallbackTotalMinutes;
        const totalDecimalText = (totalMinutes / 60).toFixed(2);
        const empName    = esc(emp.name ?? "");
        const desig      = esc(getDesignation(emp));
        const unit       = esc(getDGM(emp) || emp.unit || "");
        const agmUnit    = esc(getAGM(emp) || "");
        const epf        = esc(emp.epfNo ?? "");
        const monthLabel = `${MONTH_NAMES[month]}${displayYear}`;

        const logoSrc = `${process.env.PUBLIC_URL || ""}/cecb-logo.png`;
        const cecbLogo = `<img src="${logoSrc}" class="cecb-logo" alt="CECB logo">`;

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${esc(documentTitle)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
:root{--voucher-scale:.92;}
html{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
body{font-family:"Times New Roman",Times,serif;font-size:9pt;color:#000;padding:12px;background:#f2f2f2;
     -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}

.print-toolbar{position:sticky;top:0;z-index:9999;margin:0 auto 10px auto;width:210mm;max-width:calc(100vw - 24px);display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:9px 10px;font-family:Arial,sans-serif;font-size:12px;color:#334155;box-shadow:0 4px 14px rgba(15,23,42,.12);animation:previewIn .22s ease-out;}
.toolbar-meta{min-width:0;line-height:1.35}.toolbar-file{display:block;max-width:330px;color:#0f172a;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.toolbar-hint{display:block;color:#64748b;font-size:11px}.toolbar-status{color:#2563eb;font-weight:600}
.toolbar-actions{display:flex;align-items:center;gap:6px;white-space:nowrap;}
.print-toolbar button{border:1px solid #94a3b8;background:#fff;color:#0f172a;border-radius:4px;padding:6px 10px;font-weight:600;cursor:pointer;}
.print-toolbar button.primary{background:#155e75;border-color:#155e75;color:white;}
#voucherZoomLabel{display:inline-block;min-width:42px;text-align:center;font-weight:700;color:#0f172a;}
.preview-wrap{display:flex;justify-content:center;align-items:flex-start;}
.voucher-page{width:210mm;height:297mm;overflow:hidden;margin:0 auto;background:#fff;padding:9mm 13.2mm 9.6mm 12.7mm;position:relative;zoom:var(--voucher-scale);animation:previewIn .26s ease-out;}
.page-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;transform:translateY(-1.8mm);}
.hdr-mid{flex:1;text-align:center;padding:0 4px;}
.cecb-logo{width:24mm;height:auto;display:block;margin-left:auto;}
.org{font-size:8.95pt;font-weight:normal;}
.doc{font-size:10.65pt;font-weight:bold;margin-top:2px;}
.month-lbl{font-weight:bold;font-size:9.75pt;margin:5px 0 3px 0;}

.emp-panel{display:grid;grid-template-columns:47.5% 38% 14.5%;border:1pt solid #000;border-bottom:0;font-size:8.95pt;min-height:21mm;}
.emp-left,.emp-mid,.emp-sign{min-height:21mm;padding:2.6mm 2.4mm 2.2mm 2.4mm;}
.emp-left,.emp-mid{border-right:1pt solid #000;}
.emp-line{display:grid;align-items:baseline;line-height:1.34;min-height:5mm;}
.emp-left .emp-line{grid-template-columns:30mm 6mm 1fr;}
.emp-mid .emp-line{grid-template-columns:39mm 1fr;}
.emp-no{white-space:nowrap;}
.emp-label{white-space:nowrap;}
.emp-colon{text-align:center;}
.emp-value{white-space:normal;}
.emp-sign{font-size:8.8pt;font-weight:bold;line-height:1.32;text-align:left;padding-left:2.5mm;position:relative;overflow:hidden;}
.emp-sign-lines{font-weight:normal;text-align:center;margin-top:0;line-height:.88;font-size:6.1pt;position:absolute;left:2.5mm;right:2.4mm;bottom:.9mm;}

.main-tbl{width:100%;border-collapse:collapse;table-layout:fixed;}
.main-tbl th{border:1pt solid #000;padding:0;text-align:center;
             background-color:#fff !important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;
             font-size:7.95pt;line-height:1.02;vertical-align:middle;font-weight:bold;height:3.85mm;}
.main-tbl td{border:1pt solid #000;padding:0 0.5mm;vertical-align:middle;height:4.38mm;font-size:7.05pt;}
.ot-total-label{border:0!important;padding:1px 5px 0 4mm!important;font-size:8.8pt!important;font-weight:bold!important;text-align:left!important;height:5.2mm!important;}
.ot-total-box{border:1pt solid #000!important;padding:1px 2px!important;font-size:8.8pt!important;font-weight:bold!important;text-align:center!important;height:5.2mm!important;}
.ot-total-empty{border:1pt solid #000!important;height:5.2mm!important;}
.ot-total-none{border:0!important;height:5.2mm!important;}

.voucher-bottom{font-size:8pt;color:#000;margin-top:2mm;}
.amount-row{display:grid;grid-template-columns:57% 43%;min-height:28mm;align-items:start;}
.amount-left{padding-left:24mm;padding-top:7mm;font-weight:bold;font-size:8.8pt;white-space:nowrap;}
.amount-left .dots{display:inline-block;margin-left:7mm;min-width:42mm;border-bottom:1pt dotted #000;height:3.5mm;vertical-align:baseline;}
.check-right{padding-top:3.5mm;text-align:right;font-size:8.8pt;font-weight:bold;line-height:2.1;white-space:nowrap;}
.check-right .dots{display:inline-block;min-width:27mm;border-bottom:1pt dotted #000;height:3.3mm;margin-left:5mm;vertical-align:baseline;}
.signature-row{display:grid;grid-template-columns:52% 45%;gap:3%;align-items:stretch;min-height:40mm;}
.applicant-block{padding-left:3mm;font-size:8pt;line-height:1.22;}
.app-sign-line{display:grid;grid-template-columns:auto 1fr;column-gap:7mm;align-items:end;margin-bottom:1.5mm;font-size:8.8pt;}
.app-sign-line .dots{border-bottom:1pt dotted #000;height:3mm;}
.app-text{font-size:8pt;margin-bottom:2.4mm;}
.cert-line{display:grid;grid-template-columns:22mm 1fr 13mm 20mm;column-gap:3mm;align-items:end;margin-bottom:1.8mm;}
.cert-line .dots{border-bottom:1pt dotted #000;height:3mm;}
.receipt-title{margin-bottom:1mm;}
.receipt-box{border:1pt solid #000;height:14mm;padding:2.2mm 4mm 1.2mm 4mm;}
.receipt-dots{display:grid;grid-template-columns:28% 62%;gap:8%;margin-bottom:2mm;}
.receipt-dots span{border-bottom:1pt dotted #000;height:3mm;}
.receipt-labels{display:grid;grid-template-columns:28% 62%;gap:8%;font-weight:bold;}
.finance-box{border:1pt solid #000;font-size:8pt;line-height:1.15;align-self:stretch;}
.finance-title{text-align:center;font-size:8.95pt;font-weight:normal;border-bottom:1pt solid #000;padding:.9mm 0 .7mm 0;}
.finance-section{border-bottom:1pt solid #000;padding:1mm 4mm 1.1mm 4mm;}
.finance-section.last{border-bottom:0;padding-top:3.7mm;}
.finance-cert{display:grid;grid-template-columns:39% 61%;align-items:end;margin-bottom:2mm;}
.finance-cert .dots,.finance-date .dots{border-bottom:1pt dotted #000;height:3mm;}
.finance-date{display:grid;grid-template-columns:14mm 27mm 1fr;column-gap:3mm;align-items:end;font-weight:bold;}
.finance-footer-line{display:grid;grid-template-columns:39% 61%;align-items:end;margin-bottom:2.3mm;}
.finance-footer-line .dots{border-bottom:1pt dotted #000;height:3mm;}
.voucher-footer{position:absolute;left:12.7mm;right:13.2mm;bottom:12mm;height:7mm;margin-top:0;border-top:1pt solid #000;padding-top:2.4mm;font-size:6.15pt;text-align:center;}
.voucher-footer span:first-child{position:absolute;left:0;right:0;top:2.4mm;text-align:center;}
.voucher-footer span:last-child{position:absolute;right:0;top:2.15mm;text-align:right;font-size:8pt;}
@keyframes previewIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

@media print{
  @page{size:A4 portrait;margin:0;}
  body{padding:0;margin:0;background:#fff;}
  .print-toolbar{display:none!important;}
  .preview-wrap{display:block;}
  .voucher-page{margin:0;width:210mm;height:297mm;overflow:hidden;break-inside:avoid;page-break-inside:avoid;zoom:1!important;}
  html,body,*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
}
</style></head><body>
<div class="print-toolbar">
  <div class="toolbar-meta"><span class="toolbar-file">${esc(finalFileName)}</span><span class="toolbar-hint">A4 portrait · Scale 100% · Margins none · Headers/footers off · <span id="pdfStatus" class="toolbar-status">Ready</span></span></div>
  <div class="toolbar-actions">
    <button type="button" onclick="zoomVoucher(-.05)">-</button>
    <span id="voucherZoomLabel">92%</span>
    <button type="button" onclick="zoomVoucher(.05)">+</button>
    <button type="button" onclick="setVoucherZoom(1)">100%</button>
    <button type="button" onclick="fitVoucherZoom()">Fit</button>
    <button type="button" onclick="closePdfPreview()">Close</button>
    <button type="button" class="primary" onclick="startPdfPrint()">Print / Save PDF</button>
  </div>
</div>
<div class="preview-wrap">
<div class="voucher-page">

<!-- HEADER -->
<div class="page-hdr">
  <div style="width:24mm;flex-shrink:0;font-weight:bold;font-size:9.75pt;line-height:1.25;">${MONTH_NAMES[month]}${year}</div>
  <div class="hdr-mid">
    <div class="org">CENTRAL ENGINEERING CONSULTANCY BUREAU</div>
    <div class="doc">EXTRA HOURS /OVER TIME VOUCHER</div>
  </div>
  <div style="width:24mm;flex-shrink:0;text-align:right;">${cecbLogo}</div>
</div>

<!-- EMPLOYEE INFO TABLE -->
<div class="emp-panel">
  <div class="emp-left">
    <div class="emp-line"><span class="emp-no">1.Name</span><span class="emp-colon">:</span><span class="emp-value">${empName}</span></div>
    <div class="emp-line"><span class="emp-no">2.Designation</span><span class="emp-colon">:</span><span class="emp-value">${desig}</span></div>
    <div class="emp-line"><span class="emp-no">3.Unit/Branch</span><span class="emp-colon">:</span><span class="emp-value">${unit}<br>${agmUnit}</span></div>
  </div>
  <div class="emp-mid">
    <div class="emp-line"><span class="emp-label">4.E.P.F No</span><span class="emp-value">${epf}</span></div>
    <div class="emp-line"><span class="emp-label">5.Salary per month</span><span class="emp-value">............................</span></div>
    <div class="emp-line"><span class="emp-label">6.Rate per Day /Hour :</span><span class="emp-value">............................</span></div>
    <div class="emp-line"><span class="emp-label">7.No.of Hours Overtime Allowed:</span><span class="emp-value">..............</span></div>
  </div>
  <div class="emp-sign">
    <div>Sig. &amp; Desig. of<br>Authorized<br>Officer</div>
    <div class="emp-sign-lines">
      .............................<br>
      .............................<br>
      .............................<br>
      ............
    </div>
  </div>
</div>

<!-- MAIN OT TABLE -->
<table class="main-tbl">
  <colgroup>
    <col style="width:7%">   <!-- Day -->
    <col style="width:9%">   <!-- Date -->
    <col style="width:7.5%"> <!-- In Time -->
    <col style="width:7.5%"> <!-- Out Time -->
    <col style="width:5%">   <!-- hrs -->
    <col style="width:5%">   <!-- mns -->
    <col style="width:7%">   <!-- Circuit -->
    <col style="width:8%">   <!-- Sunday/Statutory -->
    <col style="width:6%">   <!-- Other -->
    <col style="width:5.5%"> <!-- Total Hrs -->
    <col style="width:16.5%"> <!-- Description of work -->
    <col style="width:16%">  <!-- Sig Approv -->
  </colgroup>
  <thead>
    <tr>
      <th rowspan="2">Day</th>
      <th rowspan="2">Date</th>
      <th rowspan="2">In<br>Time</th>
      <th rowspan="2">Out<br>Time</th>
      <th colspan="2">Sub Total</th>
      <th colspan="3">Additional Hours</th>
      <th rowspan="2">Total<br>Hrs</th>
      <th rowspan="2">Description of work</th>
      <th rowspan="2">Signature of<br>Approv. Officer</th>
    </tr>
    <tr>
      <th>hrs.</th>
      <th>mns.</th>
      <th>Circuit</th>
      <th>Sunday/<br>Statutory</th>
      <th>Other<br>Hrs</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="4" class="ot-total-label">Total Extra hours / Over time :</td>
      <td colspan="2" class="ot-total-box">${totalDecimalText}</td>
      <td class="ot-total-empty"></td>
      <td class="ot-total-empty"></td>
      <td class="ot-total-empty"></td>
      <td class="ot-total-empty"></td>
      <td colspan="2" class="ot-total-none"></td>
    </tr>
  </tfoot>
</table>

<!-- BOTTOM SECTION -->
<div style="display:none;">

  <!-- Total Amount / Attendance Checked — "Attendance Checked by" and "Date" stack vertically on right -->
  <div style="display:grid;grid-template-columns:61% 39%;align-items:start;line-height:1.15;padding-bottom:1px;">
    <div style="padding-left:31mm;white-space:nowrap;"><strong>Total  Amount :</strong> &nbsp;...................................................</div>
    <div style="text-align:right;white-space:nowrap;">
      <div><strong>Attendance&nbsp;&nbsp;Checked by :</strong> &nbsp;........................</div>
      <div style="margin-top:2px;"><strong>Date :</strong> &nbsp;........................</div>
    </div>
  </div>

  <!-- Two-column section -->
  <div style="display:grid;grid-template-columns:52% 46%;gap:2%;margin-top:1mm;align-items:end;">

    <!-- LEFT column -->
    <div style="font-size:8.2pt;line-height:1.14;">
      <div style="white-space:nowrap;"><strong>Signature of the Applicant :</strong> &nbsp;.................................................................</div>
      <p style="margin-top:2px;font-size:7.8pt;">I am personally satisfied that the overtime earned in accordance with<br>regulations is fair and reasonable .</p>
      <div style="display:grid;grid-template-columns:18mm 1fr 12mm 18mm;column-gap:2mm;align-items:end;margin-top:3px;">
        <strong>Certified by</strong>
        <span>........................................</span>
        <strong>Date :</strong>
        <span>.............</span>
      </div>
      <p style="margin-top:3px;"><strong>Receipt Acknowledgement</strong></p>
      <div style="border:1pt solid #000;height:12mm;margin-top:1px;padding:2mm 4mm 1mm 4mm;">
        <div style="display:grid;grid-template-columns:35% 65%;gap:12px;">
          <span>.....................</span>
          <span>............................................</span>
        </div>
        <div style="display:grid;grid-template-columns:35% 65%;gap:12px;margin-top:1mm;">
          <span><strong>Date</strong></span>
          <span><strong>Signature of Payee</strong></span>
        </div>
      </div>
    </div>

    <!-- RIGHT column: For Finance Unit Use -->
    <div style="font-size:7.8pt;">
      <div style="font-weight:normal;text-align:center;margin-bottom:0;font-size:8.2pt;border:1pt solid #000;border-bottom:0;padding:.6mm;">For Finance Unit Use</div>
      <table style="width:100%;border-collapse:collapse;font-size:7.8pt;line-height:1.04;">
        <tr>
          <td style="width:48%;border:1pt solid #000;padding:.8mm 1.4mm;font-weight:normal;">Certified the Payment</td>
          <td style="border:1pt solid #000;padding:.8mm 1.4mm;">&nbsp;......................................</td>
        </tr>
        <tr>
          <td style="border:1pt solid #000;padding:.8mm 1.4mm;"><strong>Date</strong> &nbsp;&nbsp;............</td>
          <td style="border:1pt solid #000;padding:.8mm 1.4mm;"><strong>Signature &amp; Designation of Officer</strong></td>
        </tr>
        <tr>
          <td style="border:1pt solid #000;padding:.8mm 1.4mm;font-weight:normal;">Approved the Payment</td>
          <td style="border:1pt solid #000;padding:.8mm 1.4mm;">&nbsp;......................................</td>
        </tr>
        <tr>
          <td style="border:1pt solid #000;padding:.8mm 1.4mm;"><strong>Date</strong> &nbsp;&nbsp;............</td>
          <td style="border:1pt solid #000;padding:.8mm 1.4mm;"><strong>Signature &amp; Designation of Officer</strong></td>
        </tr>
        <tr>
          <td colspan="2" style="border:1pt solid #000;padding:1mm 1.4mm;text-align:center;">............................................................</td>
        </tr>
        <tr>
          <td style="border:1pt solid #000;padding:.8mm 1.4mm;"><strong>Date</strong> &nbsp;&nbsp;............</td>
          <td style="border:1pt solid #000;padding:.8mm 1.4mm;"><strong>OT Checked by</strong></td>
        </tr>
      </table>
    </div>

  </div>

</div>

<div class="voucher-bottom">
  <div class="amount-row">
    <div class="amount-left">Total&nbsp;&nbsp;Amount : <span class="dots"></span></div>
    <div class="check-right">
      <div>Attendance&nbsp;&nbsp;Checked by : <span class="dots"></span></div>
      <div>Date&nbsp;&nbsp; : <span class="dots"></span></div>
    </div>
  </div>

  <div class="signature-row">
    <div class="applicant-block">
      <div class="app-sign-line"><strong>Signature of the Applicant :</strong><span class="dots"></span></div>
      <div class="app-text">I am personally satisfied that the overtime earned in accordance with<br>regulations is fair and reasonable .</div>
      <div class="cert-line">
        <strong>Certified by</strong><span class="dots"></span>
        <strong>Date :</strong><span class="dots"></span>
      </div>
      <div class="receipt-title">Receipt Acknowledgement</div>
      <div class="receipt-box">
        <div class="receipt-dots"><span></span><span></span></div>
        <div class="receipt-labels"><strong>Date</strong><strong>Signature of Payee</strong></div>
      </div>
    </div>

    <div class="finance-box">
      <div class="finance-title">For Finance Unit Use</div>
      <div class="finance-section">
        <div class="finance-cert"><span>Certified the Payment</span><span class="dots"></span></div>
        <div class="finance-date"><strong>Date</strong><span class="dots"></span><strong>Signature &amp; Designation of Officer</strong></div>
      </div>
      <div class="finance-section">
        <div class="finance-cert"><span>Approved the Payment</span><span class="dots"></span></div>
        <div class="finance-date"><strong>Date</strong><span class="dots"></span><strong>Signature &amp; Designation of Officer</strong></div>
      </div>
      <div class="finance-section last">
        <div class="finance-footer-line"><span></span><span class="dots"></span></div>
        <div class="finance-date"><strong>Date</strong><span class="dots"></span><strong>OT Checked by</strong></div>
      </div>
    </div>
  </div>
</div>

<!-- FOOTER -->
<div class="voucher-footer">
  <span>ATTENDANCE AND LEAVE INFORMATION MANAGEMENT SYSTEM</span>
  <span>1</span>
</div>
</div>
</div>
<script>
(function(){
  var scale=.92;
  var label=document.getElementById("voucherZoomLabel");
  function apply(next){
    scale=Math.max(.5,Math.min(1.35,next));
    document.documentElement.style.setProperty("--voucher-scale",scale);
    if(label) label.textContent=Math.round(scale*100)+"%";
  }
  window.setVoucherZoom=apply;
  window.zoomVoucher=function(delta){apply(scale+delta);};
  window.fitVoucherZoom=function(){
    var page=document.querySelector(".voucher-page");
    var width=page ? page.offsetWidth : 794;
    apply(Math.min(1,Math.max(.5,(window.innerWidth-36)/width)));
  };
  window.addEventListener("load",window.fitVoucherZoom);
})();
</script>
${printLifecycleScript(finalFileName)}
</body></html>`;

        w.document.open();
        w.document.write(html);
        w.document.close();
    };

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
                    <input
                        type="number"
                        min="1"
                        max="9999"
                        step="1"
                        value={selectedYear}
                        onChange={e => { setSelectedYear(e.target.value); setError(""); setNotice(""); }}
                        placeholder="2026"
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[110px]"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
                    <select
                        value={selectedMonth}
                        onChange={e => { setSelectedMonth(Number(e.target.value)); setError(""); setNotice(""); }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px]"
                    >
                        {MONTH_LABELS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                </div>
                <button onClick={load} disabled={loading || !selectedRange.isValid || selectedIsFuture}
                    className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
                    {loading ? "Loading..." : "Generate Report"}
                </button>
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">⚠️ {error}</div>}
            {(selectedIsFuture || selectionChanged || notice) && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                    {selectedIsFuture
                        ? `Future month selected: ${selectedRange.label}. OT data is available only for current or past months.`
                        : selectionChanged
                            ? `Selection changed to ${selectedRange.label}. Current report still shows ${reportRange.label}; click Generate Report to load the new month.`
                            : notice}
                </div>
            )}
            {loading && reportRange && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600">
                    Loading {selectedRange.label}. The previous report stays visible until the new data is ready.
                </div>
            )}
            {!loading && reportRange && data.length === 0 && (
                <div className="bg-white rounded-xl shadow p-5 text-sm text-gray-500">
                    No OT records found for {reportRange.label}.
                </div>
            )}
            {reportRange && data.length > 0 && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
                            <p className="text-xs text-gray-500">Employees with OT</p>
                            <p className="text-2xl font-bold text-gray-800 mt-1">{filtered.length}</p>
                        </div>
                        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-indigo-500">
                            <p className="text-xs text-gray-500">Total OT Days</p>
                            <p className="text-2xl font-bold text-gray-800 mt-1">{filtered.reduce((s, e) => s + e.otDays, 0)}</p>
                        </div>
                        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-purple-500">
                            <p className="text-xs text-gray-500">Worked OT Hours</p>
                            <p className="text-2xl font-bold text-gray-800 mt-1">{totalOTHours.toFixed(1)}h</p>
                        </div>
                        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-emerald-500">
                            <p className="text-xs text-gray-500">Payable OT Hours</p>
                            <p className="text-2xl font-bold text-gray-800 mt-1">{totalPayableOTHours.toFixed(1)}h</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl shadow overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-3">
                                <h2 className="text-base font-semibold text-gray-700">
                                    OT Summary — {reportRange.label}
                                    {(filterEpf || filterAGM || filterDGM || filterDesignation) && <span className="ml-2 text-sm font-normal text-gray-400">({filtered.length} of {data.length})</span>}
                                </h2>
                                <div className="flex gap-2">
                                    <button onClick={exportData} disabled={!canUseLoadedReport || !canExport} title={canExport ? "Export CSV" : EXPORT_DENIED_TITLE}
                                        className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">📥 CSV</button>
                                    <button onClick={exportPdf} disabled={!canUseLoadedReport || !canPrint} title={canPrint ? "Print / save PDF" : PRINT_DENIED_TITLE}
                                        className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">🖨️ PDF</button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <input
                                    type="text"
                                    value={filterEpf}
                                    onChange={e => setFilterEpf(e.target.value)}
                                    placeholder="Filter by EPF..."
                                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300 w-36"
                                />
                                <select value={filterAGM} onChange={e => { setFilterAGM(e.target.value); setFilterDGM(""); setFilterDesignation(""); }}
                                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300">
                                    <option value="">All AGM Units</option>
                                    {agmOptions.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                                <select value={filterDGM} onChange={e => { setFilterDGM(e.target.value); setFilterDesignation(""); }}
                                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300">
                                    <option value="">All DGM Units</option>
                                    {dgmOptions.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                                <select value={filterDesignation} onChange={e => setFilterDesignation(e.target.value)}
                                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300">
                                    <option value="">All Designations</option>
                                    {designationOptions.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                                {(filterEpf || filterAGM || filterDGM || filterDesignation) && (
                                    <button onClick={() => { setFilterEpf(""); setFilterAGM(""); setFilterDGM(""); setFilterDesignation(""); }}
                                        className="px-3 py-1.5 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50">✕ Clear</button>
                                )}
                            </div>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                                    <th className="px-4 py-3 text-left">Employee</th>
                                    <th className="px-4 py-3 text-left">Unit</th>
                                    <th className="px-4 py-3 text-center">OT Days</th>
                                    <th className="px-4 py-3 text-center">Worked OT</th>
                                    <th className="px-4 py-3 text-center">Payable OT</th>
                                    <th className="px-4 py-3 text-center">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtered.map((e, i) => (
                                    <React.Fragment key={i}>
                                        <tr className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-800">{e.name}</p>
                                                <p className="text-xs text-gray-400 font-mono">{e.epfNo}</p>
                                                {getDesignation(e) && <p className="text-xs text-gray-400">{getDesignation(e)}</p>}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">{e.unit ?? ""}</td>
                                            <td className="px-4 py-3 text-center font-semibold text-indigo-600">{e.otDays}</td>
                                            <td className="px-4 py-3 text-center font-bold text-purple-600">{e.totalOTHours}h</td>
                                            <td className="px-4 py-3 text-center font-bold text-emerald-600">{payableOTHours(e)}h</td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => toggle(e.epfNo)} className="text-xs text-blue-600 hover:underline">
                                                        {expanded[e.epfNo] ? "▲ Hide" : "▼ Show"}
                                                    </button>
                                                    <button onClick={() => printOTVoucher(e)} disabled={!canUseLoadedReport || !canPrint} title={canPrint ? "Print OT voucher" : PRINT_DENIED_TITLE}
                                                        className="text-xs text-emerald-700 border border-emerald-400 rounded px-2 py-0.5 hover:bg-emerald-50 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                                                        Voucher
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {expanded[e.epfNo] && (
                                            <tr>
                                                <td colSpan={6} className="px-6 pb-3 pt-0 bg-gray-50">
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="text-gray-400 uppercase">
                                                                <th className="py-1 text-left">Date</th>
                                                                <th className="py-1 text-left">Check In</th>
                                                                <th className="py-1 text-left">Early OT</th>
                                                                <th className="py-1 text-left">Check Out</th>
                                                                <th className="py-1 text-left">Late OT</th>
                                                                <th className="py-1 text-left">Total OT</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {e.otRecords.map((r, j) => (
                                                                <tr key={j} className="border-t border-gray-200">
                                                                    <td className="py-1 text-gray-700">{r.date}</td>
                                                                    <td className="py-1 font-medium text-green-600">{r.checkIn || "—"}</td>
                                                                    <td className="py-1 font-semibold text-purple-600">{r.morningOT && r.morningOT !== "00:00" ? r.morningOT : "—"}</td>
                                                                    <td className="py-1 font-medium text-blue-600">{r.checkOut || "—"}</td>
                                                                    <td className="py-1 font-semibold text-purple-600">{r.eveningOT && r.eveningOT !== "00:00" ? r.eveningOT : "—"}</td>
                                                                    <td className="py-1 font-bold text-indigo-600">{r.totalOT || r.otDuration}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

// ── Main Reports Page ────────────────────────────────────────────────────────
export default function Reports() {
    const availableTabs = TABS.filter(t => t.canView());
    const [activeTab, setActiveTab] = useState(availableTabs[0]?.key ?? "emp");

    useEffect(() => {
        if (!availableTabs.some(t => t.key === activeTab)) {
            setActiveTab(availableTabs[0]?.key ?? "emp");
        }
    }, [activeTab, availableTabs]);

    return (
        <div className="p-6 space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">Reports</h1>
                <p className="text-sm text-gray-500 mt-0.5">Generate and export attendance reports</p>
            </div>

            <div className="flex gap-2 flex-wrap border-b border-gray-200 pb-0">
                {availableTabs.map(t => (
                    <button key={t.key} onClick={() => setActiveTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition ${
                            activeTab === t.key
                                ? "border-blue-600 text-blue-600 bg-blue-50"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                        }`}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div>
                {activeTab === "management" && <ManagementSummaryReport />}
                {activeTab === "emp"      && <EmployeeReport />}
                {activeTab === "register" && <AttendanceRegister embedded />}
                {activeTab === "ot"       && <OTSummaryReport />}
                {activeTab === "late"     && <LateArrivalsReport />}
                {activeTab === "all"      && <AllEmployeeSummary />}
            </div>
        </div>
    );
}
