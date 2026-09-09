param(
    [string]$ApiBaseUrl = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker est requis pour produire l’APK pilote de façon reproductible.'
}

if ([string]::IsNullOrWhiteSpace($ApiBaseUrl)) {
    if (-not (Test-Path '.pilot-4g-url')) {
        throw 'Aucune URL fournie et .pilot-4g-url absent. Lancez d’abord scripts/pilot-4g.ps1.'
    }
    $ApiBaseUrl = (Get-Content '.pilot-4g-url' -Raw).Trim()
}

$ApiBaseUrl = $ApiBaseUrl.Trim().TrimEnd('/')
$uri = $null
if (-not [Uri]::TryCreate($ApiBaseUrl, [UriKind]::Absolute, [ref]$uri)) {
    throw "URL API invalide: $ApiBaseUrl"
}
if ($uri.Scheme -ne 'https') {
    throw 'L’APK pilote exige une API HTTPS.'
}
if (-not $uri.AbsolutePath.TrimEnd('/').EndsWith('/api/v1')) {
    throw 'L’URL API doit se terminer par /api/v1.'
}
if ($uri.Host -in @('localhost','127.0.0.1','::1')) {
    throw 'L’APK pilote ne peut pas pointer vers localhost.'
}

$healthUrl = "$($uri.Scheme)://$($uri.Authority)/health"
Write-Host "Validation API publique: $healthUrl"
$response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 25
if ([int]$response.StatusCode -ne 200) {
    throw "Healthcheck public en échec: HTTP $($response.StatusCode)"
}

$repoPath = (Resolve-Path '.').Path
Write-Host 'Build Flutter release dans un conteneur reproductible...'

docker run --rm `
    -e ORG_GRADLE_PROJECT_pilotSigning=true `
    -v "${repoPath}:/workspace" `
    -w /workspace/mobile_app `
    ghcr.io/cirruslabs/flutter:3.47.0 `
    bash -lc "flutter pub get && flutter analyze --no-fatal-infos --no-fatal-warnings && flutter test && flutter build apk --release --no-pub --dart-define='API_BASE_URL=$ApiBaseUrl'"

$sourceApk = Join-Path $repoPath 'mobile_app/build/app/outputs/flutter-apk/app-release.apk'
if (-not (Test-Path $sourceApk)) {
    throw 'Build terminé sans APK détecté.'
}

$distDir = Join-Path $repoPath 'dist'
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$targetApk = Join-Path $distDir 'govector-pilot-4g.apk'
Copy-Item $sourceApk $targetApk -Force

$hash = (Get-FileHash -Path $targetApk -Algorithm SHA256).Hash
Write-Host ''
Write-Host '========================================='
Write-Host ' GOVECTOR PILOT 4G : APK PRETE'
Write-Host '========================================='
Write-Host "API : $ApiBaseUrl"
Write-Host "APK : $targetApk"
Write-Host "SHA256 : $hash"
Write-Host ''
Write-Host 'Installez cette APK sur la tablette puis testez avec Wi-Fi OFF et 4G ON.'
