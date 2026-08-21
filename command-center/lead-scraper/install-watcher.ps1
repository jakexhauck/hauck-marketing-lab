# The runner, alive without anybody typing.
#
# Pressing Go in the app QUEUES a run. It cannot do more than that: the app is a
# Cloudflare worker in a datacentre and the scraper is a Python process on this
# machine, so nothing in the cloud can start anything here. `--watch` is the other
# half, polling every 10 seconds for a queued run and claiming it. The only thing
# missing was something keeping that process alive.
#
# This registers it as a scheduled task that starts when you log in, restarts if it
# dies, and appends everything it says to logs\watcher.log. After this, pressing Go
# is the whole job.
#
#   .\install-watcher.ps1              install it and start it now
#   .\install-watcher.ps1 -Status      is it running, and what did it last say
#   .\install-watcher.ps1 -Uninstall   remove it
#
# The off switch is unchanged and still wins: a file at data\.stop stops all
# scraping, whoever asks and however. The watcher stays up and idles while it is
# there, which is why it does not fight the task's restart.

[CmdletBinding()]
param(
  [switch]$Uninstall,
  [switch]$Status,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot
$taskName = "Hauck lead scraper watcher"
$log = Join-Path $dir "logs\watcher.log"

function Show-Status {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Host "not installed. Run .\install-watcher.ps1 to install it."
    return
  }
  $info = $task | Get-ScheduledTaskInfo
  Write-Host "task    : $($task.State)"
  Write-Host "last run: $($info.LastRunTime) (result $($info.LastTaskResult))"
  # The venv's python.exe is a redirector: it spawns the real interpreter with the
  # same command line, so a single watcher shows up twice. Count only the parents,
  # or the status reads as two watchers racing each other.
  $py = @(Get-CimInstance Win32_Process -Filter "Name like '%python%'" |
    Where-Object { $_.CommandLine -like "*coordinator.py*" })
  $pids = @($py.ProcessId)
  $running = @($py | Where-Object { $pids -notcontains $_.ParentProcessId })
  if ($running.Count -gt 0) {
    Write-Host "process : watching (pid $($running.ProcessId -join ', '))"
  } else {
    Write-Host "process : NOT running"
  }
  if (Test-Path $log) {
    Write-Host "--- last 10 lines of logs\watcher.log ---"
    Get-Content $log -Tail 10
  }
}

if ($Status) { Show-Status; return }

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "removed. The scraper will not start on its own any more."
  } else {
    Write-Host "nothing to remove."
  }
  return
}

# Refuse to install something that cannot possibly work. A task that fails silently
# at logon is worse than no task: Go would look broken with nothing to read.
if (-not (Test-Path (Join-Path $dir ".venv\Scripts\python.exe"))) {
  Write-Error "No virtualenv at .venv. Run .\setup_windows.ps1 first."
}
if (-not (Test-Path (Join-Path $dir ".env"))) {
  Write-Error "No .env. The runner needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
}
New-Item -ItemType Directory -Force -Path (Join-Path $dir "logs") | Out-Null

# cmd.exe does the redirection, not PowerShell, and that is the whole reason it is
# here. run.ps1 sets $ErrorActionPreference = "Stop", and PowerShell 5.1 turns
# anything a native program writes to STDERR into a terminating error the moment it
# is the one capturing the stream. The first install died on its own off switch: the
# watcher printed "scraper is off" to stderr and PowerShell killed the process
# mid-sentence. One "poll failed" on a dropped connection would have done the same.
# Redirecting with cmd hands python the file handle directly, so PowerShell never
# sees the stream and cannot object to it.
#
# PYTHONUNBUFFERED so the log says what is happening while it happens rather than in
# 8KB lumps. No rotation: an idle watcher prints nothing at all, only state changes
# and scrape progress, so this grows by a few KB a day.
$argument = "/c set PYTHONUNBUFFERED=1 && powershell.exe -NoProfile -ExecutionPolicy Bypass " +
            "-File `"$dir\run.ps1`" --watch >> `"$log`" 2>&1"

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $argument -WorkingDirectory $dir

$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"

# ExecutionTimeLimit zero means no limit: this is meant to run for weeks. IgnoreNew
# so a second logon cannot start a second watcher racing the first for the same run
# (runs are claimed atomically, so it would be safe, but two is still confusing).
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force `
  -Description "Watches for lead scrapes queued from the Command Center and runs them. Off switch: data\.stop" | Out-Null

Write-Host "installed: `"$taskName`", starting at logon."

if (-not $NoStart) {
  Start-ScheduledTask -TaskName $taskName
  Start-Sleep -Seconds 4
  Write-Host ""
  Show-Status
}
