import { signInAnonymously } from 'firebase/auth'

import { auth } from '@/shared/api/firebase'
import { trackProductEvent } from '@/shared/lib/telemetry'

export async function signInAsGuest(source: 'direct_link' | 'invite') {
  const credential = await signInAnonymously(auth)
  trackProductEvent({
    name: 'guest_sign_in',
    properties: { source },
  })
  return credential.user
}
