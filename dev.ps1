# orgOS - one-shot dev launcher.
# Starts backend + both Cloudflare tunnels, writes the backend tunnel URL
# into frontend/.env, then runs Expo in the foreground with the frontend
# tunnel as EXPO_PACKAGER_PROXY_URL (so Expo Go gets https URLs, not
# http://...:443). Ctrl+C stops Expo and cleans up everything it started.
#
# Usage:  .\dev.cmd            (or)  .\dev.cmd -Clear   # clear Metro cache

param([switch]$Clear)

$ErrorActionPreference = 'Stop'
$root     = $PSScriptRoot
$frontend = Join-Path $root 'frontend'
$backend  = Join-Path $root 'backend'
$envFile  = Join-Path $frontend '.env'
$logDir   = Join-Path $env:TEMP 'orgos-dev'
New-Item -ItemType Directory -Force $logDir | Out-Null
$started  = @()

function Step($msg) { Write-Host "-> $msg" -ForegroundColor Cyan }

function Stop-PortListener($port) {
    Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
        ForEach-Object { cmd /c "taskkill /T /F /PID $($_.OwningProcess) >NUL 2>&1" }
}

function Start-Tunnel($name, $target) {
    $log = Join-Path $logDir "cf-$name.log"
    Remove-Item $log -ErrorAction SilentlyContinue
    $p = Start-Process cloudflared -ArgumentList 'tunnel', '--url', $target `
        -RedirectStandardError $log -RedirectStandardOutput "$log.out" `
        -WindowStyle Hidden -PassThru
    $script:started += $p
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 500
        $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($m) { return $m.Matches[0].Value }
    }
    throw "Tunnel '$name' did not print a URL in 30s - see $log"
}

# Fixed backend URL via ngrok's free static domain (needed for OAuth
# redirect URIs and so email links survive restarts). The domain lives
# ONLY in backend/.env as DEV_NGROK_DOMAIN (untracked; it will move to a
# dedicated account later) and the authtoken in ngrok's own config.
function Get-NgrokDomain {
    $f = Join-Path $backend '.env'
    if (-not (Test-Path $f)) { return $null }
    $m = Select-String -Path $f -Pattern '^DEV_NGROK_DOMAIN=(.+)$' | Select-Object -First 1
    if (-not $m) { return $null }
    $d = $m.Matches[0].Groups[1].Value.Trim().Trim('"') -replace '^https?://', '' -replace '/+$', ''
    if ($d) { return $d } else { return $null }
}

function Start-Ngrok($domain, $port) {
    $log = Join-Path $logDir 'ngrok-backend.log'
    Remove-Item $log -ErrorAction SilentlyContinue
    $p = Start-Process ngrok -ArgumentList 'http', "$port", '--url', "https://$domain", '--log', $log, '--log-format', 'logfmt' `
        -WindowStyle Hidden -PassThru
    $script:started += $p
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        if ($p.HasExited) { throw "ngrok exited - see $log (is the authtoken set? another ngrok session running?)" }
        if (Select-String -Path $log -Pattern 'started tunnel|url=https://' -Quiet -ErrorAction SilentlyContinue) { return "https://$domain" }
    }
    throw "ngrok did not start in 20s - see $log"
}

function Wait-Reachable($url) {
    # New trycloudflare hostnames take a few seconds to resolve.
    for ($i = 0; $i -lt 40; $i++) {
        $code = curl.exe -s -o NUL -w '%{http_code}' --max-time 5 $url
        if ($code -and $code -ne '000') { return $code }
        Start-Sleep -Seconds 1
    }
    return '000'
}

try {
    # 0. Expo account check (Expo Go warns if CLI and app accounts differ)
    Push-Location $frontend
    $who = (cmd /c "npx expo whoami 2>NUL")
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Write-Host "!! Expo CLI not logged in - run 'npx expo login' in frontend/ (warning only)" -ForegroundColor Yellow
    } else { Step "Expo CLI logged in as $who" }

    # 1. Clean slate: old tunnels + old Expo
    Step 'Stopping old cloudflared tunnels and Expo (port 443)'
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
    Stop-PortListener 443

    # 2. Backend (reuse if already listening)
    if (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue) {
        Step 'Backend already running on :8000 - reusing it'
    } else {
        Step 'Starting Laravel backend on :8000'
        $p = Start-Process php -ArgumentList 'artisan', 'serve', '--host=0.0.0.0', '--port=8000' `
            -WorkingDirectory $backend -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $logDir 'backend.log') `
            -RedirectStandardError  (Join-Path $logDir 'backend.err.log')
        $started += $p
    }

    # 3. Tunnels
    Step 'Starting tunnels'
    $ngrokDomain = Get-NgrokDomain
    if ($ngrokDomain -and (Get-Command ngrok -ErrorAction SilentlyContinue)) {
        $backendUrl = Start-Ngrok $ngrokDomain 8000
        Step "Backend on fixed ngrok domain"
    } else {
        if ($ngrokDomain) { Write-Host "!! DEV_NGROK_DOMAIN set but ngrok not installed - using a Cloudflare tunnel" -ForegroundColor Yellow }
        $backendUrl = Start-Tunnel 'backend' 'http://127.0.0.1:8000'
    }
    $frontendUrl = Start-Tunnel 'frontend' 'http://127.0.0.1:443'
    Step "Backend tunnel:  $backendUrl  (HTTP $(Wait-Reachable "$backendUrl/api/spaces"))"
    Step "Frontend tunnel: $frontendUrl"

    # 4. frontend/.env (UTF-8 without BOM - a BOM would corrupt the first key)
    $lines = if (Test-Path $envFile) { @(Get-Content $envFile) } else { @() }
    $lines = @($lines | Where-Object { $_ -notmatch '^EXPO_PUBLIC_BACKEND_URL=' })
    $lines = @("EXPO_PUBLIC_BACKEND_URL=$backendUrl") + $lines
    [IO.File]::WriteAllText($envFile, ($lines -join "`n") + "`n", (New-Object Text.UTF8Encoding($false)))
    Step 'Updated frontend/.env'

    # 4b. backend/.env - the public URLs auth emails are built from (see
    # backend/app/Support/AppLink.php): links point at
    # {APP_URL}/open/{screen}, which redirects to APP_DEEP_LINK_BASE/{screen}.
    # Keys are replaced in place (other lines and their order untouched) or
    # appended if missing. 'php artisan serve' restarts itself when .env
    # changes (no config cache in dev), so a reused backend picks this up.
    # Emails sent before this restart carry the old, now-dead tunnel URL -
    # the user just requests a new one.
    $backendEnvFile = Join-Path $backend '.env'
    $expHost = $frontendUrl -replace '^https?://', ''
    $backendKeys = [ordered]@{
        'APP_URL'            = $backendUrl
        'FRONTEND_URL'       = $frontendUrl
        'APP_DEEP_LINK_BASE' = "exp://$expHost/--"
    }
    if (Test-Path $backendEnvFile) {
        $blines = @(Get-Content $backendEnvFile -Encoding UTF8)
        foreach ($key in $backendKeys.Keys) {
            $line  = "$key=$($backendKeys[$key])"
            $found = $false
            for ($i = 0; $i -lt $blines.Count; $i++) {
                if ($blines[$i] -match "^$key=") { $blines[$i] = $line; $found = $true }
            }
            if (-not $found) { $blines += $line }
        }
        [IO.File]::WriteAllText($backendEnvFile, ($blines -join "`n") + "`n", (New-Object Text.UTF8Encoding($false)))
        Step 'Updated backend/.env (APP_URL, FRONTEND_URL, APP_DEEP_LINK_BASE)'
    } else {
        Write-Host "!! backend/.env not found - auth email links will be wrong" -ForegroundColor Yellow
    }

    # 5. The URL
    # Expo Go's deep-link scheme is always "exp://", never "exps://" --
    # EXPO_PACKAGER_PROXY_URL=https://host just becomes exp://host, the
    # https-ness lives in the proxy URL itself (used internally for the
    # manifest/asset fetches), not in a different URI scheme. An "exps://"
    # link isn't recognized at all -- it happened to look like it worked
    # on the same LAN only because Expo Go can also find a local dev
    # server on its own (recent projects / local-network scan), bypassing
    # this link entirely; from outside the LAN this was the only way in,
    # and it silently failed to open.
    $expoUrl = $frontendUrl -replace '^https://', 'exp://'
    Write-Host ''
    Write-Host '==============================================================' -ForegroundColor Green
    Write-Host "  Open in Expo Go:  $expoUrl" -ForegroundColor Green
    Write-Host '  (wait for Metro to finish bundling below before opening)' -ForegroundColor Green
    Write-Host '==============================================================' -ForegroundColor Green
    Write-Host ''
    try { Set-Clipboard $expoUrl; Write-Host '   (copied to clipboard)' } catch {}

    # 6. Expo in the foreground (interactive: r = reload, Ctrl+C = stop all)
    $env:EXPO_PACKAGER_PROXY_URL = $frontendUrl
    Push-Location $frontend
    $expoArgs = @('expo', 'start', '--port', '443')
    if ($Clear) { $expoArgs += '--clear' }
    & npx @expoArgs
}
finally {
    Pop-Location -ErrorAction SilentlyContinue
    Write-Host ''
    Step 'Shutting down tunnels/backend started by this script'
    foreach ($p in $started) { cmd /c "taskkill /T /F /PID $($p.Id) >NUL 2>&1" }
    Stop-PortListener 443
}
