# Sets up this machine to run the Missions Kiosk. Safe to re-run.
#
# Before running:
#   1. Publish the app (from the project folder, with the .NET 8 SDK):
#        dotnet publish -c Release -o publish -r win-x64 --self-contained true
#      If the service is already installed, stop it first (sc.exe stop MissionsKiosk)
#      or the build can't overwrite the running exe.
#   2. Sign in as the account that will auto-login and show the kiosk (admin),
#      with OneDrive signed in and the Missionaries folder synced.
#
# Run from an elevated PowerShell:  .\deploy\install-kiosk.ps1
#
# After running: set up auto-login with Sysinternals Autologon
# (https://learn.microsoft.com/sysinternals/downloads/autologon) — enter the
# account's password in its own dialog. Don't put the password in any script.

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw "Run this from an elevated (Administrator) PowerShell." }

$projectDir = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $projectDir "publish\MissionsKiosk.exe"
if (-not (Test-Path $exe)) { throw "Not found: $exe -- publish the app first (see the top of this script)." }

# --- 1) Server as a Windows Service: starts at boot, restarts itself on crash ---
$svc = Get-Service MissionsKiosk -ErrorAction SilentlyContinue
if ($svc) {
    if ($svc.Status -eq "Running") { sc.exe stop MissionsKiosk | Out-Null; Start-Sleep -Seconds 3 }
    sc.exe config MissionsKiosk binPath= "`"$exe`"" start= auto | Out-Null
} else {
    sc.exe create MissionsKiosk binPath= "`"$exe`"" start= auto DisplayName= "Missions Kiosk Server" | Out-Null
}
sc.exe description MissionsKiosk "Serves the Freedom Alliance missions map kiosk on http://localhost:5103" | Out-Null
sc.exe failure MissionsKiosk reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null
sc.exe failureflag MissionsKiosk 1 | Out-Null
sc.exe start MissionsKiosk | Out-Null

# --- 2) Open Edge in kiosk mode when this account logs in ---
$startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
Copy-Item (Join-Path $PSScriptRoot "kiosk-browser.vbs") (Join-Path $startupDir "kiosk-browser.vbs") -Force

# --- 3) Touchscreen hardening: no edge-swipe escape onto the desktop ---
# The account behind the kiosk has the church's OneDrive (incl. finances).
New-Item -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\EdgeUI" -Force | Out-Null
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\EdgeUI" -Name "AllowEdgeSwipe" -Value 0 -Type DWord

# --- 4) Remote Desktop off (not used; don't leave it open) ---
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name "fDenyTSConnections" -Value 1
Get-NetFirewallRule -DisplayGroup "Remote Desktop" -ErrorAction SilentlyContinue | Set-NetFirewallRule -Enabled False

# --- 5) Keep the data folder fully downloaded (OneDrive Files On-Demand) ---
# The service doesn't run as this user, so it can't trigger downloads of
# online-only placeholder files the pastor adds from another computer.
$dataDir = (Get-Content (Join-Path $projectDir "appsettings.json") -Raw | ConvertFrom-Json).DataDirectory
if ($dataDir -and (Test-Path $dataDir)) {
    attrib +P -U "$dataDir"
    attrib +P -U "$dataDir\*" /s /d
} else {
    Write-Warning "Data folder not found ($dataDir) -- sync OneDrive, then re-run to pin it."
}

# --- Report ---
Start-Sleep -Seconds 3
$ok = try { (Invoke-RestMethod http://localhost:5103/api/ministries).count } catch { $null }
Write-Host ""
Write-Host "Service:        $((Get-Service MissionsKiosk).Status) / $((Get-Service MissionsKiosk).StartType)"
Write-Host "Server answers: $(if ($null -ne $ok) { "yes, $ok entries" } else { 'NO -- check Event Viewer > Application' })"
Write-Host "Startup launch: $(Test-Path (Join-Path $startupDir 'kiosk-browser.vbs'))"
Write-Host "Data pinned:    $(if ($dataDir -and (Test-Path $dataDir)) { [bool]([int](Get-Item $dataDir -Force).Attributes -band 0x80000) } else { $false })"
Write-Host ""
Write-Host "Remaining manual step: set up auto-login with Autologon, then reboot." -ForegroundColor Yellow
