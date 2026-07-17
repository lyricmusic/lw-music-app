param(
  [string]$YcPath = 'yc',
  [string[]]$AllowedOrigins = @(
    'https://syncly.lyricweb.ru',
    'https://lwmusic-ffe83.web.app',
    'https://lwmusic-ffe83.firebaseapp.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173'
  )
)

$ErrorActionPreference = 'Stop'

function Invoke-YcJson {
  param(
    [string[]]$Arguments,
    [AllowNull()][string]$InputText
  )

  $hasInput = $PSBoundParameters.ContainsKey('InputText')
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # yc writes progress to stderr even when a command succeeds. Windows
    # PowerShell must be allowed to finish the process before we inspect its
    # exit code, otherwise ErrorActionPreference=Stop aborts the script.
    $ErrorActionPreference = 'Continue'
    if ($hasInput) {
      $output = $InputText | & $YcPath @Arguments --format json 2>$null
    } else {
      $output = & $YcPath @Arguments --format json 2>$null
    }
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -ne 0) {
    throw "Yandex Cloud CLI command failed: yc $($Arguments -join ' ')"
  }
  return $output | ConvertFrom-Json
}

function Invoke-YcCommand {
  param([string[]]$Arguments)

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $null = & $YcPath @Arguments 2>$null
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -ne 0) {
    throw "Yandex Cloud CLI command failed: yc $($Arguments -join ' ')"
  }
}

function Find-YcJson {
  param([string[]]$Arguments)

  # Windows PowerShell turns stderr from native programs into error records.
  # With ErrorActionPreference=Stop an expected "not found" response would
  # terminate the script before we get a chance to inspect LASTEXITCODE.
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = & $YcPath @Arguments --format json 2>$null
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -ne 0) { return $null }
  return $output | ConvertFrom-Json
}

$ycCommand = Get-Command $YcPath -ErrorAction SilentlyContinue
if (-not $ycCommand) { throw "Yandex Cloud CLI not found: $YcPath" }
$YcPath = $ycCommand.Source

$previousErrorActionPreference = $ErrorActionPreference
try {
  $ErrorActionPreference = 'Continue'
  $folderId = (& $YcPath config get folder-id 2>$null).Trim()
  $folderConfigExitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $previousErrorActionPreference
}
if ($folderConfigExitCode -ne 0 -or -not $folderId) {
  throw 'Run yc init and select a default folder before deploying.'
}

$yandexClientId = $env:SYNC_YANDEX_CLIENT_ID
$yandexClientSecret = $env:SYNC_YANDEX_CLIENT_SECRET
$firebaseServiceAccountPath = $env:SYNC_FIREBASE_SERVICE_ACCOUNT_PATH

if (-not $yandexClientId) {
  throw 'Set SYNC_YANDEX_CLIENT_ID before deploying.'
}
if (-not $yandexClientSecret) {
  throw 'Set SYNC_YANDEX_CLIENT_SECRET before deploying.'
}
if (-not $firebaseServiceAccountPath) {
  throw 'Set SYNC_FIREBASE_SERVICE_ACCOUNT_PATH before deploying.'
}
if (-not (Test-Path -LiteralPath $firebaseServiceAccountPath)) {
  throw "Firebase service account file not found: $firebaseServiceAccountPath"
}

$firebaseServiceAccountJson = (
  Get-Content -LiteralPath $firebaseServiceAccountPath -Raw
).Trim()
$firebaseServiceAccountJson | ConvertFrom-Json | Out-Null

$serviceAccountName = 'lw-music-auth'
$secretName = 'lw-music-yandex-auth'
$functionName = 'lw-music-yandex-auth'
$functionSource = Join-Path $PSScriptRoot '..\serverless\yandex-auth'

$serviceAccount = Find-YcJson @(
  'iam', 'service-account', 'get', '--name', $serviceAccountName
)
if (-not $serviceAccount) {
  $serviceAccount = Invoke-YcJson @(
    'iam', 'service-account', 'create',
    '--name', $serviceAccountName,
    '--description', 'Runs Yandex ID authentication for LW Music'
  )
}

Invoke-YcCommand @(
  'resource-manager', 'folder', 'add-access-binding', $folderId,
  '--role', 'lockbox.payloadViewer',
  '--service-account-id', $serviceAccount.id
)

$function = Find-YcJson @(
  'serverless', 'function', 'get', '--name', $functionName
)
if (-not $function) {
  $function = Invoke-YcJson @(
    'serverless', 'function', 'create',
    '--name', $functionName,
    '--description', 'Exchanges Yandex ID OAuth codes for Firebase custom tokens'
  )
}

$redirectUri = "https://functions.yandexcloud.net/$($function.id)"
$secretPayload = @(
  @{ key = 'YANDEX_CLIENT_ID'; text_value = $yandexClientId },
  @{ key = 'YANDEX_CLIENT_SECRET'; text_value = $yandexClientSecret },
  @{ key = 'FIREBASE_SERVICE_ACCOUNT_JSON'; text_value = $firebaseServiceAccountJson }
) | ConvertTo-Json -Compress

$secret = Find-YcJson @('lockbox', 'secret', 'get', '--name', $secretName)
if (-not $secret) {
  $secret = Invoke-YcJson -Arguments @(
    'lockbox', 'secret', 'create',
    '--name', $secretName,
    '--description', 'Yandex ID and Firebase credentials for LW Music',
    '--payload', '-'
  ) -InputText $secretPayload
  $secretVersionId = $secret.current_version.id
} else {
  $secretVersion = Invoke-YcJson -Arguments @(
    'lockbox', 'secret', 'add-version',
    '--id', $secret.id,
    '--payload', '-'
  ) -InputText $secretPayload
  $secretVersionId = $secretVersion.id
}

$allowedOriginsValue = $AllowedOrigins -join ';'
Invoke-YcJson @(
  'serverless', 'function', 'version', 'create',
  '--function-id', $function.id,
  '--runtime', 'nodejs22',
  '--entrypoint', 'index.handler',
  '--memory', '256MB',
  '--execution-timeout', '15s',
  '--service-account-id', $serviceAccount.id,
  '--source-path', $functionSource,
  '--environment', "YANDEX_REDIRECT_URI=$redirectUri,ALLOWED_ORIGINS=$allowedOriginsValue",
  '--secret', "id=$($secret.id),version-id=$secretVersionId,key=YANDEX_CLIENT_ID,environment-variable=YANDEX_CLIENT_ID",
  '--secret', "id=$($secret.id),version-id=$secretVersionId,key=YANDEX_CLIENT_SECRET,environment-variable=YANDEX_CLIENT_SECRET",
  '--secret', "id=$($secret.id),version-id=$secretVersionId,key=FIREBASE_SERVICE_ACCOUNT_JSON,environment-variable=FIREBASE_SERVICE_ACCOUNT_JSON"
) | Out-Null

Invoke-YcCommand @(
  'serverless', 'function', 'allow-unauthenticated-invoke', $function.id
)

[PSCustomObject]@{
  functionId = $function.id
  functionUrl = $redirectUri
  redirectUri = $redirectUri
  viteVariable = "VITE_YANDEX_AUTH_URL=$redirectUri"
} | ConvertTo-Json
