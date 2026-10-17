# The agent runner, alive without anybody typing.
#
# Sending a message to an agent in the app QUEUES it. The app is a Cloudflare
# worker in a datacentre and the agents run as `claude -p` on this machine, so
# nothing in the cloud can start anything here. src/main.ts is the other half:
# it polls every 3 seconds for a queued message and claims it. This keeps that
# process alive, the same way install-watcher.ps1 in projects/lead-scraper keeps
# the scraper's watcher alive.
#
# It registers a scheduled task that starts when you log in, restarts if it
# dies, and appends everything it says to logs\watcher.log. Logging in is also
# what fires startup monitoring (at most once every 6 hours).
#
#   .\install-watcher.ps1              install it and start it now
#   .\install-watcher.ps1 -Status      is it running, and what did it last say
#   .\install-watcher.ps1 -Uninstall   remove it
#
# The off switch: a file at data\.stop. The runner idles and stops sending
# heartbeats, so the app shows the agents offline and messages wait.

[CmdletBinding()]
param(
  [switch]$Uninstall,
  [switch]$Status,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot
$taskName = "Hauck agent runner"
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
  $node = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like "*src\main.ts*" -or $_.CommandLine -like "*src/main.ts*" })
  if ($node.Count -gt 0) {
    Write-Host "process : watching (pid $($node.ProcessId -join ', '))"
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
    Write-Host "removed. The agents will not answer on their own any more."
  } else {
    Write-Host "nothing to remove."
  }
  return
}

# Refuse to install something that cannot possibly work. A task that fails
# silently at logon is worse than no task: the agents would just look offline.
if (-not (Test-Path (Join-Path $dir "node_modules\tsx"))) {
  Write-Error "No node_modules. Run npm install in $dir first."
}
if (-not (Get-Command doppler -ErrorAction SilentlyContinue)) {
  Write-Error "doppler is not on PATH. The runner reads AGENT_RUNNER_SECRET from Doppler at start."
}
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Error "claude is not on PATH. Install Claude Code and log in first."
}
New-Item -ItemType Directory -Force -Path (Join-Path $dir "logs") | Out-Null

# cmd.exe does the redirection, not PowerShell, for the reason the lead
# scraper's installer gives: PowerShell 5.1 turns a native program's stderr
# into a terminating error when it is the one capturing the stream. Handing
# node the file handle directly means one "poll failed" line cannot kill it.
$argument = "/c node --import tsx `"$dir\src\main.ts`" >> `"$log`" 2>&1"

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $argument -WorkingDirectory $dir

$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"

# ExecutionTimeLimit zero means no limit: this runs for weeks. IgnoreNew so a
# second logon cannot start a second runner (claims are atomic, so it would be
# safe, but two runners double the heartbeats and confuse the log).
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force `
  -Description "Answers Command Center agent chats with claude -p. Off switch: data\.stop" | Out-Null

Write-Host "installed: `"$taskName`", starting at logon."

if (-not $NoStart) {
  Start-ScheduledTask -TaskName $taskName
  Start-Sleep -Seconds 4
  Write-Host ""
  Show-Status
}
