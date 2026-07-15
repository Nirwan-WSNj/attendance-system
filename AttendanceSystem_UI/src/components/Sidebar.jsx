import React, { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
    BarChart3,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    ClipboardList,
    Clock3,
    HeartPulse,
    FileText,
    LogOut,
    Search,
    Shield,
    UserCheck,
    Users,
    X
} from "lucide-react";
import { logoutAsync } from "../config/authService";
import {
    canManageClerkAssignments,
    canManageCorrections,
    canManageUsers,
    canViewAllAttendance,
    canViewAnalytics,
    canViewDashboard,
    canViewEmployees,
    canViewOwnData,
    canViewReports,
    canViewSystemHealth,
    getAccessLabel,
    isAttendanceClerkWorkspace
} from "../config/permissions";

const navItems = () => {
    const clerkWorkspace = isAttendanceClerkWorkspace();
    return [
    { to: "/dashboard", Icon: BarChart3, label: "Dashboard", canView: !clerkWorkspace && canViewDashboard() },
    { to: "/my-attendance", Icon: Clock3, label: "My Attendance", canView: canViewOwnData() },
    { to: "/all-attendance", Icon: ClipboardList, label: "Employee Attendance", canView: !clerkWorkspace && canViewAllAttendance() },
    { to: "/corrections", Icon: ClipboardCheck, label: clerkWorkspace ? "Team Attendance" : "Corrections", canView: canManageCorrections() },
    { to: "/assign-clerks", Icon: UserCheck, label: "Clerk Teams", canView: !clerkWorkspace && canManageClerkAssignments() },
    { to: "/system-health", Icon: HeartPulse, label: "System Health", canView: !clerkWorkspace && canViewSystemHealth() },
    { to: "/employees", Icon: Users, label: "Employees", canView: !clerkWorkspace && canViewEmployees() },
    { to: "/users", Icon: Shield, label: "Users", canView: !clerkWorkspace && canManageUsers() },
    { to: "/reports", Icon: FileText, label: "Reports", canView: !clerkWorkspace && canViewReports() },
    { to: "/analytics", Icon: Search, label: "Analytics", canView: !clerkWorkspace && canViewAnalytics() },
    ];
};

export default function Sidebar({ onLogout, mobileOpen = false, onMobileClose = () => {} }) {
    const [collapsed, setCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);
    const sidebarRef = useRef(null);
    const closeButtonRef = useRef(null);
    const returnFocusRef = useRef(null);

    const epfNo = localStorage.getItem("epfNo") || "";
    const decoded = JSON.parse(localStorage.getItem("decodedToken") || "{}");
    const fullName = decoded?.fullName || decoded?.name || epfNo || "User";
    const accessLabel = getAccessLabel();
    const compact = collapsed && !isMobile;

    useEffect(() => {
        const media = window.matchMedia("(max-width: 767px)");
        const handleChange = (event) => setIsMobile(event.matches);
        media.addEventListener("change", handleChange);
        return () => media.removeEventListener("change", handleChange);
    }, []);

    useEffect(() => {
        if (!isMobile || !mobileOpen) return undefined;

        returnFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onMobileClose();
                return;
            }
            if (event.key !== "Tab") return;

            const focusable = sidebarRef.current?.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (!focusable?.length) return;
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

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            window.cancelAnimationFrame(frame);
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = previousOverflow;
            returnFocusRef.current?.focus?.();
        };
    }, [isMobile, mobileOpen, onMobileClose]);

    const handleLogout = async () => {
        onMobileClose();
        await logoutAsync();
        onLogout();
    };

    const items = navItems().filter(i => i.canView);

    return (
        <>
            {mobileOpen && (
                <button
                    type="button"
                    aria-label="Close navigation"
                    onClick={onMobileClose}
                    className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px] md:hidden"
                />
            )}
            <aside
                id="attendance-navigation"
                ref={sidebarRef}
                role={isMobile ? "dialog" : undefined}
                aria-modal={isMobile ? "true" : undefined}
                aria-label="Attendance navigation"
                className={`fixed inset-y-0 left-0 z-50 flex h-screen h-[100dvh] w-60 flex-shrink-0 flex-col overflow-y-auto bg-gradient-to-b from-gray-900 to-gray-800 text-white shadow-xl transition-all duration-300 md:visible md:sticky md:top-0 md:z-auto md:translate-x-0 md:shadow-none ${mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full"} ${compact ? "md:w-16" : "md:w-60"}`}
            >
            <div className={`flex items-center gap-3 px-4 py-5 border-b border-gray-700 ${compact ? "md:justify-center" : ""}`}>
                <Clock3 size={24} className="flex-shrink-0 text-blue-300" />
                {!compact && (
                    <div className="overflow-hidden">
                        <p className="font-bold text-sm leading-tight">Attendance</p>
                        <p className="text-xs text-gray-400">CECB System</p>
                    </div>
                )}
                {!compact && (
                    <button
                        onClick={() => setCollapsed(true)}
                        className="ml-auto hidden text-gray-400 transition hover:text-white md:inline-flex"
                        title="Collapse"
                    >
                        <ChevronLeft size={18} />
                    </button>
                )}
                <button ref={closeButtonRef} type="button" onClick={onMobileClose} className="ml-auto inline-flex text-gray-400 hover:text-white md:hidden" aria-label="Close navigation"><X size={20} /></button>
            </div>

            {compact && (
                <button onClick={() => setCollapsed(false)} className="py-2 text-gray-400 hover:text-white text-center" title="Expand">
                    <ChevronRight size={18} className="mx-auto" />
                </button>
            )}

            <nav className="flex-1 py-4 space-y-1 px-2">
                {items.map(({ to, Icon, label }) => (
                    <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                isActive
                                    ? "bg-blue-600 text-white shadow"
                                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                            } ${compact ? "justify-center" : ""}`
                        }
                        title={compact ? label : undefined}
                        onClick={onMobileClose}
                    >
                        <Icon size={18} className="flex-shrink-0" />
                        {!compact && <span>{label}</span>}
                    </NavLink>
                ))}
            </nav>

            <div className="border-t border-gray-700 p-3">
                {!compact && (
                    <div className="mb-2 px-1">
                        <p className="text-xs font-semibold text-white truncate">{fullName}</p>
                        <p className="text-xs text-gray-400">EPF: {epfNo}</p>
                        <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded mt-1 inline-block">{accessLabel}</span>
                    </div>
                )}
                <button
                    onClick={handleLogout}
                    className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-red-600 hover:text-white transition ${compact ? "justify-center" : ""}`}
                    title="Logout"
                >
                    <LogOut size={18} />
                    {!compact && "Logout"}
                </button>
            </div>
            </aside>
        </>
    );
}
