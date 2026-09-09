$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host '=== GoVector : préparation pilote local + 4G ==='
Write-Host ''

& (Join-Path $PSScriptRoot 'pilot-4g.ps1') -Action start
& (Join-Path $PSScriptRoot 'build-pilot-apk.ps1')

$apiBaseUrl = (Get-Content '.pilot-4g-url' -Raw).Trim()
$apk = Join-Path $repoRoot 'dist/govector-pilot-4g.apk'

$configs = Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object {
    $_.IPv4DefaultGateway -ne $null -and $_.IPv4Address -ne $null
}
$lanIp = $configs | ForEach-Object { $_.IPv4Address.IPAddress } | Where-Object {
    $_ -and $_ -notmatch '^127\.' -and $_ -notmatch '^169\.254\.'
} | Select-Object -First 1

$lanHealthOk = $false
if ($lanIp) {
    try {
        $lanResponse = Invoke-WebRequest -Uri "http://${lanIp}:8080/health" -UseBasicParsing -TimeoutSec 10
        $lanHealthOk = ([int]$lanResponse.StatusCode -eq 200)
    } catch {
        $lanHealthOk = $false
    }
}

Write-Host ''
Write-Host '=================================================='
Write-Host ' GOVECTOR : PRET POUR LE TEST PHYSIQUE MOBILE/4G'
Write-Host '=================================================='
Write-Host 'Dashboard PC : http://127.0.0.1:8080'
if ($lanIp) {
    Write-Host "Dashboard LAN: http://${lanIp}:8080"
    if ($lanHealthOk) {
        Write-Host 'LAN self-check : OK'
    } else {
        Write-Host 'LAN self-check : NON VALIDE depuis ce PC'
    }
    Write-Host '  (si un autre PC du même réseau ne peut pas ouvrir cette URL,'
    Write-Host '   lancer PowerShell en Administrateur puis :'
    Write-Host '   .\scripts\enable-dashboard-lan.ps1)'
}
Write-Host "API 4G       : $apiBaseUrl"
Write-Host "APK           : $apk"
Write-Host ''
Write-Host 'Critère final : couper complètement le Wi-Fi du téléphone/tablette, garder uniquement la 4G, puis exécuter le scénario métier de bout en bout.'
