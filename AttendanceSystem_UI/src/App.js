import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Menu } from "lucide-react";
import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import MyAttendance from "./components/MyAttendance";
import AllAttendance from "./components/AllAttendance";
import Employees from "./components/Employees";
import UserManagement from "./components/UserManagement";
import Reports from "./components/Reports";
import Analytics from "./components/Analytics";
import AttendanceCorrections from "./components/AttendanceCorrections";
import ClerkAssignmentsWorkspace from "./components/ClerkAssignmentsWorkspace";
import SystemHealth from "./components/SystemHealth";
import { clearAuthData, isAccessTokenValid } from "./config/authService";
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
    getDefaultRoute,
    isAttendanceClerkWorkspace
} from "./config/permissions";

function GuardedRoute({ canView, children }) {
    return canView ? children : <Navigate to={getDefaultRoute()} replace />;
}

function NoAccess() {
    return (
        <div className="flex min-h-[100dvh] items-center justify-center p-6">
            <div className="w-full max-w-lg rounded-xl border border-amber-200 bg-white p-6 text-center shadow-sm">
                <h1 className="text-xl font-bold text-gray-800">No attendance access assigned</h1>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                    Your account is active, but it does not have an EPF number, attendance role, or module permission.
                    Please contact the system administrator to review your account access.
                </p>
            </div>
        </div>
    );
}

function Layout({ onLogout }) {
    const homeRoute = getDefaultRoute();
    const clerkWorkspace = isAttendanceClerkWorkspace();
    const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

    return (
        <div className="flex min-h-screen min-h-[100dvh] bg-gray-100">
            <Sidebar
                onLogout={onLogout}
                mobileOpen={mobileNavigationOpen}
                onMobileClose={() => setMobileNavigationOpen(false)}
            />
            <main className="min-w-0 flex-1">
                <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:hidden">
                    <button
                        type="button"
                        onClick={() => setMobileNavigationOpen(true)}
                        aria-label="Open navigation"
                        aria-expanded={mobileNavigationOpen}
                        aria-controls="attendance-navigation"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                        <Menu size={20} />
                    </button>
                    <div>
                        <div className="text-sm font-bold text-slate-900">Attendance</div>
                        <div className="text-[11px] text-slate-500">CECB System</div>
                    </div>
                </div>
                <Routes>
                    <Route path="/" element={<Navigate to={homeRoute} replace />} />
                    <Route path="/dashboard" element={<GuardedRoute canView={!clerkWorkspace && canViewDashboard()}><Dashboard /></GuardedRoute>} />
                    <Route path="/my-attendance" element={<GuardedRoute canView={canViewOwnData()}><MyAttendance /></GuardedRoute>} />
                    <Route path="/all-attendance" element={<GuardedRoute canView={!clerkWorkspace && canViewAllAttendance()}><AllAttendance /></GuardedRoute>} />
                    <Route path="/employees" element={<GuardedRoute canView={!clerkWorkspace && canViewEmployees()}><Employees /></GuardedRoute>} />
                    <Route path="/users" element={<GuardedRoute canView={!clerkWorkspace && canManageUsers()}><UserManagement /></GuardedRoute>} />
                    <Route path="/corrections" element={<GuardedRoute canView={canManageCorrections()}><AttendanceCorrections /></GuardedRoute>} />
                    <Route path="/assign-clerks" element={<GuardedRoute canView={!clerkWorkspace && canManageClerkAssignments()}><ClerkAssignmentsWorkspace /></GuardedRoute>} />
                    <Route path="/system-health" element={<GuardedRoute canView={!clerkWorkspace && canViewSystemHealth()}><SystemHealth /></GuardedRoute>} />
                    <Route path="/reports" element={<GuardedRoute canView={!clerkWorkspace && canViewReports()}><Reports /></GuardedRoute>} />
                    <Route path="/analytics" element={<GuardedRoute canView={!clerkWorkspace && canViewAnalytics()}><Analytics /></GuardedRoute>} />
                    <Route path="/no-access" element={<NoAccess />} />
                    <Route path="*" element={<Navigate to={homeRoute} replace />} />
                </Routes>
            </main>
        </div>
    );
}

export default function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(() => {
        if (isAccessTokenValid()) return true;
        clearAuthData();
        return false;
    });

    useEffect(() => {
        const handleAuthExpired = () => setIsLoggedIn(false);
        window.addEventListener("auth:expired", handleAuthExpired);
        return () => window.removeEventListener("auth:expired", handleAuthExpired);
    }, []);

    const handleLogin = () => setIsLoggedIn(true);
    const handleLogout = () => {
        clearAuthData();
        setIsLoggedIn(false);
    };

    if (!isLoggedIn) return <Login onLogin={handleLogin} />;

    return (
        <BrowserRouter>
            <Layout onLogout={handleLogout} />
        </BrowserRouter>
    );
}
