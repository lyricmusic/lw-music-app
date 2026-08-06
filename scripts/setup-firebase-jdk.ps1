param()

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$toolsRoot = Join-Path $projectRoot '.tools'
$archivePath = Join-Path $toolsRoot 'temurin21-jre.zip'
$javaRoot = Join-Path $toolsRoot 'java'
$runtimeDirectoryName = 'jdk-21.0.11+10-jre'
$javaHome = Join-Path $javaRoot $runtimeDirectoryName
$javaExecutable = Join-Path $javaHome 'bin\java.exe'
$downloadUrl = 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.11%2B10/OpenJDK21U-jre_x64_windows_hotspot_21.0.11_10.zip'
$expectedSha256 = 'BE26677AAA20B39A62EDCAAB4C8857A8B76673B0F45ABC0B6143B142B62717E4'

if (Test-Path -LiteralPath $javaExecutable) {
  $releaseFile = Join-Path $javaHome 'release'
  $release = Get-Content -LiteralPath $releaseFile -Raw
  if ($release -notmatch 'IMPLEMENTOR="Eclipse Adoptium"' -or
      $release -notmatch 'JAVA_RUNTIME_VERSION="21\.0\.11\+10-LTS"') {
    throw "Unexpected Java runtime in $javaHome. Remove that exact directory and run this script again."
  }
  Write-Output $javaHome
  exit 0
}

New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null

if (Test-Path -LiteralPath $archivePath) {
  $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
  if ($archiveHash -ne $expectedSha256) {
    throw "Checksum mismatch for $archivePath. Remove that exact file and run this script again."
  }
} else {
  $temporaryArchive = Join-Path (
    [System.IO.Path]::GetTempPath()
  ) "syncly-temurin21-$([guid]::NewGuid().ToString('N')).zip"
  try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $temporaryArchive
    $downloadHash = (
      Get-FileHash -LiteralPath $temporaryArchive -Algorithm SHA256
    ).Hash
    if ($downloadHash -ne $expectedSha256) {
      throw 'Downloaded Temurin archive failed SHA-256 verification.'
    }
    Move-Item -LiteralPath $temporaryArchive -Destination $archivePath
  } finally {
    if (Test-Path -LiteralPath $temporaryArchive) {
      Remove-Item -LiteralPath $temporaryArchive -Force
    }
  }
}

New-Item -ItemType Directory -Path $javaRoot -Force | Out-Null
Expand-Archive -LiteralPath $archivePath -DestinationPath $javaRoot

if (-not (Test-Path -LiteralPath $javaExecutable)) {
  throw "Temurin extraction did not create $javaExecutable."
}

Write-Output $javaHome
