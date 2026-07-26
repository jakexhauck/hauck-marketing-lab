# =============================================================================
# Root & Ritual Botanicals - pack the built themes into Shopify-ready zips
#
#   Run order:  node build-themes.mjs
#               node validate.mjs
#               powershell -File pack-themes.ps1
#
# WHY THIS DOES NOT USE Compress-Archive:
# Both Compress-Archive and [ZipFile]::CreateFromDirectory write Windows
# backslashes into the archive entry names on Windows PowerShell 5.1. The ZIP
# spec requires forward slashes, and Shopify rejects the upload as a result.
# The entries are therefore written by hand with explicit forward slashes.
# =============================================================================

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$base   = $PSScriptRoot
$srcDir = Join-Path $base "src"
$zipDir = Join-Path $base "zips"

if (-not (Test-Path $srcDir)) {
  Write-Error "No src/ directory. Run 'node build-themes.mjs' first."
  exit 1
}

if (Test-Path $zipDir) { Remove-Item $zipDir -Recurse -Force }
New-Item -ItemType Directory -Path $zipDir | Out-Null

Get-ChildItem $srcDir -Directory | ForEach-Object {
  $themeDir = $_.FullName
  $dest = Join-Path $zipDir ($_.Name + ".zip")
  $zip = [System.IO.Compression.ZipFile]::Open($dest, [System.IO.Compression.ZipArchiveMode]::Create)
  Get-ChildItem $themeDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($themeDir.Length + 1).Replace('\','/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
  $zip.Dispose()
}

# ---- verify every archive before declaring success -------------------------
$allOk = $true
$rows = Get-ChildItem $zipDir -Filter *.zip | ForEach-Object {
  $z = [System.IO.Compression.ZipFile]::OpenRead($_.FullName)
  $bad       = @($z.Entries | Where-Object { $_.FullName -match '\\' }).Count
  $hasLayout = @($z.Entries | Where-Object { $_.FullName -eq 'layout/theme.liquid' }).Count
  $hasSchema = @($z.Entries | Where-Object { $_.FullName -eq 'config/settings_schema.json' }).Count
  $hasIndex  = @($z.Entries | Where-Object { $_.FullName -eq 'templates/index.json' }).Count
  $hasCss    = @($z.Entries | Where-Object { $_.FullName -eq 'assets/theme.css' }).Count
  $count     = $z.Entries.Count
  $z.Dispose()
  if ($bad -ne 0 -or $hasLayout -ne 1 -or $hasSchema -ne 1 -or $hasIndex -ne 1 -or $hasCss -ne 1) {
    $script:allOk = $false
  }
  [pscustomobject]@{
    Zip = $_.Name; Entries = $count; BadPaths = $bad
    Layout = $hasLayout; Schema = $hasSchema; Index = $hasIndex; Css = $hasCss
    MB = [math]::Round($_.Length / 1MB, 2)
  }
}
$rows | Format-Table -AutoSize

if ($allOk) {
  Write-Output "ALL ZIPS VALID FOR SHOPIFY UPLOAD -> $zipDir"
  exit 0
} else {
  Write-Error "One or more archives failed verification."
  exit 1
}
