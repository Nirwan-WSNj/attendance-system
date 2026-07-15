export const fmtHours = (h) => {
    if (h == null) return "—";
    const totalMins = Math.round(Number(h) * 60);
    if (!Number.isFinite(totalMins) || totalMins <= 0) return "—";
    return `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`;
};

// Generates [currentYear-2 … currentYear+2] so year dropdowns never need manual updates
export const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
