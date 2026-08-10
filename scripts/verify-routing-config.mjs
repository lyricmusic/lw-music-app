/* global console */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

function read(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8')
}

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(entryPath)
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [entryPath] : []
  })
}

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.engines.node, '>=22.22.0')
assert.equal(packageJson.dependencies['react-router'], '8.3.0')
assert.equal(packageJson.dependencies['react-router-dom'], undefined)
assert.equal(read('.node-version').trim(), '22.22.0')
assert.equal(read('.nvmrc').trim(), '22.22.0')

for (const workflow of [
  '.github/workflows/build-develop.yml',
  '.github/workflows/verify.yml',
]) {
  const source = read(workflow)
  assert.match(source, /node-version: 22\.22\.0/)
  assert.doesNotMatch(source, /node-version: 22\.14\.0/)
  assert.match(source, /pnpm test:routing/)
  assert.match(source, /pnpm verify:routing-config/)
}

assert.match(read('Dockerfile'), /^FROM node:22\.22\.0 AS builder/m)

const firebaseJson = JSON.parse(read('firebase.json'))
assert.deepEqual(firebaseJson.hosting.rewrites, [
  { destination: '/index.html', source: '**' },
])

const nginxConfig = read('deploy/nginx/syncly.lyricweb.ru.conf')
assert.match(nginxConfig, /try_files \$uri \$uri\/ \/index\.html;/)
assert.match(nginxConfig, /gzip on;/)
assert.match(nginxConfig, /gzip_vary on;/)
assert.match(
  nginxConfig,
  /Cache-Control "public, max-age=31536000, immutable" always;/,
)
assert.match(nginxConfig, /Cache-Control "no-cache" always;/)

for (const deploymentScript of [
  'deploy/install-syncly.sh',
  'deploy/release-syncly.sh',
]) {
  const source = read(deploymentScript)
  assert.match(source, /previous_release="\$\(readlink -f/)
  assert.match(
    source,
    /find "\$\{previous_release\}\/assets" -maxdepth 1 -type f -print0/,
  )
  assert.match(source, /ln -s "\$\{previous_asset\}" "\$\{legacy_asset\}"/)
}

for (const sourceFile of listSourceFiles(path.join(repositoryRoot, 'src'))) {
  assert.doesNotMatch(
    readFileSync(sourceFile, 'utf8'),
    /from ['"]react-router-dom['"]/,
    `react-router-dom import remains in ${path.relative(repositoryRoot, sourceFile)}`,
  )
}

assert.match(read('src/app/router/AppRouter.tsx'), /lazyRoute\(/)
assert.match(
  read('src/app/router/routeDefinitions.tsx'),
  /path=\{routes\.roomPattern\}/,
)

console.log('Routing, Node baseline and SPA hosting verification passed.')
