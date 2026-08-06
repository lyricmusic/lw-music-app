import { getApps, initializeApp } from 'firebase/app'
import {
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
} from 'firebase/app-check'
import type { AppCheck } from 'firebase/app-check'
import { getAuth } from 'firebase/auth'
import { getDatabase } from 'firebase/database'
import { getFirestore } from 'firebase/firestore'

const PRODUCTION_PROJECT_ID = 'lwmusic-ffe83'
const FIREBASE_APP_NAME = 'syncly-web'

function requiredEnvironment(name: string, value: string | undefined) {
  const normalizedValue = value?.trim()
  if (!normalizedValue) {
    throw new Error(
      `Firebase is not configured for ${import.meta.env.MODE}: missing ${name}.`,
    )
  }
  return normalizedValue
}

const appEnvironment = requiredEnvironment(
  'VITE_APP_ENV',
  import.meta.env.VITE_APP_ENV,
)
if (appEnvironment !== 'development' && appEnvironment !== 'production') {
  throw new Error('VITE_APP_ENV must be either "development" or "production".')
}

const projectId = requiredEnvironment(
  'VITE_FIREBASE_PROJECT_ID',
  import.meta.env.VITE_FIREBASE_PROJECT_ID,
)
if (appEnvironment === 'development' && projectId === PRODUCTION_PROJECT_ID) {
  throw new Error(
    'Development mode is blocked from using the production Firebase project.',
  )
}
if (appEnvironment === 'production' && projectId !== PRODUCTION_PROJECT_ID) {
  throw new Error('Production mode must use the production Firebase project.')
}

const firebaseConfig = {
  apiKey: requiredEnvironment(
    'VITE_FIREBASE_API_KEY',
    import.meta.env.VITE_FIREBASE_API_KEY,
  ),
  appId: requiredEnvironment(
    'VITE_FIREBASE_APP_ID',
    import.meta.env.VITE_FIREBASE_APP_ID,
  ),
  authDomain: requiredEnvironment(
    'VITE_FIREBASE_AUTH_DOMAIN',
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  ),
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim() || undefined,
  messagingSenderId: requiredEnvironment(
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  ),
  projectId,
  databaseURL: requiredEnvironment(
    'VITE_FIREBASE_DATABASE_URL',
    import.meta.env.VITE_FIREBASE_DATABASE_URL,
  ),
}

const existingApp = getApps().find(({ name }) => name === FIREBASE_APP_NAME)
if (
  existingApp &&
  (existingApp.options.appId !== firebaseConfig.appId ||
    existingApp.options.projectId !== firebaseConfig.projectId)
) {
  throw new Error('Firebase was already initialized with another project.')
}
const app = existingApp ?? initializeApp(firebaseConfig, FIREBASE_APP_NAME)
const appCheckSiteKey =
  import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY?.trim() || null

type FirebaseAppCheckCache = typeof globalThis & {
  FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string
  __synclyFirebaseAppCheck?: {
    appId: string
    instance: AppCheck
  }
}

const appCheckCache = globalThis as FirebaseAppCheckCache
const cachedAppCheck = appCheckCache.__synclyFirebaseAppCheck
const debugAppCheckRequested =
  import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG === 'true'

if (debugAppCheckRequested) {
  if (!import.meta.env.DEV || appEnvironment !== 'development') {
    throw new Error(
      'Firebase App Check debug mode is allowed only by the Vite development server.',
    )
  }
  appCheckCache.FIREBASE_APPCHECK_DEBUG_TOKEN = true
}

export const appCheck = (() => {
  if (!appCheckSiteKey) return null
  if (cachedAppCheck?.appId === firebaseConfig.appId) {
    return cachedAppCheck.instance
  }

  const instance = initializeAppCheck(app, {
    isTokenAutoRefreshEnabled: true,
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
  })
  appCheckCache.__synclyFirebaseAppCheck = {
    appId: firebaseConfig.appId,
    instance,
  }
  return instance
})()
export const db = getFirestore(app)
export const auth = getAuth(app)
export const realtimeDb = getDatabase(app)
