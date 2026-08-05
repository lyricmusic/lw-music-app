import { initializeApp } from 'firebase/app'
import {
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
} from 'firebase/app-check'
import { getAuth } from 'firebase/auth'
import { getDatabase } from 'firebase/database'
import { getFirestore } from 'firebase/firestore'

const PRODUCTION_PROJECT_ID = 'lwmusic-ffe83'

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

const app = initializeApp(firebaseConfig)
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY

export const appCheck = appCheckSiteKey
  ? initializeAppCheck(app, {
      isTokenAutoRefreshEnabled: true,
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    })
  : null
export const db = getFirestore(app)
export const auth = getAuth(app)
export const realtimeDb = getDatabase(app)
