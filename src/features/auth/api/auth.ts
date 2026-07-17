import { FirebaseError } from 'firebase/app'
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'

import { auth, db } from '@/shared/api/firebase'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

async function saveUserProfile(
  user: User,
  displayName?: string,
  requireOnboarding = false,
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
      : (existingAvatar ?? {
          presetId: null,
          storagePath: null,
          type: resolvedPhotoURL ? 'provider' : 'none',
        })

  await setDoc(userRef, {
    avatar,
    createdAt: existingProfile?.createdAt ?? serverTimestamp(),
    displayName: resolvedDisplayName,
    email: user.email ?? '',
    onboardingCompleted:
      existingProfile?.onboardingCompleted ??
      !(requireOnboarding || isNewProfile),
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
  const credential = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  )

  const displayName = email.trim().split('@')[0].slice(0, 50)
  await updateProfile(credential.user, { displayName: displayName.trim() })
  await saveUserProfile(credential.user, displayName, true)

  return credential.user
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

export async function signInWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider)
  await saveUserProfile(
    credential.user,
    undefined,
    getAdditionalUserInfo(credential)?.isNewUser ?? false,
  )
  return credential.user
}

export function signOutCurrentUser() {
  return signOut(auth)
}

const errorMessages: Record<string, string> = {
  'auth/email-already-in-use': 'Пользователь с таким e-mail уже существует.',
  'auth/invalid-credential': 'Неверный e-mail или пароль.',
  'auth/invalid-email': 'Введите корректный e-mail.',
  'auth/network-request-failed':
    'Не удалось связаться с Firebase. Проверьте интернет-соединение.',
  'auth/popup-blocked': 'Браузер заблокировал окно входа через Google.',
  'auth/popup-closed-by-user': 'Окно входа через Google было закрыто.',
  'auth/too-many-requests': 'Слишком много попыток. Попробуйте ещё раз позже.',
  'auth/weak-password': 'Пароль должен содержать не менее 6 символов.',
}

export function getAuthErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    return (
      errorMessages[error.code] ??
      'Firebase отклонил запрос. Попробуйте ещё раз.'
    )
  }

  return 'Произошла непредвиденная ошибка. Попробуйте ещё раз.'
}
