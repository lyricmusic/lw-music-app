param()

$ErrorActionPreference = 'Stop'
$javaHome = & (Join-Path $PSScriptRoot 'setup-firebase-jdk.ps1')

$env:JAVA_HOME = $javaHome
$env:PATH = "$(Join-Path $javaHome 'bin');$env:PATH"

& corepack pnpm verify:emulators
if ($LASTEXITCODE -ne 0) {
  throw "Firebase Emulator Suite verification failed with exit code $LASTEXITCODE."
}
