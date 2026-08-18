[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$MediaArchive,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedSha256,
    [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $ConfirmRestore) {
    throw "Restauration refusée. Relancez avec -ConfirmRestore après avoir vérifié la cible."
}

$archivePath = (Resolve-Path $MediaArchive).Path
if ((Get-Item $archivePath).Length -le 0) { throw "L'archive média est vide." }
$actualHash = (Get-FileHash -Algorithm SHA256 $archivePath).Hash.ToLowerInvariant()
if ($actualHash -ne $ExpectedSha256.Trim().ToLowerInvariant()) {
    throw "Empreinte SHA-256 incorrecte. La restauration des médias est annulée."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $projectRoot
$restoreSucceeded = $false
try {
    $appContainer = (docker compose ps -q app).Trim()
    if (-not $appContainer) {
        throw "Le service applicatif BlueVector doit être démarré avant la restauration des médias."
    }

    Write-Host "Arrêt de l'API avant restauration des médias..." -ForegroundColor Yellow
    docker compose stop app | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Impossible d'arrêter l'API avant restauration des médias." }

    $archiveMount = "${archivePath}:/tmp/bluevector-media-restore.tar.gz:ro"
    $restoreCommand = @'
set -eu
archive=/tmp/bluevector-media-restore.tar.gz
entries="$(tar -tzf "$archive")"
printf '%s\n' "$entries" | grep -Eq '^technician_media(/|$)'
if printf '%s\n' "$entries" | grep -Eq '(^|/)\.\.(/|$)|^/'; then
  echo 'Archive média refusée: chemin absolu ou traversal détecté.' >&2
  exit 41
fi
rm -rf /app/uploads/technician_media
mkdir -p /app/uploads
tar -C /app/uploads -xzf "$archive"
test -d /app/uploads/technician_media
'@

    docker compose run --rm --no-deps --entrypoint sh --volume $archiveMount app -ec $restoreCommand
    if ($LASTEXITCODE -ne 0) {
        throw "La restauration de l'archive média a échoué. L'API reste arrêtée pour éviter des écritures sur un état partiel."
    }

    docker compose up -d app | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Les médias ont été restaurés mais le redémarrage de l'API a échoué." }
    $restoreSucceeded = $true
    Write-Host "Médias technicien restaurés et API redémarrée." -ForegroundColor Green
}
finally {
    if (-not $restoreSucceeded) {
        Write-Warning "Restauration non validée : vérifiez les médias avant de redémarrer l'API."
    }
    Pop-Location
}
