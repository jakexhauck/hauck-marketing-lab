# Loads .env, then runs the coordinator with whatever you pass through.
#   .\run.ps1 --watch          poll for runs queued from the Leads page
#   .\run.ps1 --run <id>       execute one run
#   .\run.ps1 --local          the SOP's standalone queue mode

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if (Test-Path .env) {
  Get-Content .env | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
      $name, $value = $line.Split("=", 2)
      [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
    }
  }
}

if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_SERVICE_ROLE_KEY) {
  Write-Error "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)."
}

& .\.venv\Scripts\python.exe coordinator.py @args
