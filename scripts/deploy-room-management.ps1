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
  param([string[]]$Arguments)

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = & $YcPath @Arguments --format json 2>$null
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

$folderId = (& $YcPath config get folder-id 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or -not $folderId) {
  throw 'Run yc init and select a default folder before deploying.'
}

$serviceAccountName = 'lw-music-auth'
$secretName = 'lw-music-yandex-auth'
$functionName = 'lw-music-room-management'
$functionSource = (
  Resolve-Path (Join-Path $PSScriptRoot '..\serverless\room-management')
).Path

$serviceAccount = Find-YcJson @(
  'iam', 'service-account', 'get', '--name', $serviceAccountName
)
if (-not $serviceAccount) {
  throw "Yandex Cloud service account not found: $serviceAccountName"
}

$secret = Find-YcJson @('lockbox', 'secret', 'get', '--name', $secretName)
if (-not $secret -or -not $secret.current_version.id) {
  throw "Lockbox secret with Firebase credentials not found: $secretName"
}
$secretVersionId = $secret.current_version.id

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
    '--description', 'Authorizes and atomically applies LW Music room management actions'
  )
}

$deploymentSource = Join-Path (
  [System.IO.Path]::GetTempPath()
) "lw-music-room-management-$([guid]::NewGuid().ToString('N'))"
$sourceFiles = @('index.js', 'package.json', 'pnpm-lock.yaml')
$allowedOriginsValue = $AllowedOrigins -join ';'

New-Item -ItemType Directory -Path $deploymentSource | Out-Null
try {
  foreach ($sourceFile in $sourceFiles) {
    $sourcePath = Join-Path $functionSource $sourceFile
    if (-not (Test-Path -LiteralPath $sourcePath)) {
      throw "Function source file not found: $sourcePath"
    }
    Copy-Item -LiteralPath $sourcePath -Destination $deploymentSource
  }

  Invoke-YcJson @(
    'serverless', 'function', 'version', 'create',
    '--function-id', $function.id,
    '--runtime', 'nodejs22',
    '--entrypoint', 'index.handler',
    '--memory', '256MB',
    '--execution-timeout', '20s',
    '--service-account-id', $serviceAccount.id,
    '--source-path', $deploymentSource,
    '--environment', "ALLOWED_ORIGINS=$allowedOriginsValue",
    '--secret', "id=$($secret.id),version-id=$secretVersionId,key=FIREBASE_SERVICE_ACCOUNT_JSON,environment-variable=FIREBASE_SERVICE_ACCOUNT_JSON"
  ) | Out-Null
} finally {
  if (Test-Path -LiteralPath $deploymentSource) {
    Remove-Item -LiteralPath $deploymentSource -Recurse -Force
  }
}

Invoke-YcCommand @(
  'serverless', 'function', 'allow-unauthenticated-invoke', $function.id
)

$functionUrl = "https://functions.yandexcloud.net/$($function.id)"
[PSCustomObject]@{
  functionId = $function.id
  functionUrl = $functionUrl
  viteVariable = "VITE_ROOM_MANAGEMENT_API_URL=$functionUrl"
} | ConvertTo-Json
