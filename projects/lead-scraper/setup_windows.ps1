# One-time setup for the lead scraper on Windows.
# Run from this directory in PowerShell:  .\setup_windows.ps1
# If Windows blocks it:  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
Write-Host "Lead scraper setup, $PSScriptRoot"

New-Item -ItemType Directory -Force -Path data, out, logs | Out-Null

# --- Python -----------------------------------------------------------------
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command python3 -ErrorAction SilentlyContinue }
if (-not $python) {
  Write-Error "Python 3.11+ is required. Install it from python.org and re-run."
}
Write-Host "1/4  Python venv"
& $python.Source -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt --quiet
Write-Host "     ok ($(& .\.venv\Scripts\python.exe --version))"

# --- gosom, the Maps engine --------------------------------------------------
Write-Host "2/4  gosom (the Google Maps scraper)"
if (Get-Command go -ErrorAction SilentlyContinue) {
  go install github.com/gosom/google-maps-scraper@latest
  "native" | Out-File -FilePath data\.engine -Encoding ascii -NoNewline
  Write-Host "     ok, native binary in $(go env GOPATH)\bin"
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
  docker pull gosom/google-maps-scraper
  "docker" | Out-File -FilePath data\.engine -Encoding ascii -NoNewline
  Write-Host "     ok, via Docker"
} else {
  Write-Warning "gosom NOT INSTALLED. It needs either Go or Docker:"
  Write-Warning "  winget install GoLang.Go     (then re-run this script)"
  Write-Warning "  or install Docker Desktop"
  Write-Warning "Everything else is set up; the scraper cannot run until this is fixed."
}

# --- credentials -------------------------------------------------------------
Write-Host "3/4  credentials"
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "     wrote .env from the example. Fill in SUPABASE_URL and"
  Write-Host "     SUPABASE_SERVICE_ROLE_KEY before the first run."
} else {
  Write-Host "     .env already present, left alone"
}

# --- prove the qualifier still works ----------------------------------------
Write-Host "4/4  regression test"
& .\.venv\Scripts\python.exe -m unittest discover -s tests -q

Write-Host ""
Write-Host "Done. Start the runner with:  .\run.ps1 --watch"
