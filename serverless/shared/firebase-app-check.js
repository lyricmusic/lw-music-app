/* global console, module, process, require */

const { getAppCheck } = require('firebase-admin/app-check')

const APP_CHECK_MODES = new Set(['enforce', 'monitor', 'off'])
const loggedEmulatorBypassServices = new Set()

class AppCheckRequestError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
    this.statusCode = 401
  }
}

function getHeader(event, requestedName) {
  const normalizedName = requestedName.toLowerCase()
  return Object.entries(event?.headers ?? {}).find(
    ([name]) => name.toLowerCase() === normalizedName,
  )?.[1]
}

function getAppCheckMode(environment = process.env) {
  const configuredMode = environment.APP_CHECK_MODE?.trim().toLowerCase()
  const mode = configuredMode || 'enforce'
  if (!APP_CHECK_MODES.has(mode)) {
    throw new Error(
      'APP_CHECK_MODE must be one of: enforce, monitor, off.',
    )
  }
  return mode
}

function isFirebaseEmulatorEnvironment(environment = process.env) {
  const projectId =
    environment.FIREBASE_PROJECT_ID ||
    environment.GCLOUD_PROJECT ||
    environment.GOOGLE_CLOUD_PROJECT ||
    ''
  const hasEmulatorHost = Boolean(
    environment.FIREBASE_AUTH_EMULATOR_HOST ||
      environment.FIREBASE_DATABASE_EMULATOR_HOST ||
      environment.FIRESTORE_EMULATOR_HOST,
  )
  return hasEmulatorHost && projectId.startsWith('demo-')
}

function appCheckLog(logger, level, details) {
  const log = logger?.[level] ?? logger?.log
  log?.call(logger, {
    event: 'firebase_app_check',
    ...details,
  })
}

async function verifyRequestAppCheck({
  event,
  firebaseApp,
  logger = console,
  service,
  verifyToken,
}) {
  const mode = getAppCheckMode()
  const requestId = event?.requestContext?.requestId

  if (mode === 'off') {
    if (!isFirebaseEmulatorEnvironment()) {
      throw new Error(
        'APP_CHECK_MODE=off is allowed only for demo Firebase Emulator Suite projects.',
      )
    }
    if (!loggedEmulatorBypassServices.has(service)) {
      loggedEmulatorBypassServices.add(service)
      appCheckLog(logger, 'info', {
        mode,
        outcome: 'emulator-bypass',
        requestId,
        service,
      })
    }
    return { mode, outcome: 'emulator-bypass' }
  }

  const token = getHeader(event, 'x-firebase-appcheck')?.trim()
  if (!token) {
    appCheckLog(logger, 'warn', {
      mode,
      outcome: 'missing',
      requestId,
      service,
    })
    if (mode === 'enforce') {
      throw new AppCheckRequestError(
        'app-check-required',
        'Не удалось подтвердить подлинность приложения. Обновите страницу и повторите действие.',
      )
    }
    return { mode, outcome: 'missing' }
  }

  try {
    const result = verifyToken
      ? await verifyToken(token)
      : await getAppCheck(firebaseApp).verifyToken(token)
    appCheckLog(logger, 'info', {
      appId: result?.appId,
      mode,
      outcome: 'valid',
      requestId,
      service,
    })
    return { appId: result?.appId, mode, outcome: 'valid' }
  } catch (error) {
    appCheckLog(logger, 'warn', {
      errorCode: error?.code,
      mode,
      outcome: 'invalid',
      requestId,
      service,
    })
    if (mode === 'enforce') {
      throw new AppCheckRequestError(
        'app-check-invalid',
        'Проверка подлинности приложения не пройдена. Обновите страницу и повторите действие.',
      )
    }
    return { mode, outcome: 'invalid' }
  }
}

module.exports = {
  AppCheckRequestError,
  getAppCheckMode,
  isFirebaseEmulatorEnvironment,
  verifyRequestAppCheck,
}
