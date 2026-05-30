# ============================================================================
# RT Connect dev launcher.
#
# Starts the backend and/or frontend AS CHILDREN OF A WINDOWS JOB OBJECT with
# KILL_ON_JOB_CLOSE. That guarantees: when THIS window closes (X button or
# Ctrl+C), the backend + frontend (and their whole process trees - uvicorn,
# node, vite) are terminated too. No orphans left holding ports 8000 / 5173.
#
# Usage (normally via the .bat wrappers):
#   powershell -ExecutionPolicy Bypass -File dev.ps1 -Services backend,frontend
# ============================================================================
param([string]$Services = "backend,frontend")

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot           # scripts\.. = repo root
$want = $Services.Split(",") | ForEach-Object { $_.Trim().ToLower() }

function Clear-Port([int]$port) {
    $ids = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess |
           Select-Object -Unique
    foreach ($procId in $ids) {
        try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } catch {}
    }
}

# -- Win32 Job Object (KILL_ON_JOB_CLOSE) ------------------------------------
if (-not ("RtcJob" -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class RtcJob {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)]
    public static extern IntPtr CreateJobObject(IntPtr a, string lpName);
    [DllImport("kernel32.dll")]
    public static extern bool SetInformationJobObject(IntPtr hJob, int infoClass, IntPtr lpInfo, uint cb);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit;
        public uint LimitFlags; public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit;
        public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct IO_COUNTERS {
        public ulong r1; public ulong r2; public ulong r3;
        public ulong r4; public ulong r5; public ulong r6;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo; public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    public static IntPtr CreateKillOnClose() {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        info.BasicLimitInformation.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        int len = Marshal.SizeOf(info);
        IntPtr p = Marshal.AllocHGlobal(len);
        Marshal.StructureToPtr(info, p, false);
        SetInformationJobObject(job, 9 /*JobObjectExtendedLimitInformation*/, p, (uint)len);
        Marshal.FreeHGlobal(p);
        return job;
    }
}
"@
}

$job = [RtcJob]::CreateKillOnClose()

# -- Resolve interpreters ----------------------------------------------------
$py = Join-Path $repo "venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { $npm = "npm" }

$procs = @()

function Start-Child([string]$file, [string[]]$argList, [string]$cwd, [string]$label) {
    Write-Host "  starting $label ..." -ForegroundColor Cyan
    $p = Start-Process -FilePath $file -ArgumentList $argList -WorkingDirectory $cwd -NoNewWindow -PassThru
    try { [RtcJob]::AssignProcessToJobObject($job, $p.Handle) | Out-Null } catch {}
    return $p
}

Write-Host ""
Write-Host "RT Connect dev - $($want -join ' + ')" -ForegroundColor Green

if ($want -contains "backend") {
    Clear-Port 8000
    $procs += Start-Child $py @("backend-api\main.py") $repo "backend  (http://localhost:8000)"
}
if ($want -contains "frontend") {
    Clear-Port 5173
    $procs += Start-Child $npm @("run","dev") (Join-Path $repo "frontend") "frontend (http://localhost:5173)"
}

Write-Host ""
Write-Host "Running. CLOSE THIS WINDOW (or press Ctrl+C) to stop everything." -ForegroundColor Yellow
Write-Host ""

try {
    # Block until the children exit; meanwhile the window stays open showing
    # their interleaved logs. Closing the window kills powershell -> the job
    # handle closes -> KILL_ON_JOB_CLOSE terminates all children.
    Wait-Process -Id ($procs | ForEach-Object { $_.Id }) -ErrorAction SilentlyContinue
} finally {
    # Belt-and-suspenders for Ctrl+C: also free the ports explicitly.
    if ($want -contains "backend")  { Clear-Port 8000 }
    if ($want -contains "frontend") { Clear-Port 5173 }
}
