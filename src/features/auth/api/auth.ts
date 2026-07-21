import { FirebaseError } from 'firebase/app'
import {
  EmailAuthProvider,
  User,
  createUserWithEmailAndPassword,
  linkWithCredential,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'

import { resolveUserCharacter } from '@/entities/session'
import { auth, db } from '@/shared/api/firebase'

const YANDEX_AUTH_MESSAGE_TYPE = 'syncly:yandex-auth'
const yandexAuthUrl = import.meta.env.VITE_YANDEX_AUTH_URL

interface YandexAuthMessage {
  error?: string
  state?: string
  token?: string
  type?: string
}

class AuthFlowError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'AuthFlowError'
  }
}

interface SaveUserProfileOptions {
  displayName?: string
  requireOnboarding?: boolean
  skipOnboarding?: boolean
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createYandexState() {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(24))
  const nonce = Array.from(nonceBytes, byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')

  return encodeBase64Url(
    JSON.stringify({ nonce, origin: window.location.origin }),
  )
}

async function saveUserProfile(
  user: User,
  {
    displayName,
    requireOnboarding = false,
    skipOnboarding = false,
  }: SaveUserProfileOptions = {},
) {
  const userRef = doc(db, 'users', user.uid)
  const userSnapshot = await getDoc(userRef)
  const existingProfile = userSnapshot.data()
  const isNewProfile = !userSnapshot.exists()
  const resolvedDisplayName = (
    displayName?.trim() ||
    user.displayName ||
    user.email?.split('@')[0] ||
    'Пользователь'
  ).slice(0, 50)

  const resolvedPhotoURL = existingProfile?.photoURL ?? user.photoURL
  const existingAvatar = existingProfile?.avatar
  const avatar =
    requireOnboarding && isNewProfile
      ? { presetId: null, storagePath: null, type: 'none' }
      : existingAvatar?.type === 'none' && resolvedPhotoURL
        ? { presetId: null, storagePath: null, type: 'provider' }
        : (existingAvatar ?? {
            presetId: null,
            storagePath: null,
            type: resolvedPhotoURL ? 'provider' : 'none',
          })

  await setDoc(userRef, {
    avatar,
    character: resolveUserCharacter(existingProfile?.character),
    createdAt: existingProfile?.createdAt ?? serverTimestamp(),
    displayName: resolvedDisplayName,
    email: user.email ?? '',
    onboardingCompleted:
      skipOnboarding ||
      (existingProfile?.onboardingCompleted ??
        !(requireOnboarding || isNewProfile)),
    photoURL: requireOnboarding && isNewProfile ? null : resolvedPhotoURL,
    updatedAt: serverTimestamp(),
  })
}

export async function signUpWithEmail({
  email,
  password,
}: {
  email: string
  password: string
}) {
  if (auth.currentUser?.isAnonymous) {
    return saveAnonymousUserWithEmail({ email, password })
  }

  const credential = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  )

  const displayName = email.trim().split('@')[0].slice(0, 50)
  await updateProfile(credential.user, { displayName: displayName.trim() })
  await saveUserProfile(credential.user, {
    displayName,
    requireOnboarding: true,
  })

  return credential.user
}

export async function saveAnonymousUserWithEmail({
  email,
  password,
}: {
  email: string
  password: string
}) {
  const anonymousUser = auth.currentUser
  if (!anonymousUser?.isAnonymous) {
    throw new AuthFlowError('auth/requires-anonymous-user')
  }

  const credential = EmailAuthProvider.credential(email.trim(), password)
  const linkedCredential = await linkWithCredential(anonymousUser, credential)
  await saveUserProfile(linkedCredential.user)
  return linkedCredential.user
}

export async function signInWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  )

  await saveUserProfile(credential.user)
  return credential.user
}

export async function signInWithYandex({
  linkAnonymousUser,
}: { linkAnonymousUser?: boolean } = {}) {
  if (!yandexAuthUrl) {
    throw new AuthFlowError('yandex/not-configured')
  }

  const state = createYandexState()
  const authEndpoint = new URL(yandexAuthUrl)
  authEndpoint.searchParams.set('state', state)

  const shouldLinkAnonymousUser =
    linkAnonymousUser ?? auth.currentUser?.isAnonymous === true
  const anonymousUser = shouldLinkAnonymousUser ? auth.currentUser : null
  if (shouldLinkAnonymousUser) {
    if (!anonymousUser?.isAnonymous) {
      throw new AuthFlowError('auth/requires-anonymous-user')
    }

    const firebaseToken = await anonymousUser.getIdToken()
    authEndpoint.searchParams.set('mode', 'link')
    authEndpoint.hash = new URLSearchParams({ firebaseToken }).toString()
  }

  const popup = window.open(
    authEndpoint,
    'syncly-yandex-auth',
    'popup=yes,width=520,height=720',
  )

  if (!popup) {
    return Promise.reject(new AuthFlowError('yandex/popup-blocked'))
  }

  const expectedOrigin = authEndpoint.origin

  return new Promise<User>((resolve, reject) => {
    let completed = false

    const cleanup = () => {
      completed = true
      window.clearInterval(popupClosedInterval)
      window.clearTimeout(timeout)
      window.removeEventListener('message', handleMessage)
    }

    const fail = (code: string) => {
      if (completed) return
      cleanup()
      popup.close()
      reject(new AuthFlowError(code))
    }

    const handleMessage = async (event: MessageEvent<YandexAuthMessage>) => {
      if (
        completed ||
        event.origin !== expectedOrigin ||
        event.data?.type !== YANDEX_AUTH_MESSAGE_TYPE ||
        event.data.state !== state
      ) {
        return
      }

      if (event.data.error) {
        fail(`yandex/${event.data.error}`)
        return
      }
      if (!event.data.token) {
        fail('yandex/invalid-response')
        return
      }

      cleanup()
      popup.close()

      try {
        const credential = await signInWithCustomToken(auth, event.data.token)
        if (anonymousUser && credential.user.uid !== anonymousUser.uid) {
          await signOut(auth)
          throw new AuthFlowError('yandex/link-uid-mismatch')
        }
        await saveUserProfile(credential.user, { skipOnboarding: true })
        resolve(credential.user)
      } catch (error) {
        reject(error)
      }
    }

    const popupClosedInterval = window.setInterval(() => {
      if (popup.closed) fail('yandex/popup-closed')
    }, 500)
    const timeout = window.setTimeout(
      () => fail('yandex/timeout'),
      5 * 60 * 1000,
    )

    window.addEventListener('message', handleMessage)
    popup.focus()
  })
}

export function signOutCurrentUser() {
  return signOut(auth)
}

const errorMessages: Record<string, string> = {
  'auth/account-exists-with-different-credential':
    'Аккаунт с таким e-mail уже существует. Войдите прежним способом.',
  'auth/email-already-in-use': 'Пользователь с таким e-mail уже существует.',
  'auth/credential-already-in-use':
    'Этот способ входа уже подключён к другому аккаунту.',
  'auth/invalid-credential': 'Неверный e-mail или пароль.',
  'auth/invalid-email': 'Введите корректный e-mail.',
  'auth/network-request-failed':
    'Не удалось связаться с Firebase. Проверьте интернет-соединение.',
  'auth/too-many-requests': 'Слишком много попыток. Попробуйте ещё раз позже.',
  'auth/requires-anonymous-user': 'Этот профиль уже сохранён.',
  'auth/weak-password': 'Пароль должен содержать не менее 6 символов.',
  'yandex/access_denied': 'Вы отменили вход через Яндекс.',
  'yandex/invalid-response': 'Яндекс вернул некорректный ответ.',
  'yandex/credential-already-in-use':
    'Этот Яндекс ID уже подключён к другому профилю.',
  'yandex/link-start-failed':
    'Не удалось начать сохранение профиля через Яндекс. Попробуйте ещё раз.',
  'yandex/link-uid-mismatch':
    'Не удалось сохранить текущий профиль через Яндекс. Войдите снова и повторите попытку.',
  'yandex/not-configured': 'Вход через Яндекс ещё не настроен.',
  'yandex/oauth-failed': 'Яндекс не подтвердил вход. Попробуйте ещё раз.',
  'yandex/popup-blocked': 'Браузер заблокировал окно входа через Яндекс.',
  'yandex/popup-closed': 'Окно входа через Яндекс было закрыто.',
  'yandex/server-error': 'Сервис входа через Яндекс временно недоступен.',
  'yandex/timeout': 'Время ожидания входа через Яндекс истекло.',
}

export function getAuthErrorMessage(error: unknown) {
  if (error instanceof AuthFlowError) {
    return errorMessages[error.code] ?? errorMessages['yandex/server-error']
  }

  if (error instanceof FirebaseError) {
    return (
      errorMessages[error.code] ??
      'Firebase отклонил запрос. Попробуйте ещё раз.'
    )
  }

  return 'Произошла непредвиденная ошибка. Попробуйте ещё раз.'
}
