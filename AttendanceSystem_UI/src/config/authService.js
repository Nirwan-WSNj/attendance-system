import { API_BASE_URL, AUTH_BASE_URL } from "./api";

const ROLE_CLAIM = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";
const PERMISSION_CLAIM = "permission";
const NAME_ID_CLAIM = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier";
const SYSTEM_CODE = process.env.REACT_APP_SYSTEM_CODE || "ATTENDANCE";
const ATTENDANCE_CACHE_PREFIXES = ["attendance-dashboard-cache", "all-attendance-cache"];

const trimEndSlash = (value) => (value || "").replace(/\/+$/, "");
const USE_CENTRAL_AUTH = trimEndSlash(AUTH_BASE_URL).toLowerCase() !== trimEndSlash(API_BASE_URL).toLowerCase();

const buildAuthUrl = (action, baseUrl = AUTH_BASE_URL) => {
    const cleanBase = trimEndSlash(baseUrl);
    return /\/Auth$/i.test(cleanBase)
        ? `${cleanBase}/${action}`
        : `${cleanBase}/Auth/${action}`;
};

const localAuthUrl = (action) => buildAuthUrl(action, API_BASE_URL);

const readJson = async (response) => {
    try {
        return await response.json();
    } catch {
        return null;
    }
};

export const decodeJwt = (token) => {
    try {
        const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(decodeURIComponent(
            atob(base64).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
        ));
    } catch {
        return null;
    }
};

const getRoles = (decoded) => {
    const roleClaims = [];
    const claim = decoded?.[ROLE_CLAIM];
    if (Array.isArray(claim)) roleClaims.push(...claim);
    else if (claim) roleClaims.push(claim);

    if (decoded?.roles) {
        try {
            const grouped = typeof decoded.roles === "string" ? JSON.parse(decoded.roles) : decoded.roles;
            if (grouped && typeof grouped === "object") {
                roleClaims.push(...Object.values(grouped).flat());
            }
        } catch {
            // Ignore malformed role JSON and keep direct role claims.
        }
    }

    return [...new Set(roleClaims.filter(Boolean))];
};

const flattenPermissions = (permissions) => {
    if (!permissions) return [];
    if (Array.isArray(permissions)) return permissions;
    if (typeof permissions === "object") return Object.values(permissions).flat().filter(Boolean);
    return [];
};

const getPermissions = (data, decoded) => {
    const permissions = flattenPermissions(data.permissions);
    const claim = decoded?.[PERMISSION_CLAIM];
    if (Array.isArray(claim)) permissions.push(...claim);
    else if (claim) permissions.push(claim);
    return [...new Set(permissions.filter(Boolean))];
};

const readStoredJson = (key, fallback) => {
    try {
        const value = JSON.parse(localStorage.getItem(key) || "null");
        return value ?? fallback;
    } catch {
        return fallback;
    }
};

const normalizeScopeValues = (values) => [...new Set(
    flattenPermissions(values)
        .map(value => String(value).trim().toLowerCase())
        .filter(Boolean)
)].sort();

const hashScope = (value) => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
};

const getBrowserStorage = (name) => {
    try {
        return typeof window !== "undefined" ? window[name] : null;
    } catch {
        return null;
    }
};

const clearCacheStorage = (storage) => {
    if (!storage) return;
    try {
        const keys = [];
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key && ATTENDANCE_CACHE_PREFIXES.some(prefix => key.startsWith(prefix))) {
                keys.push(key);
            }
        }
        keys.forEach(key => storage.removeItem(key));
    } catch {
        // Browser storage can be unavailable in private/incognito modes.
    }
};

export const clearAttendanceCaches = () => {
    clearCacheStorage(getBrowserStorage("sessionStorage"));
    clearCacheStorage(getBrowserStorage("localStorage"));
};

export const getAuthCacheScope = () => {
    const decoded = readStoredJson("decodedToken", {});
    const storedRoles = readStoredJson("roleList", []);
    const storedPermissionList = readStoredJson("permissionList", []);
    const storedPermissions = readStoredJson("permissions", []);

    const userId = String(
        localStorage.getItem("userId") ||
        decoded?.userId || decoded?.UserId || decoded?.sub || decoded?.nameid ||
        decoded?.[NAME_ID_CLAIM] || ""
    ).trim().toLowerCase();
    const employeeId = String(
        localStorage.getItem("employeeId") || decoded?.employeeId || decoded?.EmployeeId || ""
    ).trim().toLowerCase();
    const epfNo = String(
        localStorage.getItem("epfNo") || decoded?.epfNo || decoded?.EpfNo || decoded?.epf || ""
    ).trim().toLowerCase();
    const roles = normalizeScopeValues([...flattenPermissions(storedRoles), ...getRoles(decoded)]);
    const permissions = normalizeScopeValues([
        ...flattenPermissions(storedPermissionList),
        ...getPermissions({ permissions: storedPermissions }, decoded)
    ]);

    const accessToken = localStorage.getItem("accessToken") || "";
    const fallbackIdentity = userId || employeeId || epfNo
        ? ""
        : accessToken ? `token-${hashScope(accessToken)}` : "anonymous";
    const identity = [userId || fallbackIdentity || "-", employeeId || "-", epfNo || "-"]
        .map(value => encodeURIComponent(value))
        .join(".");
    const accessScope = hashScope(JSON.stringify({ roles, permissions }));

    return `auth-v1:${identity}:${accessScope}`;
};

const hasAny = (values, expected) =>
    expected.some(item => values.some(value => String(value).toLowerCase() === String(item).toLowerCase()));

const hasPermission = (permissions, permission) =>
    permissions.some(value => String(value).toLowerCase() === String(permission).toLowerCase());

const hasAnyPermission = (permissions, expected) =>
    expected.some(permission => hasPermission(permissions, permission));

const ADMIN_ROLES = ["Admin", "SUPER_ADMIN", "ADMIN", "DASHBOARD_ADMIN", "ATTENDANCE_ADMIN"];
const VIEW_ALL_PERMISSIONS = [
    "ATTENDANCE.DASHBOARD.VIEW_ALL",
    "ATTENDANCE.ALL_ATTENDANCE.VIEW_ALL",
    "ATTENDANCE.EMPLOYEES.VIEW_ALL",
    "ATTENDANCE.REPORTS.VIEW_ALL",
    "ATTENDANCE.OT_SUMMARY.VIEW_ALL",
    "ATTENDANCE.ATTENDANCE_REGISTER.VIEW_ALL",
    "ATTENDANCE.ANALYTICS.VIEW_ALL",
    "ATTENDANCE.SETTINGS.MANAGE"
];

const isAdminUser = (roleList, permissionList) => {
    return hasAny(roleList, ADMIN_ROLES) || hasAnyPermission(permissionList, VIEW_ALL_PERMISSIONS);
};

export const saveAuthData = (data) => {
    const previousCacheScope = getAuthCacheScope();
    const decoded = decodeJwt(data.accessToken);
    const roleList = getRoles(decoded);
    const permissionList = getPermissions(data, decoded);

    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken || "");
    localStorage.setItem("epfNo", data.epfNo || decoded?.epfNo || "");
    localStorage.setItem("employeeId", data.employeeId || decoded?.employeeId || "");
    localStorage.setItem("userId", data.userId || decoded?.userId || decoded?.sub || decoded?.nameid || decoded?.[NAME_ID_CLAIM] || "");
    localStorage.setItem("roleList", JSON.stringify(roleList));
    localStorage.setItem("permissionList", JSON.stringify(permissionList));
    localStorage.setItem("permissions", JSON.stringify(data.permissions || permissionList));
    localStorage.setItem("decodedToken", JSON.stringify(decoded || {}));

    const isAdmin = isAdminUser(roleList, permissionList);

    localStorage.setItem("isAdmin", isAdmin ? "1" : "0");

    if (previousCacheScope !== getAuthCacheScope()) {
        clearAttendanceCaches();
    }

    return { ...data, decoded, roleList, permissionList, isAdmin };
};

export const clearAuthData = () => {
    clearAttendanceCaches();
    ["accessToken", "refreshToken", "epfNo", "employeeId", "userId", "roleList", "permissionList", "permissions", "decodedToken", "isAdmin"]
        .forEach(k => localStorage.removeItem(k));
};

export const isAccessTokenValid = () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return false;

    const decoded = decodeJwt(token);
    if (!decoded?.exp) return false;

    return decoded.exp * 1000 > Date.now();
};

export const loginAsync = async (username, password) => {
    const useCentralAuth = USE_CENTRAL_AUTH;
    const res = await fetch(
        useCentralAuth ? buildAuthUrl("LoginWithCookie") : localAuthUrl("login"),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            ...(useCentralAuth ? { credentials: "include" } : {}),
            body: JSON.stringify({ username, password, systemCode: SYSTEM_CODE })
        }
    );
    const result = await readJson(res);
    if (!res.ok || !result?.success || !result.data?.accessToken)
        throw new Error(result?.message || "Invalid username or password.");
    clearAttendanceCaches();
    return saveAuthData(result.data);
};

export const refreshAuthAsync = async () => {
    if (!USE_CENTRAL_AUTH) return null;

    const res = await fetch(
        `${buildAuthUrl("RefreshTokenFromCookie")}?systemCode=${encodeURIComponent(SYSTEM_CODE)}`,
        {
            method: "POST",
            credentials: "include"
        }
    );
    const result = await readJson(res);
    if (!res.ok || !result?.success || !result.data?.accessToken)
        throw new Error(result?.message || "Session expired.");
    return saveAuthData(result.data);
};

export const logoutAsync = async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    try {
        if (USE_CENTRAL_AUTH) {
            await fetch(buildAuthUrl("LogoutFromCookie"), {
                method: "POST",
                credentials: "include"
            });
        } else if (refreshToken) {
            await fetch(localAuthUrl("Logout"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ refreshToken })
            });
        }
    } finally {
        clearAuthData();
    }
};
