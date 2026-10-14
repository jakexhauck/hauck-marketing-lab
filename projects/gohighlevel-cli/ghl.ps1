# GHL CLI wrapper for PowerShell: loads .env then calls the venv entrypoint.
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $ScriptDir ".env"
if (Test-Path $EnvFile) {
    foreach ($line in Get-Content $EnvFile) {
        $t = $line.Trim()
        if ($t -eq "" -or $t.StartsWith("#")) { continue }
        $i = $t.IndexOf("=")
        if ($i -lt 1) { continue }
        $key = $t.Substring(0, $i).Trim()
        $val = $t.Substring($i + 1).Trim()
        Set-Item -Path "Env:$key" -Value $val
    }
}
& (Join-Path $ScriptDir ".venv\Scripts\ghl.exe") @args
