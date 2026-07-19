import { auth, db } from '@/shared/api/firebase'
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'

export async function blockUser(blockedUserId: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы заблокировать пользователя, авторизуйтесь.')
  if (user.uid === blockedUserId) throw new Error('Нельзя заблокировать себя.')

  await setDoc(doc(db, 'users', user.uid, 'blockedUsers', blockedUserId), {
    createdAt: serverTimestamp(),
  })
}

export async function unblockUser(blockedUserId: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы снять блокировку, авторизуйтесь.')
  await deleteDoc(doc(db, 'users', user.uid, 'blockedUsers', blockedUserId))
}
