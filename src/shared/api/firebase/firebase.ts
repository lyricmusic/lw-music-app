import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getDatabase } from 'firebase/database'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'lwmusic-ffe83'
const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    'AIzaSyCUnMWQLZvBTaYTGE25VKxLtjG4jondqak',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    '1:930932722562:web:1727f2c2e3ea8dc50c5d9b',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    'lwmusic-ffe83.firebaseapp.com',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-WFT02H0JDT',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '930932722562',
  projectId,
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ||
    'https://lwmusic-ffe83-default-rtdb.europe-west1.firebasedatabase.app',
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export const realtimeDb = getDatabase(app)
export const firebaseFunctions = getFunctions(app, 'europe-west1')
