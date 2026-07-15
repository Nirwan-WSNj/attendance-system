import React from "react";
import {
    CheckSquare,
    ClipboardCheck,
    Filter,
    History,
    Pencil,
    RefreshCw,
    Save,
    Search,
    ShieldCheck,
    Square,
    X,
    XCircle
} from "lucide-react";

const labelClass = "mb-1 block text-xs font-semibold text-slate-500";
const controlClass = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

export default function AttendanceCorrectionsWorkspaceView({ vm }) {
    const {
        filters,
        appliedFilters,
        pageInfo,
        filterOptions,
        records,
        sessions,
        drafts,
        selected,
        workspaceTab,
        showMoreFilters,
        loading,
        sessionsLoading,
        saving,
        voidingId,
        filterError,
        candidateError,
        sessionsError,
        actionError,
        message,
        canEdit,
        canInteractWithRows,
        isClerkWorkspace,
        usesClerkAssignmentScope,
        scopeInfo,
        mutating,
        hasPendingFilters,
        hasActiveFilters,
        selectedRows,
        moreFilterCount,
        today,
        issueStatusValues,
        viewOptions,
        issueStatusOptions,
        reasonTypes,
        changeWorkspaceTab,
        setShowMoreFilters,
        setFilter,
        applyFilters,
        clearSecondaryFilters,
        refreshAll,
        loadCandidates,
        loadSessions,
        toggleAll,
        toggleRow,
        updateDraft,
        goToPage,
        changePageSize,
        setSelected,
        saveSession,
        voidCorrection,
        keyOf,
        makeDraft,
        getRowStatus,
        getHistoryStatus,
        displayDate,
        displayDateTime
    } = vm;

    const [reviewRowKey, setReviewRowKey] = React.useState("");

    const isHistory = workspaceTab === "history";
    const isTeamAttendance = isClerkWorkspace && workspaceTab === "team";
    const pageTitle = isClerkWorkspace ? "Team Attendance" : "Attendance Corrections";
    const pageDescription = isClerkWorkspace
        ? "Review check-in and check-out records for employees assigned to you."
        : "Review attendance exceptions and apply approved changes.";
    const tabs = isClerkWorkspace
        ? [
            { value: "team", label: "Team Attendance" },
            { value: "attention", label: "Needs Attention" },
            { value: "history", label: "Change History" }
        ]
        : [
            { value: "queue", label: "Correction Queue" },
            { value: "history", label: "Change History" }
        ];

    const historyRows = sessions
        .flatMap((session) => (session.items || []).map((item) => ({ item, parent: session })))
        .sort((a, b) => {
            const aTime = new Date(a.item.updatedAt || a.item.createdAt || a.parent.createdAt || 0).getTime();
            const bTime = new Date(b.item.updatedAt || b.item.createdAt || b.parent.createdAt || 0).getTime();
            return bTime - aTime;
        });
    const reviewRow = records.find((row) => keyOf(row) === reviewRowKey) || null;

    React.useEffect(() => {
        if (reviewRowKey && !reviewRow) setReviewRowKey("");
    }, [reviewRow, reviewRowKey]);

    return (
        <div className="min-h-full bg-slate-50">
            <div className="mx-auto max-w-[1560px] space-y-5 p-4 sm:p-6 2xl:p-8">
                <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{pageTitle}</h1>
                        <p className="mt-1 text-sm text-slate-500">{pageDescription}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1.5">
                                <ShieldCheck size={14} className="text-blue-600" />
                                <strong className="font-semibold text-slate-700">{scopeInfo.title}</strong>
                            </span>
                            <span>{displayDate(appliedFilters.from)} - {displayDate(appliedFilters.to)}</span>
                            {!isHistory && <span>{loading ? "Loading records..." : pageInfo.totalCount + " records"}</span>}
                            {!isHistory && selectedRows.length > 0 && <span className="font-semibold text-blue-700">{selectedRows.length} selected</span>}
                            {!canEdit && <span className="font-semibold text-amber-700">View only</span>}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={refreshAll}
                        disabled={loading || sessionsLoading || mutating}
                        className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading || sessionsLoading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </header>

                <nav aria-label="Attendance workspace" className="flex gap-6 overflow-x-auto border-b border-slate-200">
                    {tabs.map((tab) => (
                        <button
                            key={tab.value}
                            type="button"
                            onClick={() => changeWorkspaceTab(tab.value)}
                            disabled={mutating}
                            aria-current={workspaceTab === tab.value ? "page" : undefined}
                            className={"min-h-11 shrink-0 border-b-2 px-1 text-sm font-bold transition disabled:opacity-50 " + (workspaceTab === tab.value ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800")}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>

                {actionError && <Notice tone="error" role="alert">{actionError}</Notice>}
                {message && <Notice tone="success" role="status">{message}</Notice>}

                {isHistory ? (
                    <>
                        <HistoryFilters
                            filters={filters}
                            today={today}
                            filterError={filterError}
                            hasPendingFilters={hasPendingFilters}
                            sessionsLoading={sessionsLoading}
                            mutating={mutating}
                            setFilter={setFilter}
                            applyFilters={applyFilters}
                        />
                        <ChangeHistory
                            rows={historyRows}
                            sessionsLoading={sessionsLoading}
                            sessionsError={sessionsError}
                            canEdit={canEdit}
                            mutating={mutating}
                            voidingId={voidingId}
                            appliedFilters={appliedFilters}
                            loadSessions={loadSessions}
                            voidCorrection={voidCorrection}
                            getHistoryStatus={getHistoryStatus}
                            displayDate={displayDate}
                            displayDateTime={displayDateTime}
                        />
                    </>
                ) : (
                    <>
                        <AttendanceFilters
                            isClerkWorkspace={isClerkWorkspace}
                            workspaceTab={workspaceTab}
                            filters={filters}
                            today={today}
                            filterOptions={filterOptions}
                            showMoreFilters={showMoreFilters}
                            moreFilterCount={moreFilterCount}
                            hasActiveFilters={hasActiveFilters}
                            hasPendingFilters={hasPendingFilters}
                            filterError={filterError}
                            loading={loading}
                            mutating={mutating}
                            issueStatusValues={issueStatusValues}
                            viewOptions={viewOptions}
                            issueStatusOptions={issueStatusOptions}
                            setShowMoreFilters={setShowMoreFilters}
                            setFilter={setFilter}
                            applyFilters={applyFilters}
                            clearSecondaryFilters={clearSecondaryFilters}
                        />

                        {candidateError && (
                            <Notice tone="error" role="alert">
                                <span className="flex-1">{candidateError}</span>
                                <button type="button" onClick={() => loadCandidates(appliedFilters)} disabled={loading || mutating} className="font-bold underline disabled:opacity-50">Retry</button>
                            </Notice>
                        )}

                        <AttendanceTable
                            vm={{
                                records,
                                drafts,
                                selected,
                                loading,
                                canEdit,
                                canInteractWithRows,
                                isClerkWorkspace,
                                usesClerkAssignmentScope,
                                isTeamAttendance,
                                pageInfo,
                                appliedFilters,
                                hasPendingFilters,
                                mutating,
                                reasonTypes,
                                toggleAll,
                                toggleRow,
                                updateDraft,
                                goToPage,
                                changePageSize,
                                keyOf,
                                makeDraft,
                                getRowStatus,
                                displayDate,
                                onReviewRow: (row) => setReviewRowKey(keyOf(row))
                            }}
                        />

                        {selectedRows.length > 0 && (
                            <ApplyChangesBar
                                selectedCount={selectedRows.length}
                                canApply={canInteractWithRows}
                                saving={saving}
                                mutating={mutating}
                                setSelected={setSelected}
                                saveSession={saveSession}
                            />
                        )}
                    </>
                )}
            </div>

            {isClerkWorkspace && reviewRow && (
                <AttendanceReviewDialog
                    row={reviewRow}
                    draft={drafts[reviewRowKey] || makeDraft(reviewRow)}
                    status={getRowStatus(reviewRow)}
                    canEdit={canInteractWithRows}
                    reasonTypes={reasonTypes}
                    updateDraft={updateDraft}
                    displayDate={displayDate}
                    onClose={() => setReviewRowKey("")}
                />
            )}
        </div>
    );
}

function AttendanceFilters({
    isClerkWorkspace,
    workspaceTab,
    filters,
    today,
    filterOptions,
    showMoreFilters,
    moreFilterCount,
    hasActiveFilters,
    hasPendingFilters,
    filterError,
    loading,
    mutating,
    issueStatusValues,
    viewOptions,
    issueStatusOptions,
    setShowMoreFilters,
    setFilter,
    applyFilters,
    clearSecondaryFilters
}) {
    const showIssueFilter = !isClerkWorkspace || workspaceTab === "attention";

    return (
        <section aria-label="Attendance filters" className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-sm font-bold text-slate-900">Attendance period</h2>
                    <p className="mt-1 text-xs text-slate-500">Search up to 31 days at a time.</p>
                </div>
                <button
                    id="attendance-more-filters-button"
                    type="button"
                    onClick={() => setShowMoreFilters((current) => !current)}
                    aria-expanded={showMoreFilters}
                    aria-controls="attendance-more-filters-panel"
                    className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                    <Filter size={15} />
                    More filters
                    {moreFilterCount > 0 && <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">{moreFilterCount}</span>}
                </button>
            </div>

            <div className="space-y-4 p-5">
                <div className={"grid grid-cols-1 gap-3 sm:grid-cols-2 " + (isClerkWorkspace ? "xl:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_auto]" : "xl:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_minmax(190px,1.2fr)_auto]")}>
                    <DateField label="From date" value={filters.from} max={filters.to} onChange={(value) => setFilter("from", value)} />
                    <DateField label="To date" value={filters.to} min={filters.from} max={today} onChange={(value) => setFilter("to", value)} />
                    {!isClerkWorkspace && (
                        <div>
                            <label htmlFor="attendance-record-view" className={labelClass}>Records to show</label>
                            <select
                                id="attendance-record-view"
                                value={issueStatusValues.has(filters.status) ? "needs-correction" : filters.status}
                                onChange={(event) => setFilter("status", event.target.value)}
                                className={controlClass}
                            >
                                {viewOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={applyFilters}
                        disabled={loading || mutating}
                        className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Search size={16} />
                        {loading ? "Searching..." : "Search"}
                    </button>
                </div>

                {showMoreFilters && (
                    <div id="attendance-more-filters-panel" className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                            {showIssueFilter && (
                                <div>
                                    <label htmlFor="attendance-issue-type" className={labelClass}>Issue type</label>
                                    <select
                                        id="attendance-issue-type"
                                        value={issueStatusValues.has(filters.status) ? filters.status : "needs-correction"}
                                        onChange={(event) => setFilter("status", event.target.value)}
                                        className={controlClass}
                                    >
                                        {issueStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                    </select>
                                </div>
                            )}
                            <TextField label="EPF number" value={filters.epfNo} placeholder="e.g. 007529" onChange={(value) => setFilter("epfNo", value)} />
                            <TextField label="Employee name" value={filters.keyword} placeholder="Search by name" onChange={(value) => setFilter("keyword", value)} />
                            {filterOptions.agmOptions.length > 0 && (
                                <SelectField label="AGM section" value={filters.agm} onChange={(value) => setFilter("agm", value)}>
                                    <option value="">All AGM sections</option>
                                    {filterOptions.agmOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                                </SelectField>
                            )}
                            {filters.agm && (
                                <SelectField label="DGM unit" value={filters.dgm} onChange={(value) => setFilter("dgm", value)}>
                                    <option value="">All DGM units</option>
                                    {filterOptions.directUnderAgmCount > 0 && <option value="__DIRECT__">Direct under AGM ({filterOptions.directUnderAgmCount})</option>}
                                    {filterOptions.dgmOptions.map((value) => (
                                        <option key={value} value={value}>{value}{filterOptions.dgmOptionCounts[value] ? " (" + filterOptions.dgmOptionCounts[value] + ")" : ""}</option>
                                    ))}
                                </SelectField>
                            )}
                            {filters.dgm && filterOptions.serviceUnitOptions.length > 0 && (
                                <SelectField label="Service unit" value={filters.serviceUnit} onChange={(value) => setFilter("serviceUnit", value)}>
                                    <option value="">All service units</option>
                                    {filterOptions.serviceUnitOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                                </SelectField>
                            )}
                            {filterOptions.designationOptions.length > 0 && (
                                <SelectField label="Designation" value={filters.designation} onChange={(value) => setFilter("designation", value)}>
                                    <option value="">All designations</option>
                                    {filterOptions.designationOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                                </SelectField>
                            )}
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button type="button" onClick={clearSecondaryFilters} disabled={!hasActiveFilters || loading || mutating} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Reset filters</button>
                        </div>
                    </div>
                )}

                {filterError && <Notice tone="error" role="alert">{filterError}</Notice>}
                {hasPendingFilters && !filterError && <Notice tone="warning">Search to apply the changed filters.</Notice>}
            </div>
        </section>
    );
}

function AttendanceTable({ vm }) {
    const {
        records,
        drafts,
        selected,
        loading,
        canEdit,
        canInteractWithRows,
        isClerkWorkspace,
        usesClerkAssignmentScope,
        isTeamAttendance,
        pageInfo,
        appliedFilters,
        hasPendingFilters,
        mutating,
        reasonTypes,
        toggleAll,
        toggleRow,
        updateDraft,
        goToPage,
        changePageSize,
        keyOf,
        makeDraft,
        getRowStatus,
        displayDate
    } = vm;

    const title = isTeamAttendance ? "Assigned team attendance" : isClerkWorkspace ? "Needs attention" : "Correction queue";
    const description = isTeamAttendance
        ? "Current check-in and check-out records for your assigned employees."
        : isClerkWorkspace
            ? "Assigned employee records with a missing check-in or check-out."
            : "Attendance records available for authorised correction.";

    if (isClerkWorkspace) {
        return <ClerkAttendanceTable vm={vm} title={title} description={description} />;
    }

    return (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><ClipboardCheck size={18} className="text-blue-600" />{title}</h2>
                    <p className="mt-1 text-xs text-slate-500">{description}</p>
                </div>
                <span className="text-sm text-slate-500">{records.length} shown / {pageInfo.totalCount} total</span>
            </div>

            <div className="hidden overflow-x-auto 2xl:block">
                <table className="w-full min-w-[1080px] text-sm">
                    <caption className="sr-only">{title}</caption>
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                            <th scope="col" className="w-12 px-4 py-3 text-left">
                                <button type="button" onClick={toggleAll} disabled={!canInteractWithRows || records.length === 0} title={canEdit ? "Select all rows on this page" : "View-only access"} className={canInteractWithRows ? "text-blue-600" : "cursor-not-allowed text-slate-300"}>
                                    {records.length > 0 && selected.size === records.length ? <CheckSquare size={18} /> : <Square size={18} />}
                                </button>
                            </th>
                            <th scope="col" className="min-w-[260px] px-3 py-3 text-left">Employee</th>
                            <th scope="col" className="w-36 px-3 py-3 text-left">Date / Status</th>
                            <th scope="col" className="w-40 px-3 py-3 text-left">Current check-in / out</th>
                            <th scope="col" className="min-w-[245px] px-3 py-3 text-left">New check-in / out</th>
                            <th scope="col" className="min-w-[240px] px-3 py-3 text-left">Reason / Location</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Loading attendance records...</td></tr>
                        ) : records.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                                    {usesClerkAssignmentScope
                                        ? (isTeamAttendance ? "No employees are currently assigned to you." : "No assigned employee records need attention for this period.")
                                        : "No attendance records match the applied filters."}
                                </td>
                            </tr>
                        ) : records.map((row) => {
                            const key = keyOf(row);
                            const draft = drafts[key] || makeDraft(row);
                            const status = getRowStatus(row);
                            const isSelected = selected.has(key);

                            return (
                                <tr key={key} className={isSelected ? "bg-blue-50/60" : "hover:bg-slate-50"}>
                                    <td className="px-4 py-4 align-top">
                                        <button type="button" onClick={() => toggleRow(row)} disabled={!canInteractWithRows} aria-label={(isSelected ? "Deselect " : "Select ") + "EPF " + row.epfNo + " on " + row.workDate} className={canInteractWithRows ? "text-blue-600" : "cursor-not-allowed text-slate-300"}>
                                            {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                        </button>
                                    </td>
                                    <td className="px-3 py-4 align-top">
                                        <div className="font-semibold text-slate-900">{row.nameWithInitial || "Unknown employee"}</div>
                                        <div className="mt-1 text-xs text-slate-500"><span className="font-mono font-semibold text-blue-700">EPF {row.epfNo}</span>{row.designationName ? " / " + row.designationName : ""}</div>
                                        <div className="mt-1 text-xs text-slate-400">{[row.agmWorkSpaceName, row.dgmWorkSpaceName || row.serviceUnitName].filter(Boolean).join(" / ") || "Work area unavailable"}</div>
                                    </td>
                                    <td className="px-3 py-4 align-top">
                                        <div className="whitespace-nowrap text-xs font-semibold text-slate-700">{displayDate(row.workDate)}</div>
                                        <span className={"mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold " + status.cls}>{status.label}</span>
                                    </td>
                                    <td className="px-3 py-4 align-top">
                                        <TimePair checkIn={row.checkIn} checkOut={row.checkOut} />
                                        {row.isCorrected && (row.originalCheckIn || row.originalCheckOut) && (
                                            <div className="mt-2 text-[11px] text-slate-400">Source: {row.originalCheckIn || "-"} / {row.originalCheckOut || "-"}</div>
                                        )}
                                    </td>
                                    <td className="px-3 py-4 align-top">
                                        <div className="grid grid-cols-2 gap-2">
                                            <TimeField label="Check in" value={draft.correctedCheckIn} disabled={!canInteractWithRows} onChange={(value) => updateDraft(row, "correctedCheckIn", value)} />
                                            <TimeField label="Check out" value={draft.correctedCheckOut} disabled={!canInteractWithRows} onChange={(value) => updateDraft(row, "correctedCheckOut", value)} />
                                        </div>
                                    </td>
                                    <td className="px-3 py-4 align-top">
                                        <div className="space-y-2">
                                            <select value={draft.reasonType} onChange={(event) => updateDraft(row, "reasonType", event.target.value)} disabled={!canInteractWithRows} aria-label={"Change reason for EPF " + row.epfNo} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
                                                {reasonTypes.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                                            </select>
                                            <input type="text" value={draft.location} onChange={(event) => updateDraft(row, "location", event.target.value)} placeholder="Site, route or location" disabled={!canInteractWithRows} aria-label={"Location for EPF " + row.epfNo} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="divide-y divide-slate-200 2xl:hidden">
                {loading ? (
                    <div className="px-5 py-12 text-center text-sm text-slate-400">Loading attendance records...</div>
                ) : records.length === 0 ? (
                    <div className="px-5 py-12 text-center text-sm text-slate-500">No attendance records match the applied filters.</div>
                ) : records.map((row) => {
                    const key = keyOf(row);
                    const draft = drafts[key] || makeDraft(row);
                    const status = getRowStatus(row);
                    const isSelected = selected.has(key);

                    return (
                        <article key={key} className={isSelected ? "bg-blue-50/50 p-4" : "p-4"}>
                            <div className="flex items-start gap-3">
                                <button type="button" onClick={() => toggleRow(row)} disabled={!canInteractWithRows} aria-label={(isSelected ? "Deselect " : "Select ") + "EPF " + row.epfNo + " on " + row.workDate} className={(canInteractWithRows ? "text-blue-600" : "cursor-not-allowed text-slate-300") + " mt-0.5 shrink-0"}>
                                    {isSelected ? <CheckSquare size={19} /> : <Square size={19} />}
                                </button>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <h3 className="truncate text-sm font-bold text-slate-900">{row.nameWithInitial || "Unknown employee"}</h3>
                                            <div className="mt-1 text-xs text-slate-500"><span className="font-mono font-semibold text-blue-700">EPF {row.epfNo}</span>{row.designationName ? " / " + row.designationName : ""}</div>
                                        </div>
                                        <span className={"inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold " + status.cls}>{status.label}</span>
                                    </div>
                                    <div className="mt-2 text-xs text-slate-500">{displayDate(row.workDate)}{[row.agmWorkSpaceName, row.dgmWorkSpaceName || row.serviceUnitName].filter(Boolean).length ? " / " + [row.agmWorkSpaceName, row.dgmWorkSpaceName || row.serviceUnitName].filter(Boolean).join(" / ") : ""}</div>
                                </div>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <div className="rounded-lg bg-slate-50 p-3">
                                    <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Current attendance</div>
                                    <TimePair checkIn={row.checkIn} checkOut={row.checkOut} />
                                    {row.isCorrected && (row.originalCheckIn || row.originalCheckOut) && <div className="mt-2 text-[11px] text-slate-400">Source: {row.originalCheckIn || "-"} / {row.originalCheckOut || "-"}</div>}
                                </div>
                                <div className="rounded-lg border border-slate-200 p-3">
                                    <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">New attendance</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <TimeField label="Check in" value={draft.correctedCheckIn} disabled={!canInteractWithRows} onChange={(value) => updateDraft(row, "correctedCheckIn", value)} />
                                        <TimeField label="Check out" value={draft.correctedCheckOut} disabled={!canInteractWithRows} onChange={(value) => updateDraft(row, "correctedCheckOut", value)} />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <label className="text-[11px] font-semibold text-slate-500">Reason
                                    <select value={draft.reasonType} onChange={(event) => updateDraft(row, "reasonType", event.target.value)} disabled={!canInteractWithRows} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
                                        {reasonTypes.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                                    </select>
                                </label>
                                <label className="text-[11px] font-semibold text-slate-500">Site, route or location
                                    <input type="text" value={draft.location} onChange={(event) => updateDraft(row, "location", event.target.value)} placeholder="Optional location" disabled={!canInteractWithRows} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" />
                                </label>
                            </div>
                        </article>
                    );
                })}
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex items-center gap-2 text-sm text-slate-500">
                    <span>Rows per page</span>
                    <select value={appliedFilters.pageSize} onChange={(event) => changePageSize(Number(event.target.value))} disabled={loading || mutating || hasPendingFilters} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700">
                        {[25, 50, 100, 200].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                </label>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">Page {pageInfo.totalPages === 0 ? 0 : pageInfo.page} of {pageInfo.totalPages}</span>
                    <button type="button" onClick={() => goToPage(pageInfo.page - 1)} disabled={loading || mutating || hasPendingFilters || pageInfo.page <= 1} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Previous</button>
                    <button type="button" onClick={() => goToPage(pageInfo.page + 1)} disabled={loading || mutating || hasPendingFilters || pageInfo.totalPages === 0 || pageInfo.page >= pageInfo.totalPages} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Next</button>
                </div>
            </div>
        </section>
    );
}

function ClerkAttendanceTable({ vm, title, description }) {
    const {
        records,
        loading,
        usesClerkAssignmentScope,
        isTeamAttendance,
        pageInfo,
        appliedFilters,
        hasPendingFilters,
        mutating,
        goToPage,
        changePageSize,
        getRowStatus,
        displayDate,
        onReviewRow
    } = vm;

    const emptyMessage = usesClerkAssignmentScope
        ? (isTeamAttendance ? "No employees are currently assigned to you." : "No assigned employee records need attention for this period.")
        : "No attendance records match the applied filters.";

    return (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><ClipboardCheck size={18} className="text-blue-600" />{title}</h2>
                    <p className="mt-1 text-xs text-slate-500">{description}</p>
                </div>
                <span className="text-sm text-slate-500">{records.length} shown / {pageInfo.totalCount} total</span>
            </div>

            {loading ? (
                <div className="px-5 py-12 text-center text-sm text-slate-400">Loading attendance records...</div>
            ) : records.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-slate-500">{emptyMessage}</div>
            ) : (
                <>
                    <div className="hidden overflow-x-auto xl:block">
                        <table className="w-full min-w-[760px] text-sm">
                            <caption className="sr-only">{title}</caption>
                            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th scope="col" className="min-w-[280px] px-5 py-3 text-left">Employee</th>
                                    <th scope="col" className="w-40 px-3 py-3 text-left">Date / Status</th>
                                    <th scope="col" className="w-32 px-3 py-3 text-left">Check-in</th>
                                    <th scope="col" className="w-32 px-3 py-3 text-left">Check-out</th>
                                    <th scope="col" className="w-28 px-5 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {records.map((row) => {
                                    const status = getRowStatus(row);
                                    return (
                                        <tr key={`${row.epfNo}|${row.workDate}`} className="hover:bg-slate-50">
                                            <td className="px-5 py-4">
                                                <div className="font-semibold text-slate-900">{row.nameWithInitial || "Unknown employee"}</div>
                                                <div className="mt-1 text-xs text-slate-500"><span className="font-mono font-semibold text-blue-700">EPF {row.epfNo}</span>{row.designationName ? " / " + row.designationName : ""}</div>
                                                <div className="mt-1 text-xs text-slate-400">{[row.agmWorkSpaceName, row.dgmWorkSpaceName || row.serviceUnitName].filter(Boolean).join(" / ") || "Work area unavailable"}</div>
                                            </td>
                                            <td className="px-3 py-4">
                                                <div className="whitespace-nowrap text-xs font-semibold text-slate-700">{displayDate(row.workDate)}</div>
                                                <span className={"mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold " + status.cls}>{status.label}</span>
                                            </td>
                                            <td className="px-3 py-4 font-mono text-sm font-semibold text-slate-700">{row.checkIn || "-"}</td>
                                            <td className="px-3 py-4 font-mono text-sm font-semibold text-slate-700">{row.checkOut || "-"}</td>
                                            <td className="px-5 py-4 text-right">
                                                <button type="button" onClick={() => onReviewRow(row)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
                                                    <Pencil size={14} /> Review
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="divide-y divide-slate-200 xl:hidden">
                        {records.map((row) => {
                            const status = getRowStatus(row);
                            return (
                                <article key={`${row.epfNo}|${row.workDate}`} className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-bold text-slate-900">{row.nameWithInitial || "Unknown employee"}</h3>
                                            <div className="mt-1 font-mono text-xs font-semibold text-blue-700">EPF {row.epfNo}</div>
                                            <div className="mt-1 text-xs text-slate-500">{displayDate(row.workDate)}</div>
                                        </div>
                                        <span className={"inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold " + status.cls}>{status.label}</span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                                        <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Check-in</div><div className="mt-1 font-mono text-sm font-semibold text-slate-700">{row.checkIn || "-"}</div></div>
                                        <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Check-out</div><div className="mt-1 font-mono text-sm font-semibold text-slate-700">{row.checkOut || "-"}</div></div>
                                    </div>
                                    <button type="button" onClick={() => onReviewRow(row)} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"><Pencil size={14} /> Review attendance</button>
                                </article>
                            );
                        })}
                    </div>
                </>
            )}

            <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex items-center gap-2 text-sm text-slate-500">
                    <span>Rows per page</span>
                    <select value={appliedFilters.pageSize} onChange={(event) => changePageSize(Number(event.target.value))} disabled={loading || mutating || hasPendingFilters} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700">
                        {[25, 50, 100, 200].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                </label>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">Page {pageInfo.totalPages === 0 ? 0 : pageInfo.page} of {pageInfo.totalPages}</span>
                    <button type="button" onClick={() => goToPage(pageInfo.page - 1)} disabled={loading || mutating || hasPendingFilters || pageInfo.page <= 1} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Previous</button>
                    <button type="button" onClick={() => goToPage(pageInfo.page + 1)} disabled={loading || mutating || hasPendingFilters || pageInfo.totalPages === 0 || pageInfo.page >= pageInfo.totalPages} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Next</button>
                </div>
            </div>
        </section>
    );
}

function ApplyChangesBar({ selectedCount, canApply, saving, mutating, setSelected, saveSession }) {
    return (
        <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div className="text-sm font-bold text-slate-900">{selectedCount} attendance record{selectedCount === 1 ? "" : "s"} selected</div>
                <div className="mt-1 text-xs text-slate-500">Review the new times and details before applying.</div>
            </div>
            <div className="flex gap-2">
                {selectedCount > 0 && <button type="button" onClick={() => setSelected(new Set())} disabled={mutating} className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Clear</button>}
                <button type="button" onClick={saveSession} disabled={!canApply} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                    <Save size={16} />
                    {saving ? "Applying..." : "Apply selected changes"}
                </button>
            </div>
        </section>
    );
}

function HistoryFilters({ filters, today, filterError, hasPendingFilters, sessionsLoading, mutating, setFilter, applyFilters }) {
    return (
        <section aria-label="Change history filters" className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900">History period</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_minmax(220px,1.4fr)_auto]">
                <DateField label="From date" value={filters.from} max={filters.to} onChange={(value) => setFilter("from", value)} />
                <DateField label="To date" value={filters.to} min={filters.from} max={today} onChange={(value) => setFilter("to", value)} />
                <TextField label="Employee EPF" value={filters.epfNo} placeholder="All employees" onChange={(value) => setFilter("epfNo", value)} />
                <button type="button" onClick={applyFilters} disabled={sessionsLoading || mutating} className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                    <Search size={16} />
                    {sessionsLoading ? "Searching..." : "Search history"}
                </button>
            </div>
            {filterError && <div className="mt-3"><Notice tone="error" role="alert">{filterError}</Notice></div>}
            {hasPendingFilters && !filterError && <div className="mt-3"><Notice tone="warning">Search to apply the changed history filters.</Notice></div>}
        </section>
    );
}

function ChangeHistory({ rows, sessionsLoading, sessionsError, canEdit, mutating, voidingId, appliedFilters, loadSessions, voidCorrection, getHistoryStatus, displayDate, displayDateTime }) {
    return (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                    <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><History size={18} className="text-blue-600" />Change History</h2>
                    <p className="mt-1 text-xs text-slate-500">Employee attendance changes and their current status.</p>
                </div>
                <span className="text-sm text-slate-500">{rows.length} changes</span>
            </div>

            {sessionsLoading ? (
                <div className="px-5 py-12 text-center text-sm text-slate-400">Loading change history...</div>
            ) : sessionsError ? (
                <div className="m-5"><Notice tone="error" role="alert"><span className="flex-1">{sessionsError}</span><button type="button" onClick={() => loadSessions(appliedFilters)} disabled={mutating} className="font-bold underline disabled:opacity-50">Retry</button></Notice></div>
            ) : rows.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-slate-500">No attendance changes were found for this period.</div>
            ) : (
                <>
                <div className="divide-y divide-slate-200 xl:hidden">
                    {rows.map(({ item, parent }) => {
                        const status = getHistoryStatus(item);
                        const statusLabel = status.label === "Void" ? "Undone" : status.label === "Superseded" ? "Replaced" : status.label;
                        const changedBy = item.updatedByName || item.createdByName || parent.createdByName || "Unknown user";
                        const changedAt = item.updatedAt || item.createdAt || parent.createdAt;
                        return (
                            <article key={item.correctionId} className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div><h3 className="text-sm font-bold text-slate-900">{item.employeeName || "Unknown employee"}</h3><div className="mt-1 font-mono text-xs font-semibold text-blue-700">EPF {item.epfNo}</div><div className="mt-1 text-xs text-slate-500">{displayDate(item.workDate)}</div></div>
                                    <span className={"inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold " + status.cls}>{statusLabel}</span>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3"><div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Before</div><TimePair checkIn={item.originalCheckIn} checkOut={item.originalCheckOut} /></div><div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">After</div><TimePair checkIn={item.correctedCheckIn} checkOut={item.correctedCheckOut} /></div></div>
                                <div className="mt-3 text-xs leading-5 text-slate-600"><div>{item.reasonType || "No reason"}{(item.location || item.remarks) ? " / " + (item.location || item.remarks) : ""}</div><div className="text-slate-400">{changedBy} / {displayDateTime(changedAt) || "-"}</div></div>
                                {item.isActive && canEdit && <button type="button" onClick={() => voidCorrection(item)} disabled={mutating} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"><XCircle size={14} />{voidingId === item.correctionId ? "Undoing..." : "Undo change"}</button>}
                            </article>
                        );
                    })}
                </div>
                <div className="hidden overflow-x-auto xl:block">
                    <table className="w-full min-w-[1080px] text-sm">
                        <caption className="sr-only">Attendance change history</caption>
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                                <th scope="col" className="px-5 py-3 text-left">Employee</th>
                                <th scope="col" className="px-3 py-3 text-left">Date</th>
                                <th scope="col" className="px-3 py-3 text-left">Before</th>
                                <th scope="col" className="px-3 py-3 text-left">After</th>
                                <th scope="col" className="px-3 py-3 text-left">Reason</th>
                                <th scope="col" className="px-3 py-3 text-left">Changed by</th>
                                <th scope="col" className="px-3 py-3 text-left">Status</th>
                                <th scope="col" className="px-5 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map(({ item, parent }) => {
                                const status = getHistoryStatus(item);
                                const statusLabel = status.label === "Void" ? "Undone" : status.label === "Superseded" ? "Replaced" : status.label;
                                const changedBy = item.updatedByName || item.createdByName || parent.createdByName || "Unknown user";
                                const changedAt = item.updatedAt || item.createdAt || parent.createdAt;
                                return (
                                    <tr key={item.correctionId} className="hover:bg-slate-50">
                                        <td className="px-5 py-4">
                                            <div className="font-semibold text-slate-900">{item.employeeName || "Unknown employee"}</div>
                                            <div className="mt-1 font-mono text-xs font-semibold text-blue-700">EPF {item.epfNo}</div>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-xs text-slate-600">{displayDate(item.workDate)}</td>
                                        <td className="px-3 py-4"><TimePair checkIn={item.originalCheckIn} checkOut={item.originalCheckOut} /></td>
                                        <td className="px-3 py-4"><TimePair checkIn={item.correctedCheckIn} checkOut={item.correctedCheckOut} /></td>
                                        <td className="px-3 py-4 text-xs text-slate-600"><div>{item.reasonType || "No reason"}</div>{(item.location || item.remarks) && <div className="mt-1 text-slate-400">{item.location || item.remarks}</div>}</td>
                                        <td className="px-3 py-4 text-xs text-slate-600"><div>{changedBy}</div><div className="mt-1 text-slate-400">{displayDateTime(changedAt) || "-"}</div></td>
                                        <td className="px-3 py-4"><span className={"inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold " + status.cls}>{statusLabel}</span></td>
                                        <td className="px-5 py-4 text-right">
                                            {item.isActive && canEdit ? (
                                                <button type="button" onClick={() => voidCorrection(item)} disabled={mutating} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">
                                                    <XCircle size={14} />
                                                    {voidingId === item.correctionId ? "Undoing..." : "Undo"}
                                                </button>
                                            ) : <span className="text-slate-300">-</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                </>
            )}
        </section>
    );
}

function AttendanceReviewDialog({ row, draft, status, canEdit, reasonTypes, updateDraft, displayDate, onClose }) {
    const dialogRef = React.useRef(null);
    const closeRef = React.useRef(null);
    const onCloseRef = React.useRef(onClose);
    const returnFocusRef = React.useRef(null);

    React.useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    React.useEffect(() => {
        returnFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeRef.current?.focus();
        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onCloseRef.current();
                return;
            }
            if (event.key !== "Tab") return;

            const focusable = dialogRef.current?.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
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
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKeyDown);
            returnFocusRef.current?.focus?.();
        };
    }, []);

    return (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="attendance-review-title" className="max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                    <div>
                        <h2 id="attendance-review-title" className="text-lg font-bold text-slate-900">Review attendance</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-700">{row.nameWithInitial || "Unknown employee"}</p>
                        <p className="mt-0.5 text-xs text-slate-500">EPF {row.epfNo} / {displayDate(row.workDate)}</p>
                    </div>
                    <button ref={closeRef} type="button" onClick={onClose} aria-label="Close attendance review" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={18} /></button>
                </div>

                <div className="space-y-5 p-5">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-700">Current attendance</span>
                        <span className={"inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold " + status.cls}>{status.label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
                        <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Check-in</div><div className="mt-1 font-mono text-base font-bold text-slate-800">{row.checkIn || "-"}</div></div>
                        <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Check-out</div><div className="mt-1 font-mono text-base font-bold text-slate-800">{row.checkOut || "-"}</div></div>
                    </div>

                    <div>
                        <h3 className="text-sm font-bold text-slate-900">Manual change <span className="font-normal text-slate-400">(optional)</span></h3>
                        <p className="mt-1 text-xs text-slate-500">Edit only when the recorded punch is missing or incorrect.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <TimeField label="New check-in" value={draft.correctedCheckIn} disabled={!canEdit} onChange={(value) => updateDraft(row, "correctedCheckIn", value)} />
                        <TimeField label="New check-out" value={draft.correctedCheckOut} disabled={!canEdit} onChange={(value) => updateDraft(row, "correctedCheckOut", value)} />
                    </div>
                    <label className="block text-xs font-semibold text-slate-500">
                        Reason
                        <select value={draft.reasonType} onChange={(event) => updateDraft(row, "reasonType", event.target.value)} disabled={!canEdit} className={controlClass + " mt-1"}>
                            {reasonTypes.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                        </select>
                    </label>
                    <label className="block text-xs font-semibold text-slate-500">
                        Site, route or location
                        <input type="text" value={draft.location} onChange={(event) => updateDraft(row, "location", event.target.value)} placeholder="Optional location" disabled={!canEdit} className={controlClass + " mt-1"} />
                    </label>
                    {canEdit && <p className="text-xs leading-5 text-slate-500">Editing a field adds this record to the pending changes bar. Use Apply selected changes after reviewing it.</p>}
                </div>

                <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-4">
                    <button type="button" onClick={onClose} className="h-10 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700">Done</button>
                </div>
            </div>
        </div>
    );
}

function Notice({ tone, role, children }) {
    const classes = {
        error: "border-red-200 bg-red-50 text-red-700",
        success: "border-emerald-200 bg-emerald-50 text-emerald-700",
        warning: "border-amber-200 bg-amber-50 text-amber-800"
    };
    return <div role={role} className={"flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 text-sm " + classes[tone]}>{children}</div>;
}

function DateField({ label, value, min, max, onChange }) {
    const id = React.useId();
    return (
        <div>
            <label htmlFor={id} className={labelClass}>{label}</label>
            <input id={id} type="date" value={value} min={min} max={max} onChange={(event) => onChange(event.target.value)} className={controlClass} />
        </div>
    );
}

function TextField({ label, value, placeholder, disabled, onChange }) {
    const id = React.useId();
    return (
        <div>
            <label htmlFor={id} className={labelClass}>{label}</label>
            <input id={id} type="text" value={value} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={controlClass} />
        </div>
    );
}

function SelectField({ label, value, onChange, children }) {
    const id = React.useId();
    return (
        <div>
            <label htmlFor={id} className={labelClass}>{label}</label>
            <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={controlClass}>{children}</select>
        </div>
    );
}

function TimeField({ label, value, disabled, onChange }) {
    const id = React.useId();
    return (
        <label htmlFor={id} className="text-[11px] font-semibold text-slate-500">
            {label}
            <input id={id} type="time" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" />
        </label>
    );
}

function TimePair({ checkIn, checkOut }) {
    return (
        <dl className="space-y-1.5 font-mono text-xs">
            <div className="flex items-center gap-3"><dt className="w-7 text-slate-400">In</dt><dd className="font-semibold text-slate-700">{checkIn || "-"}</dd></div>
            <div className="flex items-center gap-3"><dt className="w-7 text-slate-400">Out</dt><dd className="font-semibold text-slate-700">{checkOut || "-"}</dd></div>
        </dl>
    );
}
