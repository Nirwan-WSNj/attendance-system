import React, { useEffect, useMemo, useState } from "react";
import { attendanceApi, authApi } from "../config/apiClient";

const emptyForm = {
    username: "",
    password: "",
    role: "Employee",
    epfNo: "",
    fullName: ""
};

const roleLabels = {
    LeaveClerk: "Attendance Clerk",
    LeaveAdmin: "Attendance Administrator"
};

const getRoleLabel = (role) => roleLabels[role] || role;

const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-LK");
};

export default function UserManagement() {
    const [users, setUsers] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [form, setForm] = useState(emptyForm);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const load = async () => {
        setLoading(true);
        setError("");
        try {
            const [userRows, employeeRows] = await Promise.all([
                authApi.getUsers(),
                attendanceApi.getEmployees().catch(() => [])
            ]);
            setUsers(Array.isArray(userRows) ? userRows : []);
            setEmployees(Array.isArray(employeeRows) ? employeeRows : []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const employeeByEpf = useMemo(() => {
        const map = new Map();
        employees.forEach(emp => {
            if (emp.epfNo) map.set(String(emp.epfNo).toLowerCase(), emp);
        });
        return map;
    }, [employees]);

    const handleChange = (field, value) => {
        setNotice("");
        setError("");
        if (field === "epfNo") {
            const emp = employeeByEpf.get(String(value).toLowerCase());
            setForm(prev => ({
                ...prev,
                epfNo: value,
                fullName: emp?.nameWithInitial || prev.fullName,
                username: prev.username || value
            }));
            return;
        }
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const createUser = async (event) => {
        event.preventDefault();
        const username = form.username.trim();
        const password = form.password;
        const epfNo = form.epfNo.trim();
        const fullName = form.fullName.trim();

        if (!username || !password) {
            setError("Username and password are required.");
            return;
        }
        if (["Employee", "LeaveClerk"].includes(form.role) && !epfNo) {
            setError("Employee and Attendance Clerk users need an EPF number.");
            return;
        }

        setSaving(true);
        setError("");
        setNotice("");
        try {
            await authApi.createUser({
                username,
                password,
                role: form.role,
                epfNo: epfNo || null,
                fullName: fullName || null
            });
            setForm(emptyForm);
            setNotice(`User ${username} created.`);
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleUser = async (user) => {
        setError("");
        setNotice("");
        try {
            await authApi.toggleUser(user.id, !user.isActive);
            setNotice(`${user.username} ${user.isActive ? "deactivated" : "activated"}.`);
            await load();
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="p-6 space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">Users</h1>
                <p className="text-sm text-gray-500 mt-0.5">Create employee logins and manage account access</p>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>}
            {notice && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{notice}</div>}

            <form onSubmit={createUser} className="bg-white rounded-xl shadow p-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                        <select
                            value={form.role}
                            onChange={e => handleChange("role", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="Employee">Employee</option>
                            <option value="LeaveClerk">Attendance Clerk</option>
                            <option value="LeaveAdmin">Attendance Administrator</option>
                            <option value="Admin">Admin</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">EPF No</label>
                        <input
                            type="text"
                            list="employee-epf-list"
                            value={form.epfNo}
                            onChange={e => handleChange("epfNo", e.target.value)}
                            placeholder="e.g. 031414"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <datalist id="employee-epf-list">
                            {employees.map(emp => (
                                <option key={emp.epfNo} value={emp.epfNo}>
                                    {emp.nameWithInitial || emp.designationName || ""}
                                </option>
                            ))}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
                        <input
                            type="text"
                            value={form.fullName}
                            onChange={e => handleChange("fullName", e.target.value)}
                            placeholder="Employee name"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Username</label>
                        <input
                            type="text"
                            value={form.username}
                            onChange={e => handleChange("username", e.target.value)}
                            placeholder="Login username"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
                        <input
                            type="password"
                            value={form.password}
                            onChange={e => handleChange("password", e.target.value)}
                            placeholder="Temporary password"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
                <div className="mt-4 flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saving ? "Creating..." : "Create User"}
                    </button>
                </div>
            </form>

            <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-gray-700">User Accounts</h2>
                    <button onClick={load} disabled={loading}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                        {loading ? "Loading..." : "Refresh"}
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                                <th className="px-4 py-3 text-left">Username</th>
                                <th className="px-4 py-3 text-left">Role</th>
                                <th className="px-4 py-3 text-left">EPF</th>
                                <th className="px-4 py-3 text-left">Full Name</th>
                                <th className="px-4 py-3 text-left">Last Login</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                            ) : users.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No users found</td></tr>
                            ) : users.map(user => (
                                <tr key={user.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2.5 font-medium text-gray-800">{user.username}</td>
                                    <td className="px-4 py-2.5 text-gray-600">{getRoleLabel(user.role)}</td>
                                    <td className="px-4 py-2.5 font-mono text-gray-600">{user.epfNo || ""}</td>
                                    <td className="px-4 py-2.5 text-gray-600">{user.fullName || ""}</td>
                                    <td className="px-4 py-2.5 text-gray-400 text-xs">{formatDate(user.lastLoginAt)}</td>
                                    <td className="px-4 py-2.5 text-center">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${user.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                            {user.isActive ? "Active" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <button
                                            onClick={() => toggleUser(user)}
                                            className={`px-3 py-1 rounded-lg text-xs border ${user.isActive ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}
                                        >
                                            {user.isActive ? "Deactivate" : "Activate"}
                                        </button>
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
