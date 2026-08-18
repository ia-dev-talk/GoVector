[CmdletBinding()]
param(
    [string]$Destination = (Join-Path $PSScriptRoot "..\backup")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$backupScript = Join-Path $PSScriptRoot "backup-bluevector.ps1"
if (-not (Test-Path $backupScript -PathType Leaf)) {
    throw "Le script backup-bluevector.ps1 est introuvable."
}

Write-Host "Sauvegarde production BlueVector : PostgreSQL + médias technicien." -ForegroundColor Cyan
& $backupScript -Destination $Destination -IncludeMedia
