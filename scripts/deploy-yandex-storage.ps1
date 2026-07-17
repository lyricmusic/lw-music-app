param(
  [string]$YcPath = 'C:\Users\cools\yandex-cloud\bin\yc.exe',
  [string]$FirebaseProjectId = 'lwmusic-ffe83',
  [string[]]$AllowedOrigins = @(
    'https://syncly.lyricweb.ru',
    'https://lwmusic-ffe83.web.app',
    'https://lwmusic-ffe83.firebaseapp.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173'
  )
)

$ErrorActionPreference = 'Continue'

function Invoke-YcJson {
  param([string[]]$Arguments)

  $output = & $YcPath @Arguments --format json 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Yandex Cloud CLI command failed: yc $($Arguments -join ' ')"
  }
  return $output | ConvertFrom-Json
}

function Find-YcJson {
  param([string[]]$Arguments)

  $output = & $YcPath @Arguments --format json 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return $output | ConvertFrom-Json
}

if (-not (Test-Path -LiteralPath $YcPath)) {
  throw "Yandex Cloud CLI not found at $YcPath"
}

$folderId = (& $YcPath config get folder-id 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or -not $folderId) {
  throw 'Run yc init and select a default folder before deploying.'
}

$serviceAccountName = 'lw-music-storage'
$secretName = 'lw-music-storage-key'
$functionName = 'lw-music-room-cover-upload'
$bucketName = "lw-music-room-covers-$folderId"
$functionSource = Join-Path $PSScriptRoot '..\serverless\room-cover-upload'

$serviceAccount = Find-YcJson @(
  'iam', 'service-account', 'get', '--name', $serviceAccountName
)
if (-not $serviceAccount) {
  $serviceAccount = Invoke-YcJson @(
    'iam', 'service-account', 'create',
    '--name', $serviceAccountName,
    '--description', 'Uploads and removes LW Music media files'
  )
}

& $YcPath resource-manager folder add-access-binding $folderId `
  --role storage.editor `
  --service-account-id $serviceAccount.id | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to grant storage.editor.' }

& $YcPath resource-manager folder add-access-binding $folderId `
  --role lockbox.payloadViewer `
  --service-account-id $serviceAccount.id | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to grant lockbox.payloadViewer.' }

$bucket = Find-YcJson @('storage', 'bucket', 'get', $bucketName)
if (-not $bucket) {
  $bucket = Invoke-YcJson @(
    'storage', 'bucket', 'create',
    '--name', $bucketName,
    '--max-size', '1073741824',
    '--public-read'
  )
} else {
  $bucket = Invoke-YcJson @(
    'storage', 'bucket', 'update',
    '--name', $bucketName,
    '--max-size', '1073741824',
    '--public-read'
  )
}

$corsOrigins = $AllowedOrigins -join ','
$cors = "allowed-methods=[method-post],allowed-origins=[$corsOrigins],allowed-headers=[*],expose-headers=[ETag],max-age-seconds=3600"
Invoke-YcJson @(
  'storage', 'bucket', 'update',
  '--name', $bucketName,
  '--cors', $cors
) | Out-Null

$secret = Find-YcJson @('lockbox', 'secret', 'get', '--name', $secretName)
if (-not $secret) {
  $accessKey = Invoke-YcJson @(
    'iam', 'access-key', 'create',
    '--service-account-id', $serviceAccount.id,
    '--description', 'LW Music media upload function'
  )
  $accessKeyId = if ($accessKey.access_key.key_id) {
    $accessKey.access_key.key_id
  } else {
    $accessKey.key_id
  }
  $secretPayload = @(
    @{ key = 'AWS_ACCESS_KEY_ID'; text_value = $accessKeyId },
    @{ key = 'AWS_SECRET_ACCESS_KEY'; text_value = $accessKey.secret }
  ) | ConvertTo-Json -Compress

  $secret = ($secretPayload | & $YcPath lockbox secret create `
      --name $secretName `
      --description 'Static Object Storage credentials for LW Music' `
      --payload - `
      --format json) | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create Lockbox secret.' }
  $secretVersionId = $secret.current_version.id
} else {
  $secretVersionId = $secret.current_version.id
}

$function = Find-YcJson @(
  'serverless', 'function', 'get', '--name', $functionName
)
if (-not $function) {
  $function = Invoke-YcJson @(
    'serverless', 'function', 'create',
    '--name', $functionName,
    '--description', 'Signs authenticated media uploads to Object Storage'
  )
}

$allowedOriginsValue = $AllowedOrigins -join ';'
Invoke-YcJson @(
  'serverless', 'function', 'version', 'create',
  '--function-id', $function.id,
  '--runtime', 'nodejs22',
  '--entrypoint', 'index.handler',
  '--memory', '256MB',
  '--execution-timeout', '10s',
  '--service-account-id', $serviceAccount.id,
  '--source-path', $functionSource,
  '--environment', "STORAGE_BUCKET=$bucketName,FIREBASE_PROJECT_ID=$FirebaseProjectId,ALLOWED_ORIGINS=$allowedOriginsValue",
  '--secret', "id=$($secret.id),version-id=$secretVersionId,key=AWS_ACCESS_KEY_ID,environment-variable=AWS_ACCESS_KEY_ID",
  '--secret', "id=$($secret.id),version-id=$secretVersionId,key=AWS_SECRET_ACCESS_KEY,environment-variable=AWS_SECRET_ACCESS_KEY"
) | Out-Null

& $YcPath serverless function allow-unauthenticated-invoke $function.id | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to allow HTTPS invocation.' }

$deployedFunction = Invoke-YcJson @(
  'serverless', 'function', 'get', '--id', $function.id
)

[PSCustomObject]@{
  bucket = $bucketName
  functionId = $function.id
  functionUrl = $deployedFunction.http_invoke_url
} | ConvertTo-Json
