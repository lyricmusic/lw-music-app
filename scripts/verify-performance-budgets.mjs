/* global console, process */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const distDirectory = path.resolve('dist')
const manifestPath = path.join(distDirectory, '.vite', 'manifest.json')
const budgetPath = path.resolve('performance-budgets.json')
const reportOnly = process.argv.includes('--report-only')
const jsonOutput = process.argv.includes('--json')

assert.ok(
  existsSync(manifestPath),
  'dist/.vite/manifest.json is required; run the production build first.',
)
assert.ok(existsSync(budgetPath), 'performance-budgets.json is required.')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const budgets = JSON.parse(readFileSync(budgetPath, 'utf8'))

function findManifestKey(source) {
  const match = Object.entries(manifest).find(
    ([key, entry]) => key === source || entry.src === source,
  )
  assert.ok(match, `Missing manifest entry for ${source}.`)
  return match[0]
}

function collectStaticGraph(entrySources) {
  const collected = new Set()
  const visit = key => {
    if (collected.has(key)) return
    const entry = manifest[key]
    assert.ok(entry, `Missing imported manifest entry ${key}.`)
    collected.add(key)
    for (const importedKey of entry.imports ?? []) visit(importedKey)
  }

  for (const source of entrySources) visit(findManifestKey(source))
  return collected
}

function collectFiles(graph, field) {
  return new Set(
    [...graph].flatMap(key => {
      const entry = manifest[key]
      return field === 'file' ? [entry.file] : (entry[field] ?? [])
    }),
  )
}

function listFiles(directory) {
  return readdirSync(directory).flatMap(name => {
    const filePath = path.join(directory, name)
    return statSync(filePath).isDirectory() ? listFiles(filePath) : [filePath]
  })
}

function compress(buffer) {
  return {
    brotli: brotliCompressSync(buffer, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
      },
    }).byteLength,
    gzip: gzipSync(buffer, { level: 9 }).byteLength,
    raw: buffer.byteLength,
  }
}

function measureFiles(relativePaths) {
  return [...relativePaths].sort().reduce(
    (total, relativePath) => {
      const metrics = compress(
        readFileSync(path.join(distDirectory, relativePath)),
      )
      return {
        brotli: total.brotli + metrics.brotli,
        files: total.files + 1,
        gzip: total.gzip + metrics.gzip,
        raw: total.raw + metrics.raw,
      }
    },
    { brotli: 0, files: 0, gzip: 0, raw: 0 },
  )
}

function subtractGraph(graph, baseGraph) {
  return new Set([...graph].filter(key => !baseGraph.has(key)))
}

function largestFile(relativePaths) {
  const measured = [...relativePaths].map(file => ({
    file,
    ...compress(readFileSync(path.join(distDirectory, file))),
  }))
  return measured.sort((left, right) => right.raw - left.raw)[0]
}

function unionGraphs(...graphs) {
  return new Set(graphs.flatMap(graph => [...graph]))
}

function rawSize(relativePaths) {
  return [...relativePaths].reduce(
    (total, relativePath) =>
      total + statSync(path.join(distDirectory, relativePath)).size,
    0,
  )
}

const initialGraph = collectStaticGraph(['index.html', 'src/app/App.tsx'])
const initialJavaScriptFiles = new Set(
  [...collectFiles(initialGraph, 'file')].filter(file => file.endsWith('.js')),
)
const initialStylesheetFiles = collectFiles(initialGraph, 'css')
const allJavaScriptFiles = new Set(
  listFiles(distDirectory)
    .filter(file => file.endsWith('.js'))
    .map(file => path.relative(distDirectory, file).replaceAll('\\', '/')),
)

const routeSources = {
  join: 'src/pages/join/index.ts',
  notFound: 'src/pages/not-found/index.ts',
  room: 'src/pages/room/index.ts',
  rooms: 'src/pages/rooms/index.ts',
  signIn: 'src/pages/sign-in/index.ts',
  signUp: 'src/pages/sign-up/index.ts',
}

const routeGraphs = Object.fromEntries(
  Object.entries(routeSources).map(([route, source]) => [
    route,
    collectStaticGraph([source]),
  ]),
)
const routeJavaScript = Object.fromEntries(
  Object.entries(routeGraphs).map(([route, routeGraph]) => {
    return [
      route,
      measureFiles(
        new Set(
          [
            ...collectFiles(subtractGraph(routeGraph, initialGraph), 'file'),
          ].filter(file => file.endsWith('.js')),
        ),
      ),
    ]
  }),
)
const routeColdJavaScript = Object.fromEntries(
  Object.entries(routeGraphs).map(([route, routeGraph]) => [
    route,
    measureFiles(
      new Set(
        [...collectFiles(unionGraphs(initialGraph, routeGraph), 'file')].filter(
          file => file.endsWith('.js'),
        ),
      ),
    ),
  ]),
)

const allRelativeFiles = listFiles(distDirectory).map(file =>
  path.relative(distDirectory, file).replaceAll('\\', '/'),
)
const imageFiles = allRelativeFiles.filter(file =>
  /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(file),
)
const fontFiles = allRelativeFiles.filter(file =>
  /\.(?:otf|ttf|woff2?)$/i.test(file),
)

const authBackgroundEntry = manifest[findManifestKey('assets/background.svg')]
const report = {
  artifact: {
    files: allRelativeFiles.length,
    fontsRaw: rawSize(fontFiles),
    imagesRaw: rawSize(imageFiles),
    raw: rawSize(allRelativeFiles),
  },
  authBackground: compress(
    readFileSync(path.join(distDirectory, authBackgroundEntry.file)),
  ),
  initialJavaScript: measureFiles(initialJavaScriptFiles),
  initialStylesheet: measureFiles(initialStylesheetFiles),
  largestJavaScript: largestFile(allJavaScriptFiles),
  routeColdJavaScript,
  routeJavaScript,
  totalJavaScript: measureFiles(allJavaScriptFiles),
}

function assertWithinBudget(label, actual, budget) {
  assert.ok(
    actual <= budget,
    `${label} is ${actual} bytes, above the ${budget}-byte budget.`,
  )
}

if (!reportOnly) {
  assert.equal(budgets.schemaVersion, 1)
  assertWithinBudget(
    'Initial JavaScript (gzip)',
    report.initialJavaScript.gzip,
    budgets.initialJavaScriptGzip,
  )
  assertWithinBudget(
    'Initial stylesheet (gzip)',
    report.initialStylesheet.gzip,
    budgets.initialStylesheetGzip,
  )
  assertWithinBudget(
    'Largest JavaScript file (raw)',
    report.largestJavaScript.raw,
    budgets.largestJavaScriptRaw,
  )
  assertWithinBudget(
    'Total JavaScript (gzip)',
    report.totalJavaScript.gzip,
    budgets.totalJavaScriptGzip,
  )
  assertWithinBudget(
    'Authentication background (raw)',
    report.authBackground.raw,
    budgets.authBackgroundRaw,
  )
  assertWithinBudget(
    'Production artifact (raw)',
    report.artifact.raw,
    budgets.totalArtifactRaw,
  )

  for (const [route, budget] of Object.entries(budgets.routeJavaScriptGzip)) {
    assert.ok(report.routeJavaScript[route], `Unknown route budget: ${route}.`)
    assertWithinBudget(
      `${route} incremental JavaScript (gzip)`,
      report.routeJavaScript[route].gzip,
      budget,
    )
  }

  for (const [route, budget] of Object.entries(
    budgets.routeColdJavaScriptGzip,
  )) {
    assert.ok(
      report.routeColdJavaScript[route],
      `Unknown cold route budget: ${route}.`,
    )
    assertWithinBudget(
      `${route} cold-route JavaScript (gzip)`,
      report.routeColdJavaScript[route].gzip,
      budget,
    )
  }
}

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const format = value => `${(value / 1024).toFixed(1)} KiB`
  console.log(
    `Initial JS: ${format(report.initialJavaScript.raw)} raw / ${format(report.initialJavaScript.gzip)} gzip / ${format(report.initialJavaScript.brotli)} Brotli`,
  )
  console.log(
    `Initial CSS: ${format(report.initialStylesheet.raw)} raw / ${format(report.initialStylesheet.gzip)} gzip / ${format(report.initialStylesheet.brotli)} Brotli`,
  )
  console.log(
    `Largest JS: ${report.largestJavaScript.file} (${format(report.largestJavaScript.raw)} raw / ${format(report.largestJavaScript.gzip)} gzip)`,
  )
  console.log(
    `Total JS: ${format(report.totalJavaScript.raw)} raw / ${format(report.totalJavaScript.gzip)} gzip / ${format(report.totalJavaScript.brotli)} Brotli`,
  )
  console.log(
    `Auth background: ${format(report.authBackground.raw)} raw / ${format(report.authBackground.gzip)} gzip / ${format(report.authBackground.brotli)} Brotli`,
  )
  console.log(
    `Artifact: ${format(report.artifact.raw)} raw (${format(report.artifact.imagesRaw)} images, ${format(report.artifact.fontsRaw)} fonts)`,
  )
  for (const [route, metrics] of Object.entries(report.routeJavaScript)) {
    console.log(
      `${route}: ${format(report.routeColdJavaScript[route].gzip)} gzip cold route, +${format(metrics.gzip)} incremental (${metrics.files} files)`,
    )
  }
  console.log(
    reportOnly
      ? 'Performance report completed without enforcing budgets.'
      : 'Performance budgets passed.',
  )
}
