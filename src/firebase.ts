import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// TODO: Add SDKs for Firebase products that you want to use

// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration

// For Firebase JS SDK v7.20.0 and later, measurementId is optional

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
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-WFT02H0JDT',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '930932722562',
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID || 'lwmusic-ffe83',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'lwmusic-ffe83.appspot.com',
}

// Initialize Firebase

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

export const auth = getAuth(app)
