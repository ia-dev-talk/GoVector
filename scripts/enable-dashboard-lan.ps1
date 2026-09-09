$ErrorActionPreference = 'Stop'

$ruleName = 'GoVector Dashboard LAN 8080'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Ce script doit être lancé dans PowerShell en Administrateur.'
}

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($null -eq $existing) {
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort 8080 `
        -Profile Private `
        -RemoteAddress LocalSubnet | Out-Null
    Write-Host 'Règle pare-feu créée pour le réseau local privé uniquement.'
} else {
    Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Profile Private | Out-Null
    Write-Host 'Règle pare-feu GoVector LAN déjà présente et activée.'
}

$configs = Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object {
    $_.IPv4DefaultGateway -ne $null -and $_.IPv4Address -ne $null
}
$lanIp = $configs | ForEach-Object { $_.IPv4Address.IPAddress } | Where-Object {
    $_ -and $_ -notmatch '^127\.' -and $_ -notmatch '^169\.254\.'
} | Select-Object -First 1

if ($lanIp) {
    Write-Host "Dashboard GoVector sur le LAN : http://${lanIp}:8080"
    Write-Host 'Cette URL doit être utilisée uniquement depuis le même réseau local/Wi-Fi entreprise.'
} else {
    Write-Host 'Règle activée, mais aucune IPv4 LAN active n’a été détectée automatiquement.'
}
