/* global console */

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const distDirectory = path.resolve('dist')
assert.ok(
  existsSync(distDirectory),
  'dist must exist before artifact verification',
)

function listFiles(directory) {
  return readdirSync(directory).flatMap(name => {
    const filePath = path.join(directory, name)
    return statSync(filePath).isDirectory() ? listFiles(filePath) : [filePath]
  })
}

const files = listFiles(distDirectory)
assert.ok(
  files.includes(path.join(distDirectory, '.vite', 'manifest.json')),
  'The production manifest is required for performance verification.',
)
assert.deepEqual(
  files.filter(file => file.endsWith('.map')),
  [],
  'Production artifacts must never contain source-map files.',
)
assert.deepEqual(
  files.filter(file => /(?:service-worker|sw)\.[cm]?js$/i.test(file)),
  [],
  'No service worker should retain legacy application assets.',
)

for (const file of files.filter(file => /\.(?:css|html|js)$/.test(file))) {
  const source = readFileSync(file, 'utf8')
  assert.doesNotMatch(source, /SENTRY_AUTH_TOKEN/)
  assert.doesNotMatch(source, /sourceMappingURL=.*\.map/)
}

console.log('Production artifact contains no source maps or upload secrets.')
