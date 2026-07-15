import React, { useEffect, useRef, useState } from "react";
import { attendanceApi, reportApi } from "../config/apiClient";
import { canExportAttendanceRegister, canPrintAttendanceRegister } from "../config/permissions";
import { YEAR_OPTIONS } from "../config/utils";
import { buildPdfFileName, pdfDocumentTitle, pdfPreparingHtml, printLifecycleScript } from "../config/pdfUtils";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const PRINT_STYLE = `
@media print {
  @page { size: A4 landscape; margin: 5mm; }
  body * { visibility: hidden; }
  #attendance-register-print, #attendance-register-print * { visibility: visible; }
  #attendance-register-print { position: absolute; left: 0; top: 0; width: 100%; }
  #reg-zoom-wrapper { zoom: 1 !important; }
  .no-print { display: none !important; }
  .unit-section { page-break-before: always; break-before: page; }
  .unit-section:first-child { page-break-before: avoid; break-before: auto; }
  .register-table thead { display: table-header-group; }
  .register-table tr { page-break-inside: avoid; break-inside: avoid; }
}
`;

const FONT = {
    title:     10,
    unitMeta:  7.5,
    thDay:     6.5,
    thDayName: 6,
    epf:       7,
    name:      6.5,
    time:      6,
    legend:    8,
    signature: 9,
    note:      7,
};

function injectPrintStyle() {
    if (typeof document === "undefined" || document.getElementById("reg-print-style")) return;
    const style = document.createElement("style");
    style.id = "reg-print-style";
    style.textContent = PRINT_STYLE;
    document.head.appendChild(style);
}

function fmt(time) {
    if (!time) return "";
    const clean = time.trim().replace(/[AP]M$/i, "").trim();
    const parts = clean.split(":").map(Number);
    if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return time;
    return `${String(parts[0]).padStart(2, "0")}:${String(parts[1]).padStart(2, "0")}`;
}

function hierarchyLabel({ orgName, selectedAgm, selectedDgm, unitName }) {
    return [orgName, selectedAgm, selectedDgm || unitName]
        .filter(Boolean)
        .filter((value, index, arr) => arr.indexOf(value) === index);
}

function cleanName(value) {
    const text = String(value ?? "").trim();
    return text.length > 0 ? text : "";
}

function addWorkspace(tree, parentName, childName) {
    const agm = cleanName(parentName) || "Unassigned";
    const dgm = cleanName(childName);
    if (!tree.has(agm)) tree.set(agm, new Set());
    if (dgm && dgm.toLowerCase() !== agm.toLowerCase()) tree.get(agm).add(dgm);
}

function treeToOptions(tree) {
    return Array.from(tree.entries())
        .map(([agm, dgms]) => ({
            agm,
            dgms: Array.from(dgms).sort((a, b) => a.localeCompare(b)),
        }))
        .sort((a, b) => a.agm.localeCompare(b.agm));
}

function mergeWorkspaceOptions(...lists) {
    const tree = new Map();
    lists.flat().forEach(item => {
        if (!item) return;
        addWorkspace(tree, item.agm, "");
        (item.dgms ?? []).forEach(dgm => addWorkspace(tree, item.agm, dgm));
    });
    return treeToOptions(tree);
}

function normalizeWorkspaceOptions(items) {
    const tree = new Map();
    (items ?? []).forEach(item => {
        const agm = cleanName(item.agm ?? item.agmName ?? item.unitName);
        const dgms = item.dgms ?? item.dgmUnits ?? item.children ?? [];
        if (!agm) return;

        addWorkspace(tree, agm, "");
        dgms.forEach(dgm => {
            const childName = typeof dgm === "string" ? dgm : dgm?.dgm ?? dgm?.unitName ?? dgm?.name;
            addWorkspace(tree, agm, childName);
        });
    });
    return treeToOptions(tree);
}

function buildWorkspaceOptionsFromEmployees(employees) {
    const tree = new Map();
    (employees ?? []).forEach(emp => {
        const agm = cleanName(emp.agmWorkSpaceName ?? emp.AGMWorkSpaceName);
        const dgm = cleanName(emp.dgmWorkSpaceName ?? emp.DGMWorkSpaceName);
        const service = cleanName(emp.serviceUnitName ?? emp.ServiceUnitName);

        const parent = agm || dgm || service || "Unassigned";
        const child = agm ? (dgm || service) : (dgm && service ? service : "");
        addWorkspace(tree, parent, child);
    });
    return treeToOptions(tree);
}

const thStyle = {
    border: "1px solid #000",
    padding: "2px 1px",
    fontWeight: "bold",
    textAlign: "center",
    fontSize: FONT.thDay,
    color: "#000",
};

const tdStyle = {
    border: "1px solid #000",
    padding: "1px 2px",
    fontSize: FONT.name,
    verticalAlign: "middle",
    overflow: "hidden",
    whiteSpace: "nowrap",
};

function RegisterTable({ unit, dayHeaders, orgName, periodLabel, selectedAgm, selectedDgm }) {
    const totalDays = dayHeaders.length;
    const leftLines = hierarchyLabel({ orgName, selectedAgm, selectedDgm, unitName: unit.unitName });

    return (
        <div className="unit-section" style={{ marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 3 }}>
                <tbody>
                    <tr>
                        <td style={{ fontSize: FONT.unitMeta, fontWeight: "bold", width: "28%", lineHeight: 1.15 }}>
                            {leftLines.map(line => <div key={line}>{line}</div>)}
                        </td>
                        <td style={{ fontSize: FONT.title, fontWeight: "bold", textAlign: "center", letterSpacing: 0 }}>
                            ATTENDANCE FOR THE MONTH OF {periodLabel}
                        </td>
                        <td style={{ fontSize: FONT.unitMeta, textAlign: "right", width: "20%", lineHeight: 1.15 }}>
                            <div>{unit.unitLevel}</div>
                            <strong>{unit.unitName}</strong>
                        </td>
                    </tr>
                </tbody>
            </table>

            <table
                className="register-table"
                style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: FONT.name,
                    tableLayout: "fixed",
                }}
            >
                <colgroup>
                    <col style={{ width: "9.5%" }} />
                    {dayHeaders.map(day => (
                        <col key={day.day} style={{ width: `${90.5 / totalDays}%` }} />
                    ))}
                </colgroup>
                <thead>
                    <tr style={{ background: "#d6d6d6", color: "#000" }}>
                        <th rowSpan={2} style={{ ...thStyle, textAlign: "left", paddingLeft: 4 }}>EPFNo</th>
                        {dayHeaders.map(day => (
                            <th
                                key={day.day}
                                style={{
                                    ...thStyle,
                                    background: day.isWeekend ? "#c8c8c8" : "#d6d6d6",
                                    padding: "1px 0",
                                    fontSize: FONT.thDay,
                                }}
                            >
                                {String(day.day).padStart(2, "0")}
                            </th>
                        ))}
                    </tr>
                    <tr style={{ background: "#d6d6d6", color: "#000" }}>
                        {dayHeaders.map(day => (
                            <th
                                key={day.day}
                                style={{
                                    ...thStyle,
                                    background: day.isWeekend ? "#c8c8c8" : "#d6d6d6",
                                    padding: "1px 0",
                                    borderTop: "1px solid #000",
                                    fontSize: FONT.thDayName,
                                }}
                            >
                                {day.dayName}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {unit.employees.map((emp, index) => (
                        <tr key={emp.epfNo || `${emp.name}-${index}`} style={{ background: "#fff", height: 38 }}>
                            <td style={{ ...tdStyle, padding: "2px 3px", whiteSpace: "normal", lineHeight: 1.12 }}>
                                <div style={{ fontWeight: "bold", fontSize: FONT.epf }}>{emp.epfNo}</div>
                                <div style={{ fontSize: FONT.name, fontWeight: "bold", marginTop: 3, overflow: "hidden" }}>{emp.name}</div>
                            </td>
                            {dayHeaders.map(day => {
                                const time = emp.times[day.day];
                                const shaded = time?.isWeekend || day.isWeekend;
                                return (
                                    <td
                                        key={day.day}
                                        style={{
                                            ...tdStyle,
                                            background: shaded ? "#c0c0c0" : "#fff",
                                            padding: 0,
                                            textAlign: "center",
                                            verticalAlign: "middle",
                                            lineHeight: 1,
                                            minWidth: 0,
                                        }}
                                    >
                                        {shaded ? (
                                            <span style={{ color: "#000", fontSize: FONT.time }} />
                                        ) : (
                                            <>
                                                <div style={{ height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FONT.time, color: "#000" }}>
                                                    {time?.checkIn ? fmt(time.checkIn) : ""}
                                                </div>
                                                <div style={{ height: 18, borderTop: "1px solid #bdbdbd", display: "flex", alignItems: "center", justifyContent: "center", fontSize: FONT.time, color: "#000" }}>
                                                    {time?.checkOut ? fmt(time.checkOut) : ""}
                                                </div>
                                            </>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function SignaturePage({ periodLabel, orgName }) {
    return (
        <div className="unit-section" style={{ marginTop: 20, paddingTop: 10 }}>
            <table style={{ width: "100%", marginBottom: 18, fontSize: FONT.legend, borderCollapse: "collapse" }}>
                <tbody>
                    <tr>
                        <td style={{ fontWeight: "bold", fontSize: FONT.signature, paddingBottom: 8 }} colSpan={4}>Legend</td>
                    </tr>
                    <tr>
                        {[
                            ["L", "Leave"],
                            ["D/L", "Duty Leave"],
                            ["C", "Circuit"],
                        ].map(([symbol, label]) => (
                            <td key={symbol} style={{ padding: "2px 12px 2px 0", whiteSpace: "nowrap" }}>
                                <span style={{ border: "1px solid #000", padding: "1px 6px", fontWeight: "bold", marginRight: 5, background: "#f9fafb" }}>
                                    {symbol}
                                </span>
                                {label}
                            </td>
                        ))}
                    </tr>
                    <tr>
                        <td colSpan={4} style={{ paddingTop: 10, color: "#111", fontSize: FONT.legend }}>
                            Short Leave for Late Attendance&nbsp;&nbsp;&nbsp;&nbsp;
                            Non-working Day&nbsp;&nbsp;&nbsp;&nbsp;
                            Short Leave&nbsp;&nbsp;&nbsp;&nbsp;
                            Halfday
                        </td>
                    </tr>
                    <tr>
                        <td colSpan={4} style={{ paddingTop: 8, color: "#555", fontSize: FONT.note }}>
                            Top row = check-in time. Bottom row = check-out time. Shaded columns are non-working dates.
                        </td>
                    </tr>
                </tbody>
            </table>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.signature, marginTop: 24 }}>
                <tbody>
                    <tr>
                        {["Prepared By", "Checked By", "Certified By"].map(role => (
                            <td key={role} style={{ width: "33%", padding: "0 20px 0 0", verticalAlign: "bottom" }}>
                                <div style={{ borderBottom: "1px solid #000", marginBottom: 4, height: 40 }} />
                                <div style={{ fontWeight: "bold" }}>{role} :</div>
                                <div style={{ marginTop: 4, borderBottom: "1px solid #777", height: 20 }} />
                                <div style={{ fontSize: FONT.note, color: "#555", marginTop: 2 }}>Name / Designation / Date</div>
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>

            <div style={{ marginTop: 12, fontSize: FONT.note, color: "#333", textAlign: "right" }}>
                {orgName} - Attendance Register - {periodLabel}
            </div>

            <div style={{ marginTop: 16, border: "1px solid #000", display: "inline-block", padding: "4px 24px 4px 8px", fontSize: FONT.legend }}>
                <strong>FILE No.</strong> ___________________
            </div>
        </div>
    );
}

export default function AttendanceRegister({ embedded = false }) {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [agm, setAgm] = useState("");
    const [dgm, setDgm] = useState("");
    const [orgName, setOrgName] = useState("Central Engineering Consultancy Bureau");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [workspaces, setWorkspaces] = useState([]);
    const [zoom, setZoom] = useState(1.0);
    const printRef = useRef();
    const canExport = canExportAttendanceRegister();
    const canPrint = canPrintAttendanceRegister();

    const zoomIn    = () => setZoom(z => Math.min(2.0, +(z + 0.1).toFixed(1)));
    const zoomOut   = () => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(1)));
    const zoomReset = () => setZoom(1.0);

    useEffect(() => {
        injectPrintStyle();

        const loadWorkspaces = async () => {
            try {
                const workspaceResult = await reportApi.getWorkspaces();
                const normalized = normalizeWorkspaceOptions(workspaceResult);
                if (normalized.length > 0) {
                    setWorkspaces(normalized);
                    return;
                }
            } catch { /* fall through to employee-based fallback */ }

            try {
                const employees = await attendanceApi.getEmployees();
                setWorkspaces(buildWorkspaceOptionsFromEmployees(employees));
            } catch { /* leave workspaces empty — dropdown will show no options */ }
        };

        loadWorkspaces();
    }, []);

    const dgmOptions = workspaces.find(workspace => workspace.agm === agm)?.dgms ?? [];
    const dgmLabel = dgm === "__DIRECT__" ? "Direct under AGM" : dgm;
    const visibleUnits = data?.units ?? [];
    const totalEmp = visibleUnits.reduce((sum, unit) => sum + unit.employees.length, 0);

    const load = async () => {
        setLoading(true);
        setError("");
        setData(null);

        try {
            const result = await reportApi.getAttendanceRegister(year, month, agm, dgm);
            setData(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        if (!data || !canPrint || !printRef.current) return;

        const periodKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
        const finalFileName = buildPdfFileName(
            "attendance-register",
            periodKey,
            agm || "all-sections",
            agm ? (dgmLabel || "all-units") : ""
        );
        const documentTitle = pdfDocumentTitle(finalFileName);
        const popup = window.open("", "_blank", "width=1260,height=860");
        if (!popup) {
            setError("Popup blocked. Allow pop-ups to open the attendance register PDF preview.");
            return;
        }

        popup.document.write(pdfPreparingHtml(finalFileName, "Preparing attendance register..."));
        popup.document.close();

        const esc = value => String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        const registerMarkup = printRef.current.outerHTML;
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(documentTitle)}</title><style>
*{box-sizing:border-box}:root{--register-scale:.92}html{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{margin:0;padding:12px;background:#e5e7eb;color:#000;font-family:Arial,sans-serif;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.preview-toolbar{position:sticky;top:0;z-index:1000;width:297mm;max-width:calc(100vw - 24px);margin:0 auto 10px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:9px 10px;font-size:12px;color:#334155;box-shadow:0 4px 14px rgba(15,23,42,.12);animation:previewIn .22s ease-out}.toolbar-meta{min-width:0;line-height:1.35}.toolbar-file{display:block;max-width:480px;color:#0f172a;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.toolbar-hint{display:block;color:#64748b;font-size:11px}.toolbar-status{color:#2563eb;font-weight:600}.toolbar-actions{display:flex;align-items:center;gap:6px;white-space:nowrap}.preview-toolbar button{border:1px solid #94a3b8;background:#fff;color:#0f172a;border-radius:4px;padding:6px 10px;font-weight:600;cursor:pointer}.preview-toolbar button.primary{background:#155e75;border-color:#155e75;color:#fff}#registerZoomLabel{display:inline-block;min-width:42px;text-align:center;font-weight:700;color:#0f172a}.register-page{width:297mm;min-height:210mm;margin:0 auto;background:#fff;padding:5mm;zoom:var(--register-scale);animation:previewIn .26s ease-out}#attendance-register-print{width:100%;font-family:Arial,sans-serif;background:#fff}.unit-section{page-break-before:always;break-before:page}.unit-section:first-child{page-break-before:avoid;break-before:auto}.register-table thead{display:table-header-group}.register-table tr{page-break-inside:avoid;break-inside:avoid}@keyframes previewIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@media print{@page{size:A4 landscape;margin:5mm}body{padding:0;background:#fff}.preview-toolbar{display:none!important}.register-page{width:auto;min-height:auto;margin:0;padding:0;zoom:1!important}.unit-section{page-break-before:always;break-before:page}.unit-section:first-child{page-break-before:avoid;break-before:auto}.register-table thead{display:table-header-group}.register-table tr{page-break-inside:avoid;break-inside:avoid}}
</style></head><body>
<div class="preview-toolbar"><div class="toolbar-meta"><span class="toolbar-file">${esc(finalFileName)}</span><span class="toolbar-hint">A4 landscape · Scale 100% · Margins: report default (5mm) · Headers/footers off · <span id="pdfStatus" class="toolbar-status">Ready</span></span></div><div class="toolbar-actions"><button type="button" onclick="zoomRegister(-.05)">-</button><span id="registerZoomLabel">92%</span><button type="button" onclick="zoomRegister(.05)">+</button><button type="button" onclick="setRegisterZoom(1)">100%</button><button type="button" onclick="fitRegisterZoom()">Fit</button><button type="button" onclick="closePdfPreview()">Close</button><button type="button" class="primary" onclick="startPdfPrint()">Print / Save PDF</button></div></div>
<div class="register-page">${registerMarkup}</div>
<script>(function(){var scale=.92;var label=document.getElementById("registerZoomLabel");function apply(next){scale=Math.max(.5,Math.min(1.35,next));document.documentElement.style.setProperty("--register-scale",scale);if(label)label.textContent=Math.round(scale*100)+"%";}window.setRegisterZoom=apply;window.zoomRegister=function(delta){apply(scale+delta);};window.fitRegisterZoom=function(){var page=document.querySelector(".register-page");var width=page?page.offsetWidth:1123;apply(Math.min(1,Math.max(.5,(window.innerWidth-36)/width)));};window.addEventListener("load",window.fitRegisterZoom);})();</script>
${printLifecycleScript(finalFileName)}
</body></html>`;

        popup.document.open();
        popup.document.write(html);
        popup.document.close();
    };

    const handleCsvExport = () => {
        if (!data || !canExport) return;
        const dayHeaders = data.dayHeaders;
        const dayNums = dayHeaders.map(day => day.day);
        const headers = [
            "EPF No",
            "Name",
            ...dayNums.flatMap(day => [
                `${String(day).padStart(2, "0")}-IN`,
                `${String(day).padStart(2, "0")}-OUT`,
            ]),
        ];

        const rows = [];
        visibleUnits.forEach(unit => {
            rows.push([unit.unitName, ...Array(headers.length - 1).fill("")]);
            unit.employees.forEach(emp => {
                const row = [emp.epfNo, emp.name];
                dayNums.forEach(day => {
                    const dayHeader = dayHeaders.find(header => header.day === day);
                    const time = emp.times[day];
                    if (dayHeader?.isWeekend) {
                        row.push("WE", "WE");
                        return;
                    }
                    row.push(time?.checkIn ? fmt(time.checkIn) : "", time?.checkOut ? fmt(time.checkOut) : "");
                });
                rows.push(row);
            });
        });

        const lines = [
            headers.join(","),
            ...rows.map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")),
        ];
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const anchor = document.createElement("a");
        anchor.href = URL.createObjectURL(blob);
        anchor.download = `attendance-register-${MONTHS[month - 1].toLowerCase()}-${year}${agm ? "-" + agm.replace(/\s+/g, "-") : ""}.csv`;
        anchor.click();
    };

    const selectCls = "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

    return (
        <div className={embedded ? "space-y-4" : "p-6"}>
            <div className="no-print space-y-4 mb-6">
                <div>
                    {embedded ? (
                        <h2 className="text-lg font-semibold text-gray-800">Attendance Register</h2>
                    ) : (
                        <h1 className="text-2xl font-bold text-gray-800">Attendance Register</h1>
                    )}
                    <p className="text-sm text-gray-500 mt-0.5">Monthly attendance sheet with fingerprint check-in and check-out rows.</p>
                </div>

                <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
                        <select value={year} onChange={event => setYear(+event.target.value)} className={selectCls}>
                            {YEAR_OPTIONS.map(value => <option key={value}>{value}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
                        <select value={month} onChange={event => setMonth(+event.target.value)} className={selectCls}>
                            {MONTHS.map((name, index) => <option key={index + 1} value={index + 1}>{name}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">AGM Section</label>
                        <select
                            value={agm}
                            onChange={event => { setAgm(event.target.value); setDgm(""); }}
                            className={`${selectCls} min-w-[200px]`}
                        >
                            <option value="">All Sections</option>
                            {workspaces.map(workspace => (
                                <option key={workspace.agm} value={workspace.agm}>{workspace.agm}</option>
                            ))}
                        </select>
                    </div>

                    {agm && (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">DGM Unit</label>
                            <select
                                value={dgm}
                                onChange={event => setDgm(event.target.value)}
                                className={`${selectCls} min-w-[200px]`}
                            >
                                <option value="">All Units under {agm}</option>
                                <option value="__DIRECT__">Direct under AGM</option>
                                {dgmOptions.map(option => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Header Name</label>
                        <input
                            type="text"
                            value={orgName}
                            onChange={event => setOrgName(event.target.value)}
                            className={`${selectCls} w-64`}
                        />
                    </div>

                    <button
                        onClick={load}
                        disabled={loading}
                        className="px-5 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition"
                    >
                        {loading ? "Generating..." : "Generate Register"}
                    </button>

                    {data && (
                        <>
                            <button
                                onClick={handlePrint}
                                disabled={!canPrint}
                                title={canPrint ? "Download / Print PDF" : "You do not have permission to print this register."}
                                className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Download / Print PDF
                            </button>
                            <button
                                onClick={handleCsvExport}
                                disabled={!canExport}
                                title={canExport ? "Export CSV" : "You do not have permission to export this register."}
                                className="px-5 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Export CSV
                            </button>
                            <div className="flex items-center gap-1 ml-2 border border-gray-300 rounded-lg overflow-hidden">
                                <button
                                    onClick={zoomOut}
                                    title="Zoom out"
                                    className="px-3 py-2 text-gray-600 hover:bg-gray-100 text-sm font-bold transition"
                                >−</button>
                                <button
                                    onClick={zoomReset}
                                    title="Reset zoom"
                                    className="px-2 py-2 text-xs text-gray-500 hover:bg-gray-100 transition min-w-[46px] text-center"
                                >{Math.round(zoom * 100)}%</button>
                                <button
                                    onClick={zoomIn}
                                    title="Zoom in"
                                    className="px-3 py-2 text-gray-600 hover:bg-gray-100 text-sm font-bold transition"
                                >+</button>
                            </div>
                        </>
                    )}
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>
                )}

                {data && (
                    <div className="flex flex-wrap gap-3 text-sm">
                        <span className="font-semibold text-gray-700">{MONTHS[month - 1]} {year}</span>
                        {agm && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">{agm}</span>}
                        {dgm && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">{dgmLabel}</span>}
                        <span className="text-gray-400">-</span>
                        <span className="text-gray-500">{visibleUnits.length} unit{visibleUnits.length !== 1 ? "s" : ""}</span>
                        <span className="text-gray-400">-</span>
                        <span className="text-gray-500">{totalEmp} employees</span>
                        <span className="text-gray-400">-</span>
                        <span className="text-gray-500">{data.dayHeaders?.length} calendar days</span>
                    </div>
                )}
            </div>

            {data && (
                <div
                    id="reg-zoom-wrapper"
                    style={{
                        overflowX: "auto",
                        transformOrigin: "top left",
                        zoom: zoom,
                    }}
                >
                    <div
                        id="attendance-register-print"
                        ref={printRef}
                        style={{ fontFamily: "Arial, sans-serif", background: "#fff" }}
                    >
                        {visibleUnits.map((unit, index) => (
                            <RegisterTable
                                key={`${unit.unitName}-${index}`}
                                unit={unit}
                                dayHeaders={data.dayHeaders}
                                orgName={orgName}
                                periodLabel={data.periodLabel}
                                selectedAgm={agm}
                                selectedDgm={dgmLabel}
                            />
                        ))}

                        <SignaturePage periodLabel={data.periodLabel} orgName={orgName} />
                    </div>
                </div>
            )}

            {!data && !loading && !error && (
                <div className="bg-white rounded-xl shadow p-16 text-center text-gray-400">
                    <p className="text-base font-medium text-gray-500">Select year, month and AGM/DGM unit then click Generate</p>
                    <p className="text-sm mt-1">The PDF print layout follows the official attendance sheet format.</p>
                </div>
            )}
        </div>
    );
}
