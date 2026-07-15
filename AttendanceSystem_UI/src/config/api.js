const DEFAULT_API_BASE_URL =
    process.env.NODE_ENV === "development" ? "http://localhost:5050/api" : "/api";

export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || DEFAULT_API_BASE_URL;
export const AUTH_BASE_URL = process.env.REACT_APP_AUTH_BASE_URL || API_BASE_URL;

export const getAccessToken = () => localStorage.getItem("accessToken") || "";

export const getAuthHeaders = () => {
    const token = getAccessToken();
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
};
