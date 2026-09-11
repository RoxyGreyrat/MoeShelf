@echo off
setlocal
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 goto noadmin

echo Adding Windows Firewall rule for TCP ports 3000-3019 ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-NetFirewallRule -DisplayName 'Moeshelf' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName 'Moeshelf' -Direction Inbound -Action Allow -Protocol TCP -LocalPort '3000-3019' -Profile Any | Out-Null; if (-not $?) { exit 1 } else { Write-Host 'PS_OK' }"
if errorlevel 1 goto netsh
echo [OK] Rule added. Phone can now access http://PC-LAN-IP:3000

echo Adding UDP rules for phone streaming (WebRTC media, local subnet only) ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-NetFirewallRule -DisplayName 'Moeshelf Streaming' -ErrorAction SilentlyContinue; foreach ($n in 'msedge','chrome','electron') { Get-Process $n -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -Unique | ForEach-Object { New-NetFirewallRule -DisplayName ('Moeshelf Streaming - ' + (Split-Path $_ -Leaf)) -Direction Inbound -Action Allow -Program $_ -Protocol UDP -RemoteAddress LocalSubnet -Profile Any -ErrorAction SilentlyContinue | Out-Null } }; Write-Host 'UDP_OK'"
echo [OK] Streaming UDP rules added (browser / capture process only, LAN only)
goto end

:netsh
echo Method1 failed, trying netsh ...
netsh advfirewall firewall delete rule name="Moeshelf" >nul 2>nul
netsh advfirewall firewall add rule name="Moeshelf" dir=in action=allow protocol=TCP localport=3000-3019 >nul 2>nul
if errorlevel 1 goto failed
echo [OK] Rule added via netsh.
goto end

:failed
echo [FAILED] Both methods failed.
echo Check Windows Firewall service mpssvc via services.msc
goto end

:noadmin
echo [ERROR] Administrator rights required.
echo Right-click this file and choose Run as administrator.
goto end

:end
pause
