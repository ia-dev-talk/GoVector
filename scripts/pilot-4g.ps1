param(
    [ValidateSet('start','status','stop')]
    [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Commande requise absente: $Name"
    }
}

function Get-TunnelUrl {
    $logs = docker compose --profile pilot-4g logs pilot-tunnel --no-color 2>&1 | Out-String
    $match = [regex]::Match($logs, 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
    if ($match.Success) { return $match.Value.TrimEnd('/') }
    return $null
}

function Assert-Http([string]$Url, [int[]]$ExpectedStatus = @(200)) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0
        $status = [int]$response.StatusCode
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $status = [int]$_.Exception.Response.StatusCode
        } else {
            throw "Impossible de joindre $Url : $($_.Exception.Message)"
        }
    }
    if ($ExpectedStatus -notcontains $status) {
        throw "Statut inattendu pour $Url : $status (attendu: $($ExpectedStatus -join ','))"
    }
    return $status
}

Require-Command docker

if ($Action -eq 'stop') {
    docker compose --profile pilot-4g down
    Remove-Item '.pilot-4g-url' -ErrorAction SilentlyContinue
    Write-Host 'GoVector pilot 4G arrêté.'
    exit 0
}

if ($Action -eq 'start') {
    Write-Host 'Démarrage GoVector local + passerelle 4G sécurisée...'
    docker compose --profile pilot-4g up -d --build
}

Write-Host 'Vérification locale...'
Assert-Http 'http://127.0.0.1:8080/health' | Out-Null

$tunnelUrl = $null
for ($i = 0; $i -lt 45; $i++) {
    $tunnelUrl = Get-TunnelUrl
    if ($tunnelUrl) { break }
    Start-Sleep -Seconds 2
}
if (-not $tunnelUrl) {
    docker compose --profile pilot-4g logs pilot-tunnel --tail 80
    throw 'Le tunnel HTTPS public n’a pas fourni d’URL dans le délai prévu.'
}

Write-Host "Tunnel détecté: $tunnelUrl"
Write-Host 'Vérification depuis l’URL publique...'
Assert-Http "$tunnelUrl/health" | Out-Null

# Security gate: dashboard/root must NOT be exposed through the public tunnel.
$rootStatus = Assert-Http "$tunnelUrl/" @(404)
if ($rootStatus -ne 404) {
    throw 'SECURITE: le dashboard ne doit pas être accessible depuis le tunnel public.'
}

$apiBaseUrl = "$tunnelUrl/api/v1"
Set-Content -Path '.pilot-4g-url' -Value $apiBaseUrl -Encoding ascii

Write-Host ''
Write-Host '========================================='
Write-Host ' GOVECTOR PILOT 4G : PASSERELLE OK'
Write-Host '========================================='
Write-Host 'Dashboard local : http://127.0.0.1:8080'
Write-Host "API tablette 4G : $apiBaseUrl"
Write-Host 'URL sauvegardée dans .pilot-4g-url'
Write-Host ''
Write-Host 'IMPORTANT: ne considérez pas le pilote validé avant le test tablette réel Wi-Fi OFF / 4G ON.'
