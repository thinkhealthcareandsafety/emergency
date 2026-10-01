<#
  Starts ERT Live on a public https address for live demos (Cloudflare quick tunnel, free, no account).

  - Installs cloudflared with winget if it is missing.
  - Generates fresh random secrets for this session (nothing default is ever exposed publicly).
  - Prints the wall-screen link (with QR card), the admin login, and the webhook details for HONO.

  Usage:  npm run demo:public
  Stop:   Ctrl+C in this window. The tunnel URL changes on every start.
#>
param(
  [int]$Port = 4000
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function New-Secret {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ([Convert]::ToBase64String($bytes) -replace '[+/=]', '')
}

$localCf = Join-Path $root 'tools\cloudflared.exe'

function Find-Cloudflared {
  if (Test-Path $localCf) { return $localCf }
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @("${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe", "$env:LOCALAPPDATA\Microsoft\WinGet\Links\cloudflared.exe")) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  return $null
}

# 1. cloudflared: portable copy from Cloudflare's official GitHub release (no installer, no admin rights)
$cf = Find-Cloudflared
if (-not $cf) {
  Write-Host 'Downloading cloudflared from Cloudflare (one time, about 55 MB)...' -ForegroundColor Yellow
  New-Item -ItemType Directory -Force (Split-Path $localCf) | Out-Null
  curl.exe -L --fail --silent --show-error -o $localCf 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
  if ($LASTEXITCODE -ne 0) { Remove-Item $localCf -ErrorAction SilentlyContinue; throw 'Could not download cloudflared. Check your internet connection and run again.' }
  $sig = Get-AuthenticodeSignature $localCf
  if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'Cloudflare') {
    Remove-Item $localCf -Force
    throw 'The downloaded cloudflared.exe is not signed by Cloudflare. It was deleted and not used.'
  }
  $cf = $localCf
}

# 2. Dependencies + fresh client build
if (-not (Test-Path "$root\server\node_modules")) { npm --prefix "$root\server" install --no-audit --no-fund }
if (-not (Test-Path "$root\client\node_modules")) { npm --prefix "$root\client" install --no-audit --no-fund }
Write-Host 'Building the web app...'
npm --prefix "$root\client" run build | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Client build failed' }

# 3. Tunnel
$log = Join-Path $env:TEMP "ert-tunnel-$PID.log"
Write-Host 'Opening a public https address...'
$tunnel = Start-Process -FilePath $cf -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://localhost:$Port") `
  -RedirectStandardError $log -RedirectStandardOutput "$log.out" -WindowStyle Hidden -PassThru

try {
  $url = $null
  for ($i = 0; $i -lt 90 -and -not $url -and -not $tunnel.HasExited; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $log) {
      $m = Select-String -Path $log -Pattern 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
      if ($m) { $url = $m.Matches[0].Value }
    }
  }
  if (-not $url) { throw "Could not get a tunnel address. Details: $log" }

  # 4. Session secrets (fresh every run)
  $env:PORT = "$Port"
  $env:PUBLIC_URL = $url
  $env:DEMO_PUNCH = 'true'
  $env:JWT_SECRET = New-Secret
  $env:ADMIN_USERNAME = 'admin'
  $env:ADMIN_PASSWORD = (New-Secret).Substring(0, 12)
  $env:DISPLAY_KEY = (New-Secret).Substring(0, 16)
  $env:INGEST_API_KEY = New-Secret
  $env:DEMO_PUNCH_KEY = (New-Secret).Substring(0, 12)

  $display = "$url/display/MAIN?key=$($env:DISPLAY_KEY)&qr=1"
  Write-Host ''
  Write-Host '================ ERT Live - public demo ================' -ForegroundColor Green
  Write-Host "Wall screen (with QR) : $display"
  Write-Host "Admin                 : $url/admin"
  $envFile = "$root\server\.env"
  $realDb = $env:MONGO_URI -or ((Test-Path $envFile) -and (Select-String -Path $envFile -Pattern '^\s*MONGO_URI\s*=\s*\S' -Quiet))
  if ($realDb) {
    Write-Host '  username / password : your existing admin login (a real database is configured)'
  } else {
    Write-Host "  username / password : admin / $($env:ADMIN_PASSWORD)"
  }
  Write-Host "HONO webhook URL      : $url/api/ingest/punch"
  Write-Host "  header x-api-key    : $($env:INGEST_API_KEY)"
  Write-Host '  (or append ?apiKey=<key> to the URL if HONO cannot send headers)'
  Write-Host 'Address and keys change every time this script starts. Ctrl+C to stop.' -ForegroundColor DarkGray
  Write-Host '========================================================' -ForegroundColor Green
  Write-Host ''

  # 5. Server (foreground)
  node "$root\server\src\index.js"
}
finally {
  if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
  Write-Host 'Public address closed.'
}
