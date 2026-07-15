import { API_BASE_URL, getAuthHeaders } from "./api";
import { clearAuthData, isAccessTokenValid, refreshAuthAsync } from "./authService";

const SESSION_EXPIRED_MESSAGE = "Session expired. Please login again.";
const REQUEST_TIMEOUT_MS = Number(process.env.REACT_APP_API_TIMEOUT_MS || 15 * 60 * 1000);
const REQUEST_TIMEOUT_LABEL = REQUEST_TIMEOUT_MS >= 60 * 1000
    ? `${Math.round(REQUEST_TIMEOUT_MS / (60 * 1000))} minutes`
    : `${Math.round(REQUEST_TIMEOUT_MS / 1000)} seconds`;

const notifyAuthExpired = () => {
    clearAuthData();
    window.dispatchEvent(new Event("auth:expired"));
};

const tryRefreshAuth = async () => {
    try {
        const refreshed = await refreshAuthAsync();
        return Boolean(refreshed?.accessToken);
    } catch {
        return false;
    }
};

const getErrorMessage = async (res) => {
    const text = await res.text();
    if (!text) return `Request failed: ${res.status}`;

    try {
        const body = JSON.parse(text);
        return body.message || body.title || body.error || text;
    } catch {
        return text;
    }
};

const request = async (path, options = {}) => {
    if (!API_BASE_URL) {
        throw new Error("API URL is not configured. Check REACT_APP_API_BASE_URL.");
    }

    if (!isAccessTokenValid() && !(await tryRefreshAuth())) {
        notifyAuthExpired();
        throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    const url = `${API_BASE_URL}${path}`;

    const send = async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            return await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: { ...getAuthHeaders(), ...(options.headers || {}) }
            });
        } catch (err) {
            if (err?.name === "AbortError") {
                throw new Error(`Request timed out after ${REQUEST_TIMEOUT_LABEL}. Refresh and try again.`);
            }
            throw new Error(`Cannot connect to the API at ${API_BASE_URL}. Start the API and refresh the page.`);
        } finally {
            clearTimeout(timeoutId);
        }
    };

    let res = await send();
    if (res.status === 401) {
        if (await tryRefreshAuth()) {
            res = await send();
        } else {
            notifyAuthExpired();
            throw new Error(SESSION_EXPIRED_MESSAGE);
        }
    }

    if (res.status === 403) {
        throw new Error("You do not have permission to view this data.");
    }

    if (!res.ok) {
        throw new Error(await getErrorMessage(res));
    }

    if (res.status === 204) return null;
    return res.json();
};

export const get = (path) => request(path);
export const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });
export const put = (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) });
export const del = (path) => request(path, { method: "DELETE" });

// Attendance endpoints
export const attendanceApi = {
    getToday: (params = {}) => get(`/Attendance/today${toQuery(params)}`),
    getByDate: (date, params = {}) => get(`/Attendance/bydate/${date}${toQuery(params)}`),
    getByEpf: (epfNo) => get(`/Attendance/byepf/${encodeURIComponent(epfNo)}`),
    getRange: (from, to, params = {}) => get(`/Attendance/range${toQuery({ from, to, ...params })}`),
    getDailyCount: (days, params = {}) => get(`/Attendance/chart/daily-count${toQuery({ days, ...params })}`),
    getArrivalStatus: (days, params = {}) => get(`/Attendance/chart/arrival-status${toQuery({ days, ...params })}`),
    getEmployees: (keyword) => get(`/Employee${keyword ? toQuery({ keyword }) : ""}`),
    getStatus: (epfNo, date) => get(`/Attendance/status/${encodeURIComponent(epfNo)}${date ? `?date=${date}` : ""}`),
    getSourceStatus: (date) => get(`/Attendance/source-status${date ? toQuery({ date }) : ""}`),
    refreshScheduleCache: () => post("/Attendance/cache/refresh-schedules")
};

// Employee endpoints (new API)
export const hrApi = {
    getAllEmployees: (keyword) => get(`/Employee${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ""}`)
};

// Report endpoints
export const reportApi = {
    getAgmWise: (from, to) => get(`/Report/agm-wise?from=${from}&to=${to}`),
    getAllEmployees: (from, to) => get(`/Report/all-employees?from=${from}&to=${to}`),
    getEmployee: (epfNo, from, to) => get(`/Report/employee/${encodeURIComponent(epfNo)}?from=${from}&to=${to}`),
    getLateArrivals: (from, to, epfNo = null) =>
        get(`/Report/late-arrivals?from=${from}&to=${to}${epfNo ? `&epfNo=${encodeURIComponent(epfNo)}` : ""}`),
    getDailySummary: (from, to) => get(`/Report/daily-summary?from=${from}&to=${to}`),
    getOtSummary: (from, to, epfNo = null) => get(`/Report/ot-summary?from=${from}&to=${to}${epfNo ? `&epfNo=${encodeURIComponent(epfNo)}` : ""}`),
    getWorkspaces: () => get(`/Report/workspaces`),
    getAttendanceRegister: (year, month, agm, dgm) =>
        get(`/Report/attendance-register?year=${year}&month=${month}${agm ? `&agm=${encodeURIComponent(agm)}` : ""}${dgm ? `&dgm=${encodeURIComponent(dgm)}` : ""}`),
};

export const correctionApi = {
    getCandidates: (params = {}) => get(`/AttendanceCorrection/candidates${toQuery(params)}`),
    getSessions: (params = {}) => get(`/AttendanceCorrection/sessions${toQuery(params)}`),
    createSession: (payload) => post("/AttendanceCorrection/sessions", payload),
    updateCorrection: (correctionId, payload) => put(`/AttendanceCorrection/${encodeURIComponent(correctionId)}`, payload),
    voidCorrection: (correctionId) => del(`/AttendanceCorrection/${encodeURIComponent(correctionId)}`)
};

export const leaveClerkAssignmentApi = {
    getClerks: () => get("/LeaveClerkAssignment/clerks"),
    getAssignments: (params = {}) => get(`/LeaveClerkAssignment/assignments${toQuery(params)}`),
    assign: (payload) => post("/LeaveClerkAssignment/assign", payload),
    unassign: (payload) => post("/LeaveClerkAssignment/unassign", payload),
    autoAssign: (payload) => post("/LeaveClerkAssignment/auto-assign", payload),
    getAudit: (take = 25) => get(`/LeaveClerkAssignment/audit${toQuery({ take })}`)
};

export const systemHealthApi = {
    get: (date) => get(`/SystemHealth${date ? toQuery({ date }) : ""}`)
};

export const authApi = {
    getUsers: () => get("/Auth/users"),
    createUser: (payload) => post("/Auth/users", payload),
    toggleUser: (id, isActive) => put(`/Auth/users/${id}/toggle?isActive=${isActive}`)
};

function toQuery(params) {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
    if (!entries.length) return "";
    return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}
