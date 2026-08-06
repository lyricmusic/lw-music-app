/* global console, process */

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)

for (const jsonFile of trackedFiles.filter(file => file.endsWith('.json'))) {
  const source = readFileSync(jsonFile, 'utf8')
  if (path.basename(jsonFile).startsWith('tsconfig')) {
    const result = ts.parseConfigFileTextToJson(jsonFile, source)
    assert.equal(
      result.error,
      undefined,
      `Invalid JSONC in TypeScript config: ${jsonFile}`,
    )
  } else {
    assert.doesNotThrow(() => JSON.parse(source), `Invalid JSON: ${jsonFile}`)
  }
}

for (const nodeFile of trackedFiles.filter(
  file => file.endsWith('.js') || file.endsWith('.mjs'),
)) {
  const result = spawnSync(process.execPath, ['--check', nodeFile], {
    encoding: 'utf8',
  })
  assert.equal(
    result.status,
    0,
    `Invalid Node.js syntax: ${nodeFile}\n${result.stderr}`,
  )
}

console.log('Tracked JSON and Node.js syntax verification passed.')
