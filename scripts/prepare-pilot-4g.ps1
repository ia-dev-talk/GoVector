$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host '=== GoVector : préparation pilote local + 4G ==='
Write-Host ''

& (Join-Path $PSScriptRoot 'pilot-4g.ps1') -Action start
& (Join-Path $PSScriptRoot 'build-pilot-apk.ps1')

$apiBaseUrl = (Get-Content '.pilot-4g-url' -Raw).Trim()
$apk = Join-Path $repoRoot 'dist/govector-pilot-4g.apk'

Write-Host ''
Write-Host '=================================================='
Write-Host ' GOVECTOR : PRET POUR LE TEST PHYSIQUE TABLETTE'
Write-Host '=================================================='
Write-Host 'Dashboard PC : http://127.0.0.1:8080'
Write-Host "API 4G       : $apiBaseUrl"
Write-Host "APK           : $apk"
Write-Host ''
Write-Host 'Critère final : couper complètement le Wi-Fi de la tablette, garder uniquement la 4G, puis exécuter le scénario métier de bout en bout.'
