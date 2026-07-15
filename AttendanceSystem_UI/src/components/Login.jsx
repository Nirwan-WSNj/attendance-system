import React, { useState } from "react";
import { loginAsync } from "../config/authService";

export default function Login({ onLogin }) {
    const [creds, setCreds] = useState({ username: "", password: "" });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [dark, setDark] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            await loginAsync(creds.username, creds.password);
            onLogin();
        } catch (err) {
            setError(err.message || "Login failed.");
        } finally {
            setLoading(false);
        }
    };

    const bg = dark ? "bg-gray-900" : "bg-gradient-to-br from-blue-50 to-indigo-100";
    const card = dark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900";
    const input = dark
        ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
        : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400";

    return (
        <div className={`min-h-screen flex items-center justify-center ${bg} transition-colors duration-200`}>
            <button
                onClick={() => setDark(!dark)}
                className={`absolute top-5 right-5 p-2 rounded-lg border shadow ${dark ? "bg-gray-700 border-gray-600" : "bg-white border-gray-200"}`}
            >
                {dark ? "☀️" : "🌙"}
            </button>

            <div className="w-full max-w-md px-6">
                <div className={`rounded-2xl shadow-xl p-8 border ${card}`}>
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 mb-4 text-3xl shadow-lg">
                            🕐
                        </div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            Attendance System
                        </h1>
                        <p className={`text-sm mt-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>
                            CECB — Sign in to continue
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className={`block text-sm font-medium mb-1 ${dark ? "text-gray-300" : "text-gray-700"}`}>
                                Username
                            </label>
                            <input
                                type="text"
                                value={creds.username}
                                onChange={e => { setCreds({ ...creds, username: e.target.value }); setError(""); }}
                                className={`w-full px-4 py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${input}`}
                                placeholder="Enter username"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div>
                            <label className={`block text-sm font-medium mb-1 ${dark ? "text-gray-300" : "text-gray-700"}`}>
                                Password
                            </label>
                            <input
                                type="password"
                                value={creds.password}
                                onChange={e => { setCreds({ ...creds, password: e.target.value }); setError(""); }}
                                className={`w-full px-4 py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${input}`}
                                placeholder="Enter password"
                                required
                                disabled={loading}
                            />
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-center gap-2">
                                <span>⚠️</span> {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full py-2.5 rounded-lg font-semibold text-white transition-all ${
                                loading
                                    ? "bg-gray-400 cursor-not-allowed"
                                    : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg"
                            }`}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Signing in...
                                </span>
                            ) : "Sign In"}
                        </button>
                    </form>
                </div>
                <p className={`text-center text-xs mt-4 ${dark ? "text-gray-500" : "text-gray-400"}`}>
                    © 2026 CECB Attendance System
                </p>
            </div>
        </div>
    );
}
