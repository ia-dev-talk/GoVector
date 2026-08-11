[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$DatabaseDump,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedSha256,
    [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $ConfirmRestore) {
    throw "Restauration refusée. Relancez avec -ConfirmRestore après avoir vérifié la cible."
}

$dumpPath = (Resolve-Path $DatabaseDump).Path
if ((Get-Item $dumpPath).Length -le 0) { throw "Le fichier de sauvegarde est vide." }
$actualHash = (Get-FileHash -Algorithm SHA256 $dumpPath).Hash.ToLowerInvariant()
if ($actualHash -ne $ExpectedSha256.Trim().ToLowerInvariant()) {
    throw "Empreinte SHA-256 incorrecte. La restauration est annulée."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$remoteDump = "/tmp/bluevector-restore-$([guid]::NewGuid().ToString('N')).dump"
Push-Location $projectRoot
try {
    $postgresContainer = (docker compose ps -q postgres).Trim()
    if (-not $postgresContainer) { throw "Le service PostgreSQL BlueVector n'est pas démarré." }
    $databaseUser = (docker compose exec -T postgres printenv POSTGRES_USER).Trim()
    $databaseName = (docker compose exec -T postgres printenv POSTGRES_DB).Trim()

    Write-Host "Arrêt de l'API avant restauration..." -ForegroundColor Yellow
    docker compose stop app | Out-Null
    docker cp $dumpPath "${postgresContainer}:$remoteDump"
    if ($LASTEXITCODE -ne 0) { throw "La copie de la sauvegarde a échoué." }

    docker compose exec -T postgres pg_restore `
        -U $databaseUser `
        -d $databaseName `
        --clean `
        --if-exists `
        --no-owner `
        --no-privileges `
        $remoteDump
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore a échoué. L'API reste arrêtée pour éviter un démarrage sur une base partielle."
    }

    docker compose run --rm migrate
    if ($LASTEXITCODE -ne 0) {
        throw "La migration post-restauration a échoué. L'API reste arrêtée."
    }
    docker compose up -d app | Out-Null
    Write-Host "Base restaurée et API redémarrée." -ForegroundColor Green
}
finally {
    docker compose exec -T postgres rm -f $remoteDump 2>$null | Out-Null
    Pop-Location
}
