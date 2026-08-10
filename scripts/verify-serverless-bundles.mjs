/* global console, process */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const functions = [
  {
    directory: 'room-management',
    lockFile: 'pnpm-lock.yaml',
  },
  {
    directory: 'room-invites',
    lockFile: 'pnpm-lock.yaml',
  },
  {
    directory: 'room-cover-upload',
    lockFile: 'package-lock.json',
  },
  {
    directory: 'yandex-auth',
    lockFile: 'pnpm-lock.yaml',
  },
]
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'syncly-serverless-'))

function writeModule(bundleRoot, modulePath, source) {
  const filePath = path.join(bundleRoot, 'node_modules', modulePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, source)
}

function createDependencyStubs(bundleRoot) {
  writeModule(
    bundleRoot,
    'firebase-admin/app.js',
    'module.exports = { cert: value => value, deleteApp: async () => {}, getApps: () => [], initializeApp: value => value }\n',
  )
  writeModule(
    bundleRoot,
    'firebase-admin/app-check.js',
    "module.exports = { getAppCheck: () => ({ verifyToken: async () => ({ appId: 'test' }) }) }\n",
  )
  writeModule(
    bundleRoot,
    'firebase-admin/auth.js',
    "module.exports = { getAuth: () => ({ verifyIdToken: async () => ({ uid: 'test' }) }) }\n",
  )
  writeModule(
    bundleRoot,
    'firebase-admin/database.js',
    'module.exports = { getDatabase: () => ({}) }\n',
  )
  writeModule(
    bundleRoot,
    'firebase-admin/firestore.js',
    'module.exports = { FieldValue: { serverTimestamp: () => null }, Timestamp: {}, getFirestore: () => ({}) }\n',
  )
  writeModule(
    bundleRoot,
    '@aws-sdk/client-s3/index.js',
    'module.exports = { DeleteObjectCommand: class {}, HeadObjectCommand: class {}, S3Client: class {} }\n',
  )
  writeModule(
    bundleRoot,
    '@aws-sdk/s3-presigned-post/index.js',
    'module.exports = { createPresignedPost: async () => ({}) }\n',
  )
}

try {
  for (const { directory, lockFile } of functions) {
    const bundleRoot = path.join(temporaryRoot, directory)
    const functionRoot = path.join(bundleRoot, directory)
    const sharedRoot = path.join(bundleRoot, 'shared')
    mkdirSync(functionRoot, { recursive: true })
    mkdirSync(sharedRoot, { recursive: true })

    const sourceRoot = path.join(projectRoot, 'serverless', directory)
    copyFileSync(
      path.join(sourceRoot, 'index.js'),
      path.join(functionRoot, 'index.js'),
    )
    copyFileSync(
      path.join(sourceRoot, 'package.json'),
      path.join(bundleRoot, 'package.json'),
    )
    copyFileSync(
      path.join(sourceRoot, lockFile),
      path.join(bundleRoot, lockFile),
    )
    copyFileSync(
      path.join(projectRoot, 'serverless', 'shared', 'firebase-app-check.js'),
      path.join(sharedRoot, 'firebase-app-check.js'),
    )
    copyFileSync(
      path.join(projectRoot, 'serverless', 'shared', 'diagnostics.js'),
      path.join(sharedRoot, 'diagnostics.js'),
    )
    createDependencyStubs(bundleRoot)

    const entrypoint = path.join(functionRoot, 'index.js')
    const check = spawnSync(
      process.execPath,
      [
        '-e',
        `const entrypoint = require(${JSON.stringify(
          entrypoint,
        )}); if (typeof entrypoint.handler !== 'function') process.exit(2);`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          ALLOWED_ORIGINS: 'http://localhost:5173',
          APP_CHECK_MODE: 'off',
          FIREBASE_DATABASE_URL:
            'https://demo-lwmusic-default-rtdb.firebaseio.com',
          FIREBASE_PROJECT_ID: 'demo-lwmusic',
          FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        },
      },
    )
    assert.equal(
      check.status,
      0,
      `Serverless bundle entrypoint failed: ${directory}\n${check.stderr}`,
    )
  }

  const mediaPackage = JSON.parse(
    readFileSync(
      path.join(projectRoot, 'serverless', 'room-cover-upload', 'package.json'),
      'utf8',
    ),
  )
  assert.ok(
    mediaPackage.dependencies?.['firebase-admin'],
    'Media upload deployment must include firebase-admin for App Check.',
  )
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true })
}

console.log('Serverless deployment bundle layout verification passed.')
