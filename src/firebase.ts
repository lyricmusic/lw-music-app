import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// TODO: Add SDKs for Firebase products that you want to use

// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration

// For Firebase JS SDK v7.20.0 and later, measurementId is optional

const firebaseConfig = {
  apiKey: 'AIzaSyCUnMWQLZvBTaYTGE25VKxLtjG4jondqak',
  appId: '1:930932722562:web:1727f2c2e3ea8dc50c5d9b',
  authDomain: 'lwmusic-ffe83.firebaseapp.com',
  measurementId: 'G-WFT02H0JDT',
  messagingSenderId: '930932722562',
  projectId: 'lwmusic-ffe83',
  storageBucket: 'lwmusic-ffe83.appspot.com',
}

// Initialize Firebase

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

export const auth = getAuth(app)
