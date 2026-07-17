import { useEffect, useState } from 'react'

import { db, realtimeDb } from '@/shared/api/firebase'
import { onValue, ref } from 'firebase/database'
import { doc, onSnapshot } from 'firebase/firestore'

export interface RoomParticipant {
  displayName: string
  id: string
  photoURL: null | string
}

interface ParticipantProfile {
  displayName: string
  photoURL: null | string
}

interface RoomParticipantsState {
  error: null | string
  loading: boolean
  participants: RoomParticipant[]
}

const participantNameCollator = new Intl.Collator('ru', {
  sensitivity: 'base',
})

export function useRoomParticipants(roomId: string): RoomParticipantsState {
  const [participants, setParticipants] = useState<RoomParticipant[]>([])
  const [loading, setLoading] = useState(Boolean(roomId))
  const [error, setError] = useState<null | string>(null)

  useEffect(() => {
    setParticipants([])
    setError(null)

    if (!roomId) {
      setLoading(false)
      return
    }

    setLoading(true)

    let activeParticipantIds: string[] = []
    let disposed = false
    let presenceLoaded = false
    const participantsById = new Map<string, RoomParticipant>()
    const resolvedProfileIds = new Set<string>()
    const profileUnsubscribers = new Map<string, () => void>()

    const publishParticipants = () => {
      if (disposed) return

      const nextParticipants = activeParticipantIds
        .map(participantId => participantsById.get(participantId))
        .filter(
          (participant): participant is RoomParticipant =>
            participant !== undefined,
        )
        .sort((firstParticipant, secondParticipant) =>
          participantNameCollator.compare(
            firstParticipant.displayName,
            secondParticipant.displayName,
          ),
        )

      setParticipants(nextParticipants)
      setLoading(
        !presenceLoaded ||
          activeParticipantIds.some(
            participantId => !resolvedProfileIds.has(participantId),
          ),
      )
    }

    const unsubscribePresence = onValue(
      ref(realtimeDb, `roomPresence/${roomId}`),
      snapshot => {
        presenceLoaded = true

        const rawPresence = snapshot.val() as unknown
        const nextParticipantIds =
          rawPresence && typeof rawPresence === 'object'
            ? Object.entries(rawPresence).flatMap(
                ([participantId, connections]) =>
                  connections &&
                  typeof connections === 'object' &&
                  Object.keys(connections).length > 0
                    ? [participantId]
                    : [],
              )
            : []
        const nextParticipantIdSet = new Set(nextParticipantIds)

        for (const [participantId, unsubscribeProfile] of Array.from(
          profileUnsubscribers,
        )) {
          if (nextParticipantIdSet.has(participantId)) continue

          unsubscribeProfile()
          profileUnsubscribers.delete(participantId)
          participantsById.delete(participantId)
          resolvedProfileIds.delete(participantId)
        }

        activeParticipantIds = nextParticipantIds

        for (const participantId of nextParticipantIds) {
          if (profileUnsubscribers.has(participantId)) continue

          const unsubscribeProfile = onSnapshot(
            doc(db, 'users', participantId),
            profileSnapshot => {
              resolvedProfileIds.add(participantId)

              if (profileSnapshot.exists()) {
                const profile = profileSnapshot.data() as ParticipantProfile

                if (profile.displayName.trim()) {
                  participantsById.set(participantId, {
                    displayName: profile.displayName,
                    id: participantId,
                    photoURL: profile.photoURL,
                  })
                }
              } else {
                participantsById.delete(participantId)
              }

              publishParticipants()
            },
            reason => {
              console.error(
                'Не удалось загрузить профиль участника комнаты:',
                reason,
              )
              resolvedProfileIds.add(participantId)
              participantsById.delete(participantId)
              setError('Не удалось загрузить некоторых участников.')
              publishParticipants()
            },
          )

          profileUnsubscribers.set(participantId, unsubscribeProfile)
        }

        publishParticipants()
      },
      reason => {
        console.error('Не удалось загрузить участников комнаты:', reason)
        presenceLoaded = true
        setError('Не удалось загрузить список участников.')
        setLoading(false)
      },
    )

    return () => {
      disposed = true
      unsubscribePresence()
      profileUnsubscribers.forEach(unsubscribeProfile => unsubscribeProfile())
    }
  }, [roomId])

  return { error, loading, participants }
}
