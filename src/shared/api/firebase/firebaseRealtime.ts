import { getDatabase } from 'firebase/database'

import { firebaseApp } from './firebase'

export const realtimeDb = getDatabase(firebaseApp)
