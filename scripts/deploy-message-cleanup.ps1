param(
  [string]$YcPath = 'yc',
  [string]$Schedule = '0 * ? * * *'
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
$functionName = 'lw-music-message-cleanup'
$triggerName = 'lw-music-message-cleanup'
$functionSource = (
  Resolve-Path (Join-Path $PSScriptRoot '..\serverless\message-cleanup')
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
Invoke-YcCommand @(
  'resource-manager', 'folder', 'add-access-binding', $folderId,
  '--role', 'functions.functionInvoker',
  '--service-account-id', $serviceAccount.id
)

$function = Find-YcJson @(
  'serverless', 'function', 'get', '--name', $functionName
)
if (-not $function) {
  $function = Invoke-YcJson @(
    'serverless', 'function', 'create',
    '--name', $functionName,
    '--description', 'Deletes expired LW Music room messages on schedule'
  )
}

$deploymentSource = Join-Path (
  [System.IO.Path]::GetTempPath()
) "lw-music-message-cleanup-$([guid]::NewGuid().ToString('N'))"
$sourceFiles = @('index.js', 'package.json', 'pnpm-lock.yaml')

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
    '--execution-timeout', '60s',
    '--service-account-id', $serviceAccount.id,
    '--source-path', $deploymentSource,
    '--secret', "id=$($secret.id),version-id=$secretVersionId,key=FIREBASE_SERVICE_ACCOUNT_JSON,environment-variable=FIREBASE_SERVICE_ACCOUNT_JSON"
  ) | Out-Null
} finally {
  if (Test-Path -LiteralPath $deploymentSource) {
    Remove-Item -LiteralPath $deploymentSource -Recurse -Force
  }
}

$trigger = Find-YcJson @(
  'serverless', 'trigger', 'get', '--name', $triggerName
)
if ($trigger) {
  $trigger = Invoke-YcJson @(
    'serverless', 'trigger', 'update', 'timer',
    '--id', $trigger.id,
    '--new-cron-expression', $Schedule,
    '--new-invoke-function-id', $function.id,
    '--new-invoke-function-service-account-id', $serviceAccount.id,
    '--new-function-retry-attempts', '3',
    '--new-function-retry-interval', '30s'
  )
} else {
  $trigger = Invoke-YcJson @(
    'serverless', 'trigger', 'create', 'timer',
    '--name', $triggerName,
    '--description', 'Deletes room messages older than 24 hours every hour',
    '--cron-expression', $Schedule,
    '--invoke-function-id', $function.id,
    '--invoke-function-service-account-id', $serviceAccount.id,
    '--retry-attempts', '3',
    '--retry-interval', '30s'
  )
}

[PSCustomObject]@{
  functionId = $function.id
  schedule = $Schedule
  triggerId = $trigger.id
  triggerStatus = $trigger.status
} | ConvertTo-Json
