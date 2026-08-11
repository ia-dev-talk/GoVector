[CmdletBinding()]
param(
    [string]$Destination = (Join-Path $PSScriptRoot "..\backup"),
    [switch]$IncludeMedia
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = [System.IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

Push-Location $projectRoot
$remoteDatabase = "/tmp/bluevector-$timestamp.dump"
$remoteMedia = "/tmp/bluevector-media-$timestamp.tar.gz"
try {
    $postgresContainer = (docker compose ps -q postgres).Trim()
    if (-not $postgresContainer) {
        throw "Le service PostgreSQL BlueVector n'est pas démarré."
    }
    $databaseUser = (docker compose exec -T postgres printenv POSTGRES_USER).Trim()
    $databaseName = (docker compose exec -T postgres printenv POSTGRES_DB).Trim()
    if (-not $databaseUser -or -not $databaseName) {
        throw "POSTGRES_USER ou POSTGRES_DB est absent du conteneur."
    }

    $databaseFile = Join-Path $backupRoot "bluevector-database-$timestamp.dump"
    docker compose exec -T postgres pg_dump -U $databaseUser -d $databaseName -Fc -f $remoteDatabase
    if ($LASTEXITCODE -ne 0) { throw "pg_dump a échoué." }
    docker cp "${postgresContainer}:$remoteDatabase" $databaseFile
    if ($LASTEXITCODE -ne 0) { throw "La copie de la sauvegarde PostgreSQL a échoué." }

    $mediaFile = $null
    if ($IncludeMedia) {
        $appContainer = (docker compose ps -q app).Trim()
        if (-not $appContainer) {
            throw "Le service applicatif doit être démarré pour sauvegarder les médias."
        }
        $mediaFile = Join-Path $backupRoot "bluevector-media-$timestamp.tar.gz"
        docker compose exec -T app tar -C /app/uploads -czf $remoteMedia technician_media
        if ($LASTEXITCODE -ne 0) { throw "L'archivage des médias a échoué." }
        docker cp "${appContainer}:$remoteMedia" $mediaFile
        if ($LASTEXITCODE -ne 0) { throw "La copie de l'archive média a échoué." }
    }

    $databaseHash = (Get-FileHash -Algorithm SHA256 $databaseFile).Hash.ToLowerInvariant()
    $manifest = [ordered]@{
        product = "BlueVector"
        created_at = (Get-Date).ToUniversalTime().ToString("o")
        git_commit = (git rev-parse HEAD).Trim()
        database = [ordered]@{
            file = (Split-Path $databaseFile -Leaf)
            sha256 = $databaseHash
            bytes = (Get-Item $databaseFile).Length
            format = "postgres-custom"
        }
        media = if ($mediaFile) {
            [ordered]@{
                file = (Split-Path $mediaFile -Leaf)
                sha256 = (Get-FileHash -Algorithm SHA256 $mediaFile).Hash.ToLowerInvariant()
                bytes = (Get-Item $mediaFile).Length
                format = "tar-gzip"
            }
        } else { $null }
        consistency = "database and media are sequential snapshots, not a distributed atomic snapshot"
    }
    $manifestFile = Join-Path $backupRoot "bluevector-backup-$timestamp.json"
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -Path $manifestFile -Encoding utf8

    Write-Host "Sauvegarde BlueVector créée :" -ForegroundColor Green
    Write-Host "  Base     $databaseFile"
    if ($mediaFile) { Write-Host "  Médias   $mediaFile" }
    Write-Host "  Manifeste $manifestFile"
}
finally {
    docker compose exec -T postgres rm -f $remoteDatabase 2>$null | Out-Null
    if ($IncludeMedia) {
        docker compose exec -T app rm -f $remoteMedia 2>$null | Out-Null
    }
    Pop-Location
}
