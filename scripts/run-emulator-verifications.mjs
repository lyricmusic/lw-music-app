/* global console, process */

import { spawnSync } from 'node:child_process'

const allVerificationScripts = [
  'scripts/verify-room-model-rules.mjs',
  'scripts/verify-realtime-room-rules.mjs',
  'scripts/verify-room-queue-rules.mjs',
  'scripts/verify-room-functions.mjs',
  'scripts/verify-room-invite-function.mjs',
  'scripts/verify-app-check.mjs',
  'scripts/verify-message-cleanup.mjs',
]
const requestedScripts = process.argv.slice(2)
const verificationScripts =
  requestedScripts.length > 0 ? requestedScripts : allVerificationScripts

for (const requestedScript of verificationScripts) {
  if (!allVerificationScripts.includes(requestedScript)) {
    throw new Error(`Unknown emulator verification script: ${requestedScript}`)
  }
}

for (const verificationScript of verificationScripts) {
  console.log(`\nRunning ${verificationScript}...`)
  const result = spawnSync(process.execPath, [verificationScript], {
    env: process.env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log('\nAll Firebase Emulator Suite verifications passed.')
