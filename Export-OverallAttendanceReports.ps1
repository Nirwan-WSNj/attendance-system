param(
    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory,
    [string]$ApiBaseUrl = "http://localhost:5050/api",
    [string]$From = "2026-06-01",
    [string]$To = "2026-06-30",
    [int]$Year = 2026,
    [int]$Month = 6
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$periodLabel = "June 2026"
$generatedAt = Get-Date

function ConvertTo-HtmlText([object]$Value) {
    if ($null -eq $Value) { return "" }
    return [System.Net.WebUtility]::HtmlEncode([string]$Value)
}

function Write-Utf8File([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Export-ReportCsv([string]$FileName, [object[]]$Rows) {
    $path = Join-Path $OutputDirectory $FileName
    @($Rows) | Export-Csv -Path $path -NoTypeInformation -Encoding UTF8
    return $path
}

function New-TableReportHtml(
    [string]$Title,
    [string]$Subtitle,
    [object[]]$Rows,
    [System.Collections.IDictionary]$Summary
) {
    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.AppendLine('<!doctype html><html><head><meta charset="utf-8"><style>')
    [void]$sb.AppendLine('@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:0;font-size:8px}h1{font-size:18px;margin:0;color:#17365d}h2{font-size:10px;font-weight:normal;margin:4px 0 10px;color:#475569}.brand{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #17365d;padding-bottom:6px;margin-bottom:8px}.brand-right{text-align:right;color:#64748b}.summary{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 9px}.summary div{border:1px solid #cbd5e1;background:#f8fafc;padding:5px 8px;min-width:120px}.summary b{display:block;color:#17365d;font-size:10px;margin-top:2px}table{width:100%;border-collapse:collapse;table-layout:auto}thead{display:table-header-group}th{background:#17365d;color:white;text-align:left;padding:4px;border:1px solid #294d78;white-space:nowrap}td{padding:3px 4px;border:1px solid #cbd5e1;vertical-align:top}tr:nth-child(even) td{background:#f8fafc}tr{break-inside:avoid}.footer{margin-top:8px;text-align:right;color:#64748b;font-size:7px}</style></head><body>')
    [void]$sb.AppendLine('<div class="brand"><div><h1>' + (ConvertTo-HtmlText $Title) + '</h1><h2>' + (ConvertTo-HtmlText $Subtitle) + '</h2></div><div class="brand-right"><b>Central Engineering Consultancy Bureau</b><br>Attendance System</div></div>')
    [void]$sb.Append('<div class="summary">')
    foreach ($entry in $Summary.GetEnumerator()) {
        [void]$sb.Append('<div>' + (ConvertTo-HtmlText $entry.Key) + '<b>' + (ConvertTo-HtmlText $entry.Value) + '</b></div>')
    }
    [void]$sb.AppendLine('</div>')

    if (@($Rows).Count -eq 0) {
        [void]$sb.AppendLine('<p>No records found for the selected period.</p>')
    }
    else {
        $columns = @($Rows[0].PSObject.Properties.Name)
        [void]$sb.Append('<table><thead><tr>')
        foreach ($column in $columns) { [void]$sb.Append('<th>' + (ConvertTo-HtmlText $column) + '</th>') }
        [void]$sb.AppendLine('</tr></thead><tbody>')
        foreach ($row in $Rows) {
            [void]$sb.Append('<tr>')
            foreach ($column in $columns) { [void]$sb.Append('<td>' + (ConvertTo-HtmlText $row.$column) + '</td>') }
            [void]$sb.AppendLine('</tr>')
        }
        [void]$sb.AppendLine('</tbody></table>')
    }
    [void]$sb.AppendLine('<div class="footer">Generated ' + (ConvertTo-HtmlText $generatedAt.ToString('yyyy-MM-dd HH:mm')) + '</div></body></html>')
    return $sb.ToString()
}

function Format-Time([object]$Value) {
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return "" }
    $clean = ([string]$Value).Trim() -replace '(?i)[AP]M$', ''
    $parts = $clean.Trim().Split(':')
    if ($parts.Count -lt 2) { return [string]$Value }
    return ('{0:D2}:{1:D2}' -f [int]$parts[0], [int]$parts[1])
}

function New-AttendanceRegisterHtml([object]$Register) {
    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.AppendLine('<!doctype html><html><head><meta charset="utf-8"><style>')
    [void]$sb.AppendLine('@page{size:A4 landscape;margin:5mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#000;margin:0}.unit{break-before:page;page-break-before:always;margin-bottom:8px}.unit:first-child{break-before:auto;page-break-before:auto}.meta{width:100%;border-collapse:collapse;margin-bottom:3px}.meta td{font-size:7px;border:0}.title{text-align:center;font-size:10px!important;font-weight:bold}.unitname{text-align:right;font-weight:bold}.register{width:100%;border-collapse:collapse;table-layout:fixed;font-size:5.5px}.register thead{display:table-header-group}.register th,.register td{border:1px solid #000;text-align:center;padding:1px}.register th{background:#d6d6d6}.register tr{break-inside:avoid}.person{width:10%;text-align:left!important;font-size:5.8px}.person b{font-size:6.2px}.weekend{background:#c0c0c0}.time{height:10px;line-height:10px}.out{border-top:1px solid #bbb}.signature{break-before:page;page-break-before:always;font-size:9px;padding-top:20px}.sign-table{width:100%;border-collapse:collapse;margin-top:45px}.sign-table td{width:33%;padding-right:25px}.line{border-bottom:1px solid #000;height:35px;margin-bottom:5px}.legend{font-size:8px;line-height:1.8}</style></head><body>')

    foreach ($unit in @($Register.units)) {
        [void]$sb.AppendLine('<section class="unit">')
        [void]$sb.AppendLine('<table class="meta"><tr><td>Central Engineering Consultancy Bureau</td><td class="title">ATTENDANCE FOR THE MONTH OF ' + (ConvertTo-HtmlText ([string]$Register.periodLabel).ToUpper()) + '</td><td class="unitname">' + (ConvertTo-HtmlText $unit.unitLevel) + '<br>' + (ConvertTo-HtmlText $unit.unitName) + '</td></tr></table>')
        [void]$sb.Append('<table class="register"><thead><tr><th rowspan="2" class="person">EPF No / Employee</th>')
        foreach ($day in @($Register.dayHeaders)) {
            $class = if ($day.isWeekend) { ' class="weekend"' } else { '' }
            [void]$sb.Append('<th' + $class + '>' + ('{0:D2}' -f [int]$day.day) + '</th>')
        }
        [void]$sb.Append('</tr><tr>')
        foreach ($day in @($Register.dayHeaders)) {
            $class = if ($day.isWeekend) { ' class="weekend"' } else { '' }
            [void]$sb.Append('<th' + $class + '>' + (ConvertTo-HtmlText $day.dayName) + '</th>')
        }
        [void]$sb.AppendLine('</tr></thead><tbody>')
        foreach ($employee in @($unit.employees)) {
            [void]$sb.Append('<tr><td class="person"><b>' + (ConvertTo-HtmlText $employee.epfNo) + '</b><br>' + (ConvertTo-HtmlText $employee.name) + '</td>')
            foreach ($day in @($Register.dayHeaders)) {
                $timeProperty = $employee.times.PSObject.Properties[[string]$day.day]
                $time = if ($null -ne $timeProperty) { $timeProperty.Value } else { $null }
                $isWeekend = [bool]$day.isWeekend -or ($null -ne $time -and [bool]$time.isWeekend)
                if ($isWeekend) {
                    [void]$sb.Append('<td class="weekend"></td>')
                }
                else {
                    [void]$sb.Append('<td><div class="time">' + (ConvertTo-HtmlText (Format-Time $time.checkIn)) + '</div><div class="time out">' + (ConvertTo-HtmlText (Format-Time $time.checkOut)) + '</div></td>')
                }
            }
            [void]$sb.AppendLine('</tr>')
        }
        [void]$sb.AppendLine('</tbody></table></section>')
    }

    [void]$sb.AppendLine('<section class="signature"><h2>Attendance Register - ' + (ConvertTo-HtmlText $Register.periodLabel) + '</h2><div class="legend"><b>Legend:</b> L = Leave &nbsp; D/L = Duty Leave &nbsp; C = Circuit<br>Top row = check-in time. Bottom row = check-out time. Shaded columns are non-working dates.</div><table class="sign-table"><tr><td><div class="line"></div><b>Prepared By</b><br>Name / Designation / Date</td><td><div class="line"></div><b>Checked By</b><br>Name / Designation / Date</td><td><div class="line"></div><b>Certified By</b><br>Name / Designation / Date</td></tr></table></section>')
    [void]$sb.AppendLine('</body></html>')
    return $sb.ToString()
}

function Convert-AgmRows([object[]]$Items, [int]$Depth = 0) {
    foreach ($item in @($Items)) {
        [pscustomobject][ordered]@{
            Unit = (('  ' * $Depth) + $item.unitName)
            Level = $item.unitLevel
            Employees = $item.registeredEmployees
            'Working Days' = $item.totalWorkingDays
            Unsynced = $item.totalUnsyncedDays
            Present = $item.totalPresent
            Absent = $item.totalAbsent
            Late = $item.totalLate
            'Attendance %' = $item.attendanceRate
            'Avg Work Hrs' = $item.averageWorkHours
        }
        if (@($item.children).Count -gt 0) { Convert-AgmRows -Items $item.children -Depth ($Depth + 1) }
    }
}

function New-Pdf([string]$Html, [string]$PdfFileName) {
    $tempRoot = Join-Path $env:TEMP 'attendance-system-report-html'
    if (-not (Test-Path $tempRoot)) { [void](New-Item -ItemType Directory -Path $tempRoot) }
    $htmlPath = Join-Path $tempRoot ([System.IO.Path]::ChangeExtension($PdfFileName, '.html'))
    $pdfPath = Join-Path $OutputDirectory $PdfFileName
    Write-Utf8File -Path $htmlPath -Content $Html

    $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
    if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' }
    if (-not (Test-Path $chrome)) { throw 'Chrome or Edge is required to create PDF files.' }

    $profile = Join-Path $env:TEMP ('attendance-report-browser-' + [guid]::NewGuid().ToString('N'))
    $uri = [System.Uri]::new($htmlPath).AbsoluteUri
    & $chrome '--headless=new' '--disable-gpu' '--no-pdf-header-footer' "--user-data-dir=$profile" "--print-to-pdf=$pdfPath" $uri | Out-Null
    if (-not (Test-Path $pdfPath)) { throw "PDF was not created: $PdfFileName" }
    return $pdfPath
}

if (-not (Test-Path $OutputDirectory)) {
    [void](New-Item -ItemType Directory -Path $OutputDirectory -Force)
}

# Use the local development admin seeded by the API. The password is read from the
# existing startup configuration and is never written to report files or output.
$passwordLine = Get-Content (Join-Path $root 'AttendanceSystem.API\Program.cs') | Where-Object { $_ -like '*var adminPassword*' }
$passwordMatches = [regex]::Matches([string]$passwordLine, '"([^"]+)"')
if ($passwordMatches.Count -eq 0) { throw 'Could not resolve the local development admin credential.' }
$password = $passwordMatches[$passwordMatches.Count - 1].Groups[1].Value
$loginBody = @{ username = 'admin'; password = $password } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/Auth/login" -ContentType 'application/json' -Body $loginBody
$headers = @{ Authorization = "Bearer $($login.data.accessToken)" }

Write-Output 'Fetching June 2026 report data...'
$agm = @((Invoke-RestMethod -Headers $headers -Uri "$ApiBaseUrl/Report/agm-wise?from=$From&to=$To") | ForEach-Object { $_ })
$register = Invoke-RestMethod -Headers $headers -Uri "$ApiBaseUrl/Report/attendance-register?year=$Year&month=$Month"
$ot = @((Invoke-RestMethod -Headers $headers -Uri "$ApiBaseUrl/Report/ot-summary?from=$From&to=$To") | ForEach-Object { $_ })
$late = @((Invoke-RestMethod -Headers $headers -Uri "$ApiBaseUrl/Report/late-arrivals?from=$From&to=$To") | ForEach-Object { $_ })
$daily = @((Invoke-RestMethod -Headers $headers -Uri "$ApiBaseUrl/Report/daily-summary?from=$From&to=$To") | ForEach-Object { $_ })
$allEmployees = @((Invoke-RestMethod -Headers $headers -Uri "$ApiBaseUrl/Report/all-employees?from=$From&to=$To") | ForEach-Object { $_ })

$agmRows = @(Convert-AgmRows -Items $agm)
$lateRows = @($late | ForEach-Object {
    [pscustomobject][ordered]@{ EPF=$_.epfNo; Name=$_.name; 'AGM Unit'=$_.agmUnit; 'DGM Unit'=$_.dgmUnit; Date=$_.date; 'Check In'=$_.checkIn; Scheduled=$_.scheduledStart; 'Late By'=$_.lateBy; 'Late (mins)'=$_.lateMinutes }
})
$dailyRows = @($daily | ForEach-Object {
    [pscustomobject][ordered]@{ Date=$_.date; Source=$(if ($_.isSynced -eq $false) {'Not synced'} else {'Synced'}); Registered=$_.totalRegistered; Present=$_.present; Absent=$_.absent; 'On Time'=$_.onTime; Late=$_.late; 'Checked Out'=$_.checkedOut; 'Attendance %'=$_.attendanceRate; 'Avg Work Hrs'=$_.averageWorkHours }
})
$allRows = @($allEmployees | ForEach-Object {
    [pscustomobject][ordered]@{ EPF=$_.epfNo; Name=$_.name; Designation=$_.designation; 'AGM Unit'=$_.agmUnit; 'DGM Unit'=$_.dgmUnit; 'Service Unit'=$_.serviceUnit; 'Working Days'=$_.workingDays; Unsynced=$_.unsyncedDays; Present=$_.presentDays; Absent=$_.absentDays; Late=$_.lateDays; 'On Time'=$_.ontimeDays; 'Attendance %'=$_.attendanceRate; 'Total Work Hrs'=$_.totalWorkHours; 'Avg Work Hrs'=$_.averageWorkHours }
})
$otRows = @(
    foreach ($employee in $ot) {
        if (@($employee.otRecords).Count -eq 0) {
            [pscustomobject][ordered]@{ EPF=$employee.epfNo; Name=$employee.name; Designation=$employee.designation; 'AGM Unit'=$employee.agmUnit; 'DGM Unit'=$employee.dgmUnit; Unit=$employee.unit; 'OT Days'=$employee.otDays; 'Worked OT Hours'=$employee.totalOTHours; 'Payable OT Hours'=$employee.payableOTHours; Date=''; 'Check Out'=''; 'Scheduled End'=''; 'OT Duration'='' }
        }
        else {
            foreach ($record in @($employee.otRecords)) {
                [pscustomobject][ordered]@{ EPF=$employee.epfNo; Name=$employee.name; Designation=$employee.designation; 'AGM Unit'=$employee.agmUnit; 'DGM Unit'=$employee.dgmUnit; Unit=$employee.unit; 'OT Days'=$employee.otDays; 'Worked OT Hours'=$employee.totalOTHours; 'Payable OT Hours'=$employee.payableOTHours; Date=$record.date; 'Check Out'=$record.checkOut; 'Scheduled End'=$record.scheduledEnd; 'OT Duration'=$record.otDuration }
            }
        }
    }
)

$registerRows = @(
    foreach ($unit in @($register.units)) {
        foreach ($employee in @($unit.employees)) {
            $row = [ordered]@{ Unit=$unit.unitName; 'Unit Level'=$unit.unitLevel; 'EPF No'=$employee.epfNo; Name=$employee.name }
            foreach ($day in @($register.dayHeaders)) {
                $key = '{0:D2}' -f [int]$day.day
                $timeProperty = $employee.times.PSObject.Properties[[string]$day.day]
                $time = if ($null -ne $timeProperty) { $timeProperty.Value } else { $null }
                if ($day.isWeekend) { $row["$key-IN"]='WE'; $row["$key-OUT"]='WE' }
                else { $row["$key-IN"] = Format-Time $time.checkIn; $row["$key-OUT"] = Format-Time $time.checkOut }
            }
            [pscustomobject]$row
        }
    }
)

$period = "$From to $To"
$files = [System.Collections.Generic.List[string]]::new()

Write-Output 'Creating AGM-wise report...'
$files.Add((Export-ReportCsv '01_AGM_Wise_Attendance_Report_June_2026.csv' $agmRows))
$files.Add((New-Pdf (New-TableReportHtml 'AGM-wise Attendance Report' "Period: $period" $agmRows ([ordered]@{Period=$period; Units=$agmRows.Count; Employees=($agm | Measure-Object registeredEmployees -Sum).Sum; 'Late Days'=($agm | Measure-Object totalLate -Sum).Sum})) '01_AGM_Wise_Attendance_Report_June_2026.pdf'))

Write-Output 'Creating attendance register...'
$files.Add((Export-ReportCsv '02_Attendance_Register_June_2026.csv' $registerRows))
$files.Add((New-Pdf (New-AttendanceRegisterHtml $register) '02_Attendance_Register_June_2026.pdf'))

Write-Output 'Creating overtime summary...'
$files.Add((Export-ReportCsv '03_Overtime_Summary_June_2026.csv' $otRows))
$files.Add((New-Pdf (New-TableReportHtml 'Overtime Summary Report' "Month: $periodLabel" $otRows ([ordered]@{'Employees with OT'=$ot.Count; 'Total OT Days'=($ot | Measure-Object otDays -Sum).Sum; 'Worked OT Hours'=[math]::Round(($ot | Measure-Object totalOTHours -Sum).Sum,1); 'Payable OT Hours'=[math]::Round(($ot | Measure-Object payableOTHours -Sum).Sum,1)})) '03_Overtime_Summary_June_2026.pdf'))

Write-Output 'Creating late-arrivals report...'
$uniqueLate = @($late | Select-Object -ExpandProperty epfNo -Unique).Count
$totalLateMinutes = ($late | Measure-Object lateMinutes -Sum).Sum
$files.Add((Export-ReportCsv '04_Late_Arrivals_June_2026.csv' $lateRows))
$files.Add((New-Pdf (New-TableReportHtml 'Late Arrival Report' "Period: $period" $lateRows ([ordered]@{Period=$period; 'Late Records'=$late.Count; Employees=$uniqueLate; 'Total Late Minutes'=$totalLateMinutes})) '04_Late_Arrivals_June_2026.pdf'))

Write-Output 'Creating daily summary...'
$files.Add((Export-ReportCsv '05_Daily_Attendance_Summary_June_2026.csv' $dailyRows))
$files.Add((New-Pdf (New-TableReportHtml 'Daily Attendance Summary' "Period: $period" $dailyRows ([ordered]@{Period=$period; Days=$daily.Count; Present=($daily | Measure-Object present -Sum).Sum; Late=($daily | Measure-Object late -Sum).Sum})) '05_Daily_Attendance_Summary_June_2026.pdf'))

Write-Output 'Creating all-employees summary...'
$files.Add((Export-ReportCsv '06_All_Employees_Attendance_Summary_June_2026.csv' $allRows))
$files.Add((New-Pdf (New-TableReportHtml 'All Employees Attendance Summary' "Period: $period" $allRows ([ordered]@{Period=$period; Employees=$allEmployees.Count; 'Present Days'=($allEmployees | Measure-Object presentDays -Sum).Sum; 'Late Days'=($allEmployees | Measure-Object lateDays -Sum).Sum})) '06_All_Employees_Attendance_Summary_June_2026.pdf'))

$manifest = @"
Attendance System - Overall Reports
Period: 01 June 2026 to 30 June 2026
Generated: $($generatedAt.ToString('yyyy-MM-dd HH:mm'))

Reports included:
1. AGM-wise Attendance Report
2. Attendance Register
3. Overtime Summary
4. Late Arrivals
5. Daily Attendance Summary
6. All Employees Attendance Summary

Each report is provided in PDF and CSV format.
"@
$manifestPath = Join-Path $OutputDirectory 'Report_Summary_June_2026.txt'
Write-Utf8File -Path $manifestPath -Content $manifest
$files.Add($manifestPath)

Write-Output "Created $($files.Count) files in $OutputDirectory"
$files | ForEach-Object { Get-Item $_ | Select-Object Name, Length }
